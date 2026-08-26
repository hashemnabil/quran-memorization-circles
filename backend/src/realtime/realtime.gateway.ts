import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Real-time transport for chat messages and notifications only.
 * All regular CRUD stays on the REST API.
 */
@WebSocketGateway({
  cors: {
    origin: (process.env.CORS_ORIGINS || 'http://localhost:5173').split(','),
    credentials: true,
  },
  namespace: '/realtime',
})
export class RealtimeGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger('Realtime');
  /** userId -> set of socket ids (a user may have several tabs / devices open). */
  private readonly online = new Map<string, Set<string>>();

  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  async handleConnection(client: Socket) {
    try {
      const token =
        (client.handshake.auth?.token as string) ||
        (client.handshake.headers?.authorization as string)?.replace('Bearer ', '');

      if (!token) throw new Error('missing token');

      const payload = await this.jwt.verifyAsync(token, {
        secret: this.config.get('JWT_ACCESS_SECRET'),
      });

      const user = await this.prisma.user.findFirst({
        where: { id: payload.sub, deletedAt: null, isActive: true },
        select: { id: true, fullName: true, role: true },
      });
      if (!user) throw new Error('user unavailable');

      client.data.user = user;

      // Personal room: notifications are addressed to `user:<id>`.
      client.join(`user:${user.id}`);
      client.join(`role:${user.role}`);

      // Conversation rooms the user is a member of.
      const memberships = await this.prisma.conversationMember.findMany({
        where: { userId: user.id, leftAt: null },
        select: { conversationId: true },
      });
      memberships.forEach((m) => client.join(`conversation:${m.conversationId}`));

      const sockets = this.online.get(user.id) ?? new Set<string>();
      sockets.add(client.id);
      this.online.set(user.id, sockets);

      if (sockets.size === 1) {
        this.server.emit('presence:update', { userId: user.id, online: true });
      }

      client.emit('connected', { userId: user.id, onlineUsers: [...this.online.keys()] });
    } catch (error) {
      client.emit('unauthorized', { message: 'رمز الدخول غير صالح' });
      client.disconnect(true);
    }
  }

  handleDisconnect(client: Socket) {
    const userId = client.data?.user?.id as string | undefined;
    if (!userId) return;
    const sockets = this.online.get(userId);
    if (!sockets) return;
    sockets.delete(client.id);
    if (sockets.size === 0) {
      this.online.delete(userId);
      this.server.emit('presence:update', { userId, online: false });
    }
  }

  @SubscribeMessage('conversation:join')
  async joinConversation(@ConnectedSocket() client: Socket, @MessageBody() body: { conversationId: string }) {
    const userId = client.data?.user?.id;
    if (!userId || !body?.conversationId) return { ok: false };

    const member = await this.prisma.conversationMember.findFirst({
      where: { conversationId: body.conversationId, userId, leftAt: null },
      select: { id: true },
    });
    if (!member) return { ok: false, message: 'لست عضواً في هذه المحادثة' };

    client.join(`conversation:${body.conversationId}`);
    return { ok: true };
  }

  @SubscribeMessage('conversation:leave')
  leaveConversation(@ConnectedSocket() client: Socket, @MessageBody() body: { conversationId: string }) {
    if (body?.conversationId) client.leave(`conversation:${body.conversationId}`);
    return { ok: true };
  }

  @SubscribeMessage('typing')
  typing(@ConnectedSocket() client: Socket, @MessageBody() body: { conversationId: string; isTyping: boolean }) {
    const user = client.data?.user;
    if (!user || !body?.conversationId) return;
    client.to(`conversation:${body.conversationId}`).emit('typing', {
      conversationId: body.conversationId,
      userId: user.id,
      fullName: user.fullName,
      isTyping: !!body.isTyping,
    });
  }

  // ---- server-side emitters used by the services -------------------------

  emitToUser(userId: string, event: string, payload: unknown) {
    this.server?.to(`user:${userId}`).emit(event, payload);
  }

  emitToUsers(userIds: string[], event: string, payload: unknown) {
    userIds.forEach((id) => this.emitToUser(id, event, payload));
  }

  emitToConversation(conversationId: string, event: string, payload: unknown) {
    this.server?.to(`conversation:${conversationId}`).emit(event, payload);
  }

  isOnline(userId: string) {
    return this.online.has(userId);
  }

  onlineUserIds() {
    return [...this.online.keys()];
  }
}
