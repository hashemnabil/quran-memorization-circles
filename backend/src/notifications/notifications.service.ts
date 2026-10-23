import { BadRequestException, ForbiddenException, Injectable, Logger } from '@nestjs/common';
import { BroadcastDto } from './broadcast.dto';
import { Notification, NotificationType, Prisma, Role } from '@prisma/client';
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

export async function recordNotificationChange(tx: Prisma.TransactionClient, row: { id: string; userId: string }) {
  await tx.$queryRaw`SELECT 1 FROM (SELECT pg_advisory_xact_lock(hashtext('quran-sync-journal'), 0)) AS locked`;
  await tx.syncChange.create({ data: { entity: 'notifications', entityId: row.id, operation: 'UPSERT', payload: { id: row.id, userId: row.userId } } });
}

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeGateway,
  ) {}

  async deliver(notification: Notification) {
    try {
      const unreadCount = await this.prisma.notification.count({ where: { userId: notification.userId, isRead: false } });
      this.realtime.emitToUser(notification.userId, 'notification:new', { notification, unreadCount });
    } catch { this.logger.warn('Notification saved; live delivery unavailable'); }
  }

  async broadcast(actor: AuthUser, dto: BroadcastDto) {
    if (actor.role !== Role.ADMIN) throw new ForbiddenException('إرسال الإشعارات متاح للإدارة فقط');
    if (!dto.title.trim() || !dto.body.trim()) throw new BadRequestException('العنوان ونص الإشعار مطلوبان');
    if (dto.selection === 'SELECTED' && !dto.userIds.length) throw new BadRequestException('حدد مستلمًا واحدًا على الأقل');
    if (dto.selection === 'ALL' && dto.userIds.length) throw new BadRequestException('لا ترسل قائمة أشخاص عند اختيار الجميع');
    if (dto.audience === 'CIRCLE') {
      if (!dto.circleId || !await this.prisma.circle.findFirst({ where: { id: dto.circleId, deletedAt: null }, select: { id: true } })) throw new BadRequestException('اختر حلقة موجودة');
    } else if (dto.circleId) throw new BadRequestException('اختيار الحلقة متاح لفئة الحلقات فقط');
    const users = await this.prisma.user.findMany({ where: { isActive: true, deletedAt: null,
      ...(dto.audience === 'ALL' ? {} : dto.audience === 'STAFF' ? { role: { in: [Role.TEACHER, Role.SUPERVISOR, Role.EXAM_COMMITTEE] } } : dto.audience === 'CIRCLE' ? { role: Role.STUDENT, studentProfile: { circleId: dto.circleId, deletedAt: null } } : { role: dto.audience as Role }),
      ...(dto.selection === 'SELECTED' ? { id: { in: dto.userIds } } : {}),
    }, select: { id: true } });
    if (!users.length || dto.selection === 'SELECTED' && users.length !== dto.userIds.length)
      throw new BadRequestException('راجع المستلمين؛ بعض الحسابات غير نشطة أو خارج الفئة المحددة');
    await this.notifyMany(users.map(user => user.id), { type: NotificationType.ANNOUNCEMENT,
      title: dto.title.trim(), body: dto.body.trim(), data: { sentBy: actor.id, source: 'ADMIN_BROADCAST' } });
    return { recipientCount: users.length };
  }

  /** Administrator-only directory, independent of the paginated staff list. */
  async recipients() {
    const [users, circles, withoutAccounts] = await Promise.all([
      this.prisma.user.findMany({ where: { isActive: true, deletedAt: null, role: { not: Role.PARENT } }, orderBy: [{ fullName: 'asc' }, { id: 'asc' }],
        select: { id: true, fullName: true, username: true, role: true, studentProfile: { select: { circleId: true, deletedAt: true } } } }),
      this.prisma.circle.findMany({ where: { deletedAt: null }, select: { id: true, name: true }, orderBy: { name: 'asc' } }),
      this.prisma.student.findMany({ where: { deletedAt: null, userId: null }, select: { id: true, fullName: true, circleId: true }, orderBy: { fullName: 'asc' } }),
    ]);
    return { users: users.filter(user => !user.studentProfile?.deletedAt).map(({ studentProfile, ...user }) => ({ ...user, circleId: studentProfile?.circleId || null })), circles, studentsWithoutAccounts: withoutAccounts };
  }

  /** Persists a notification and pushes it over the socket if the user is connected. */
  async notify(input: CreateNotificationInput) {
    const notification = await this.prisma.$transaction(async tx => {
    const row = await tx.notification.create({
      data: {
        userId: input.userId,
        type: input.type,
        title: input.title,
        body: input.body,
        link: input.link,
        data: input.data as any,
      },
    });
    await recordNotificationChange(tx, row);
    return row;
    });
    await this.deliver(notification);
    return notification;
  }

  async notifyMany(userIds: string[], input: Omit<CreateNotificationInput, 'userId'>) {
    const unique = [...new Set(userIds.filter(Boolean))];
    if (unique.length === 0) return [];
    const notifications = await this.prisma.$transaction(async tx => {
      const saved = [];
      for (const userId of unique) {
      const row = await tx.notification.create({ data: {
        userId,
        type: input.type,
        title: input.title,
        body: input.body,
        link: input.link,
        data: input.data as any,
      } });
      await recordNotificationChange(tx, row);
      saved.push(row);
      }
      return saved;
    });
    for (const notification of notifications) await this.deliver(notification);
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

  /** Student and guardian get their own permitted destination, never staff-only links. */
  async notifyStudent(studentId: string, input: Omit<CreateNotificationInput, 'userId' | 'link'>) {
    const student = await this.prisma.student.findUnique({ where: { id: studentId },
      select: { userId: true, parentProfile: { select: { userId: true } } } });
    const recipients = new Map<string, string>();
    if (student?.parentProfile?.userId) recipients.set(student.parentProfile.userId, `/parent/children/${studentId}`);
    if (student?.userId) recipients.set(student.userId, '/student');
    for (const [userId, link] of recipients) await this.notify({ ...input, userId, link });
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
