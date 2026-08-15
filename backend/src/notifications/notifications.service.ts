import { Injectable, Logger } from '@nestjs/common';
import { NotificationType, Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { AuthUser } from '../common/decorators';
import { PaginationDto, paginate } from '../common/dto/pagination.dto';

export interface CreateNotificationInput {
  userId: string;
  type: NotificationType;
  title: string;
  body?: string;
  link?: string;
  data?: Record<string, any>;
}

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeGateway,
  ) {}

  /** Persists a notification and pushes it over the socket if the user is connected. */
  async notify(input: CreateNotificationInput) {
    const notification = await this.prisma.notification.create({
      data: {
        userId: input.userId,
        type: input.type,
        title: input.title,
        body: input.body,
        link: input.link,
        data: input.data as any,
      },
    });
    const unreadCount = await this.prisma.notification.count({
      where: { userId: input.userId, isRead: false },
    });
    this.realtime.emitToUser(input.userId, 'notification:new', { notification, unreadCount });
    return notification;
  }

  async notifyMany(userIds: string[], input: Omit<CreateNotificationInput, 'userId'>) {
    const unique = [...new Set(userIds.filter(Boolean))];
    if (unique.length === 0) return [];
    await this.prisma.notification.createMany({
      data: unique.map((userId) => ({
        userId,
        type: input.type,
        title: input.title,
        body: input.body,
        link: input.link,
        data: input.data as any,
      })),
    });
    for (const userId of unique) {
      const unreadCount = await this.prisma.notification.count({ where: { userId, isRead: false } });
      this.realtime.emitToUser(userId, 'notification:new', {
        notification: { type: input.type, title: input.title, body: input.body, link: input.link },
        unreadCount,
      });
    }
    return unique;
  }

  /** Convenience helper: notify everyone holding one of the given roles. */
  async notifyRoles(roles: Role[], input: Omit<CreateNotificationInput, 'userId'>) {
    const users = await this.prisma.user.findMany({
      where: { role: { in: roles }, isActive: true, deletedAt: null },
      select: { id: true },
    });
    return this.notifyMany(users.map((u) => u.id), input);
  }

  async list(user: AuthUser, query: PaginationDto & { unreadOnly?: boolean }) {
    const where = {
      userId: user.id,
      ...(String(query.unreadOnly) === 'true' ? { isRead: false } : {}),
    };
    const [data, total, unreadCount] = await this.prisma.$transaction([
      this.prisma.notification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: query.skip,
        take: query.take,
      }),
      this.prisma.notification.count({ where }),
      this.prisma.notification.count({ where: { userId: user.id, isRead: false } }),
    ]);
    return { ...paginate(data, total, query.page, query.limit), unreadCount };
  }

  async unreadCount(user: AuthUser) {
    const count = await this.prisma.notification.count({ where: { userId: user.id, isRead: false } });
    return { count };
  }

  async markRead(user: AuthUser, id: string) {
    await this.prisma.notification.updateMany({
      where: { id, userId: user.id, isRead: false },
      data: { isRead: true, readAt: new Date() },
    });
    return this.unreadCount(user);
  }

  async markAllRead(user: AuthUser) {
    await this.prisma.notification.updateMany({
      where: { userId: user.id, isRead: false },
      data: { isRead: true, readAt: new Date() },
    });
    return { count: 0 };
  }

  async remove(user: AuthUser, id: string) {
    await this.prisma.notification.deleteMany({ where: { id, userId: user.id } });
    return { message: 'تم حذف الإشعار' };
  }
}
