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
import { AccessControlService } from '../common/services/access-control.service';

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
  private dataRevision = '';

  private async currentRevision() {
    const rows = await this.prisma.$queryRaw<Array<{ seq: bigint }>>`SELECT COALESCE(MAX("seq"), 0)::bigint AS "seq" FROM sync_changes`;
    return rows[0].seq.toString();
  }
  async notifyDataChanged() {
    const revision = await this.currentRevision();
    if (BigInt(revision) <= BigInt(this.dataRevision || '-1')) return;
    this.dataRevision = revision;
    // No record content is broadcast. Reads still enforce each account's scope.
    this.server?.to(['role:ADMIN', 'role:SUPERVISOR', 'role:TEACHER', 'role:STUDENT', 'role:PARENT', 'role:SUPPORT', 'role:EXAM_COMMITTEE']).emit('data:changed', { revision: this.dataRevision });
  }

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
        select: { id: true, fullName: true, role: true, teacher: { select: { id: true, isActive: true, deletedAt: true } } },
      });
      if (!user) throw new Error('user unavailable');
      if (user.role === 'TEACHER' && (!user.teacher?.isActive || user.teacher.deletedAt)) throw new Error('teacher unavailable');

      if (user.role === 'PARENT' || typeof payload.sid !== 'string') throw new Error('session unavailable');
      const session = await this.prisma.refreshToken.findFirst({ where: { id: payload.sid, userId: user.id, revokedAt: null, expiresAt: { gt: new Date() } }, select: { id: true } });
      if (!session) throw new Error('session revoked');
      client.data.sessionId = payload.sid;
      client.data.tokenExpiresAt = payload.exp * 1000;
      if (!Number.isFinite(client.data.tokenExpiresAt) || client.data.tokenExpiresAt <= Date.now()) throw new Error('token expired');
      client.data.user = { ...user, teacherId: user.teacher?.id };
      client.data.expiryTimer = setTimeout(() => client.disconnect(true), Math.max(0, Math.min(2147483647, client.data.tokenExpiresAt - Date.now())));

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
        void this.presence(user.id, true);
      }

      const filter = await new AccessControlService(this.prisma).contactableUserFilter(client.data.user);
      const contacts = filter === null ? [] : await this.prisma.user.findMany({ where: { AND: [{ id: { in: [...this.online.keys()] }, isActive: true, deletedAt: null }, filter] }, select: { id: true } });
      client.emit('connected', { userId: user.id, onlineUsers: contacts.map(row => row.id) });
      client.emit('data:changed', { revision: await this.currentRevision() });
    } catch (error) {
      client.emit('unauthorized', { message: 'رمز الدخول غير صالح' });
      client.disconnect(true);
    }
  }

  handleDisconnect(client: Socket) {
    clearTimeout(client.data?.expiryTimer);
    const userId = client.data?.user?.id as string | undefined;
    if (!userId) return;
    const sockets = this.online.get(userId);
    if (!sockets) return;
    sockets.delete(client.id);
    if (sockets.size === 0) {
      this.online.delete(userId);
      void this.presence(userId, false);
    }
  }

  @SubscribeMessage('conversation:join')
  async joinConversation(@ConnectedSocket() client: Socket, @MessageBody() body: { conversationId: string }) {
    if (!await this.authorized(client)) return { ok: false };
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
  async typing(@ConnectedSocket() client: Socket, @MessageBody() body: { conversationId: string; isTyping: boolean }) {
    if (!await this.authorized(client)) return;
    const user = client.data?.user;
    if (!user || !body?.conversationId) return;
    const member = await this.prisma.conversationMember.findFirst({ where: { conversationId: body.conversationId, userId: user.id, leftAt: null }, select: { id: true } });
    if (!member) return;
    client.to(`conversation:${body.conversationId}`).emit('typing', {
      conversationId: body.conversationId,
      userId: user.id,
      fullName: user.fullName,
      isTyping: !!body.isTyping,
    });
  }

  // ---- server-side emitters used by the services -------------------------

  emitToUser(userId: string, event: string, payload: unknown) {
    void this.emitChecked(`user:${userId}`, event, payload);
    if (event === 'notification:new') void this.notifyDataChanged().catch(() => undefined);
  }

  emitToUsers(userIds: string[], event: string, payload: unknown) {
    userIds.forEach((id) => this.emitToUser(id, event, payload));
  }

  emitToConversation(conversationId: string, event: string, payload: unknown) {
    void this.emitChecked(`conversation:${conversationId}`, event, payload, conversationId);
  }

  private async authorized(client: any): Promise<boolean> {
    try {
      const identity = client.data?.user;
      if (!identity || !client.data.sessionId || !Number.isFinite(client.data.tokenExpiresAt) || client.data.tokenExpiresAt <= Date.now()) throw new Error();
      const session = await this.prisma.refreshToken.findFirst({ where: { id: client.data.sessionId, userId: identity.id, revokedAt: null, expiresAt: { gt: new Date() }, user: { isActive: true, deletedAt: null, role: identity.role } }, select: { id: true, user: { select: { role: true, teacher: { select: { isActive: true, deletedAt: true } } } } } });
      if (!session || session.user.role === 'TEACHER' && (!session.user.teacher?.isActive || session.user.teacher.deletedAt)) throw new Error();
      return true;
    } catch { client.disconnect(true); return false; }
  }
  private async emitChecked(room: string, event: string, payload: unknown, conversationId?: string) {
    try {
      for (const client of await this.server.in(room).fetchSockets()) {
        if (!await this.authorized(client)) continue;
        if (conversationId && !await this.prisma.conversationMember.findFirst({ where: { conversationId, userId: client.data.user.id, leftAt: null }, select: { id: true } })) { client.leave(room); continue; }
        client.emit(event, payload);
      }
    } catch { this.logger.warn('Live delivery unavailable; persisted records remain authoritative'); }
  }
  private async presence(userId: string, online: boolean) {
    try {
      for (const receiver of await this.server.fetchSockets()) {
        if (!await this.authorized(receiver)) continue;
        const filter = await new AccessControlService(this.prisma).contactableUserFilter(receiver.data.user);
        if (filter !== null && await this.prisma.user.findFirst({ where: { AND: [{ id: userId, deletedAt: null }, filter] }, select: { id: true } })) receiver.emit('presence:update', { userId, online });
      }
    } catch { this.logger.warn('Presence update unavailable'); }
  }

  isOnline(userId: string) {
    return this.online.has(userId);
  }

  onlineUserIds() {
    return [...this.online.keys()];
  }
}
