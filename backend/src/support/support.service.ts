import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { NotificationType, Prisma, Role, TicketPriority, TicketStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ActivityService } from '../common/services/activity.service';
import { NotificationsService } from '../notifications/notifications.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { AuthUser } from '../common/decorators';
import { paginate } from '../common/dto/pagination.dto';
import * as bcrypt from 'bcryptjs';
import {
  CreateTicketDto,
  AccountDeletionDto,
  PublicTicketDto,
  QueryTicketsDto,
  ReplyTicketDto,
  UpdateTicketDto,
} from './dto/support.dto';

const TICKET_INCLUDE = {
  createdBy: { select: { id: true, fullName: true, role: true, avatarUrl: true } },
  assignedTo: { select: { id: true, fullName: true, role: true } },
  _count: { select: { messages: true } },
} satisfies Prisma.SupportTicketInclude;

@Injectable()
export class SupportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly activity: ActivityService,
    private readonly notifications: NotificationsService,
    private readonly realtime: RealtimeGateway,
  ) {}

  private isStaff(user: AuthUser) {
    return user.role === Role.SUPPORT || user.role === Role.ADMIN;
  }

  async requestDeletion(actor: AuthUser, dto: AccountDeletionDto) {
    const account = await this.prisma.user.findFirst({ where: { id: actor.id, isActive: true, deletedAt: null }, select: { passwordHash: true } });
    if (!account || !await bcrypt.compare(dto.currentPassword, account.passwordHash)) throw new BadRequestException('تعذر التحقق من بيانات الحساب');
    const existing = await this.prisma.supportTicket.findFirst({ where: { createdById: actor.id, category: 'ACCOUNT_DELETION', deletedAt: null, status: { in: ['OPEN', 'IN_PROGRESS'] } }, include: TICKET_INCLUDE });
    if (existing) return existing;
    return this.create(actor, { subject: 'طلب حذف حسابي وبياناتي', category: 'ACCOUNT_DELETION', priority: TicketPriority.HIGH,
      description: `طلب صاحب الحساب حذف حسابه وبياناته بعد التحقق من كلمة المرور الحالية.\n${dto.reason?.trim() || ''}\nيجب أن تحدد الإدارة السجلات التي يمكن حذفها أو إخفاء هويتها وما يتطلب احتفاظًا مشروعًا قبل التنفيذ.` }, true);
  }
  async create(actor: AuthUser, dto: CreateTicketDto, verifiedDeletion = false) {
    if (['ACCOUNT_DELETION', 'PASSWORD_RESET'].includes(dto.category || '') && !verifiedDeletion) throw new BadRequestException('استخدم صفحة الطلب المخصصة للتحقق من الهوية');
    const ticket = await this.prisma.supportTicket.create({
      data: {
        subject: dto.subject,
        description: dto.description,
        category: dto.category,
        priority: dto.priority,
        createdById: actor.id,
        messages: {
          create: { senderId: actor.id, body: dto.description },
        },
      },
      include: TICKET_INCLUDE,
    });

    await this.notifications.notifyRoles(verifiedDeletion ? [Role.ADMIN] : [Role.SUPPORT, Role.ADMIN], {
      type: NotificationType.SUPPORT_TICKET,
      title: verifiedDeletion ? 'طلب حذف حساب وبيانات يحتاج مراجعة الإدارة' : 'طلب دعم فني جديد',
      body: `${actor.fullName}: ${dto.subject}`,
      link: `/support/${ticket.id}`,
    });

    await this.activity.log({
      userId: actor.id,
      action: 'TICKET_CREATE',
      summary: `إنشاء طلب دعم فني #${ticket.number}: ${dto.subject}`,
      entityType: 'SupportTicket',
      entityId: ticket.id,
    });

    await this.notifications.notify({ userId: actor.id, type: NotificationType.SUPPORT_TICKET,
      title: `تم تقديم طلبك #${ticket.number}`, body: 'طلبك بانتظار المراجعة', link: `/support/${ticket.id}` });
    return ticket;
  }

  /**
   * A ticket raised from the login page, with no authenticated author.
   *
   * Throttled per client because it is the one write endpoint reachable without
   * a token; a stuck retry loop or a bored visitor should not be able to fill
   * the support queue.
   */
  async createPublic(dto: PublicTicketDto, clientKey: string) {
    const isDonationNote = dto.subject === 'ملاحظة تبرع';
    if (isDonationNote) {
      const campaign = await this.prisma.schoolSettings.findUnique({ where: { id: 'default' }, select: { donationsEnabled: true } });
      if (!campaign?.donationsEnabled) throw new BadRequestException('حملة التبرعات غير مفعّلة حاليًا');
    }
    if (dto.requestId) {
      const existing = await this.prisma.supportTicket.findUnique({ where: { id: dto.requestId }, select: { number: true, subject: true, description: true, contactName: true, contactPhone: true, contactEmail: true, createdById: true } });
      if (existing) {
        if (existing.createdById || existing.subject !== dto.subject || existing.description !== dto.description || existing.contactName !== dto.contactName || (existing.contactPhone || '') !== (dto.contactPhone || '') || (existing.contactEmail || '') !== (dto.contactEmail || '')) throw new BadRequestException('معرف الطلب مستخدم لبيانات مختلفة');
        return { number: existing.number, message: 'سبق استلام الطلب؛ لا حاجة لإرساله مرة أخرى' };
      }
    }
    this.assertNotFlooding(clientKey);

    const ticket = await this.prisma.supportTicket.create({
      data: {
        ...(dto.requestId ? { id: dto.requestId } : {}),
        subject: dto.subject,
        description: dto.description,
        category: isDonationNote ? 'DONATION' : dto.subject === 'طلب تغيير كلمة المرور' ? 'PASSWORD_RESET' : 'تعذر تسجيل الدخول',
        priority: TicketPriority.HIGH,
        createdById: null,
        contactName: dto.contactName,
        contactPhone: dto.contactPhone || null,
        contactEmail: dto.contactEmail || null,
      },
      select: { id: true, number: true, createdAt: true },
    });

    await this.notifications.notifyRoles(isDonationNote || dto.subject === 'طلب تغيير كلمة المرور' ? [Role.ADMIN] : [Role.SUPPORT, Role.ADMIN], {
      type: NotificationType.SUPPORT_TICKET,
      title: isDonationNote ? 'وصلت ملاحظة من متبرع' : dto.subject === 'طلب تغيير كلمة المرور' ? 'طلب تغيير كلمة مرور جديد' : 'طلب دعم من صفحة الدخول',
      body: `${dto.contactName}: ${dto.subject}`,
      link: `/support/${ticket.id}`,
    });

    await this.activity.log({
      action: 'TICKET_CREATE_PUBLIC',
      summary: `طلب دعم من صفحة الدخول #${ticket.number}: ${dto.subject}`,
      entityType: 'SupportTicket',
      entityId: ticket.id,
    });

    // The ticket number is the only thing handed back — enough for the person
    // to quote on the phone, and nothing that leaks who else has written in.
    return {
      number: ticket.number,
      message: `تم استلام طلبك برقم #${ticket.number}، وسيتم التواصل معك قريباً`,
    };
  }

  /** In-memory rate limit: at most 3 public tickets per client per hour. */
  private readonly publicSubmissions = new Map<string, number[]>();

  private assertNotFlooding(clientKey: string) {
    const now = Date.now();
    const windowMs = 60 * 60 * 1000;
    const recent = (this.publicSubmissions.get(clientKey) ?? []).filter(
      (t) => now - t < windowMs,
    );
    if (recent.length >= 3) {
      throw new BadRequestException(
        'تم استلام عدة طلبات من هذا الجهاز، يرجى المحاولة لاحقاً أو الاتصال بالمدرسة',
      );
    }
    recent.push(now);
    this.publicSubmissions.set(clientKey, recent);

    // Keep the map from growing without bound on a long-running process.
    if (this.publicSubmissions.size > 5000) {
      for (const [key, stamps] of this.publicSubmissions) {
        if (!stamps.some((t) => now - t < windowMs)) this.publicSubmissions.delete(key);
      }
    }
  }

  async findAll(user: AuthUser, query: QueryTicketsDto) {
    const where: Prisma.SupportTicketWhereInput = {
      deletedAt: null,
      ...(query.category ? { category: query.category } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.priority ? { priority: query.priority } : {}),
      ...(query.assignedToId ? { assignedToId: query.assignedToId } : {}),
      ...(query.search
        ? {
            OR: [
              { subject: { contains: query.search, mode: 'insensitive' } },
              { description: { contains: query.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    if (user.role !== Role.ADMIN) where.AND = [{ OR: [{ category: null }, { category: { notIn: ['PASSWORD_RESET', 'ACCOUNT_DELETION'] } }, { category: 'ACCOUNT_DELETION', createdById: user.id }] }];

    // Non-staff users only ever see their own tickets. The assignee filter is
    // dropped too — it is a way to enumerate other people's queues.
    if (!this.isStaff(user)) {
      where.createdById = user.id;
      delete where.assignedToId;
    } else if (query.mine === 'true') {
      where.assignedToId = user.id;
    }

    const [data, total] = await this.prisma.$transaction([
      this.prisma.supportTicket.findMany({
        where,
        include: TICKET_INCLUDE,
        orderBy: { updatedAt: query.sortOrder || 'desc' },
        skip: query.skip,
        take: query.take,
      }),
      this.prisma.supportTicket.count({ where }),
    ]);

    return paginate(data, total, query.page, query.limit);
  }

  async findOne(user: AuthUser, id: string) {
    const ticket = await this.prisma.supportTicket.findFirst({
      where: { id, deletedAt: null },
      include: {
        ...TICKET_INCLUDE,
        messages: {
          where: this.isStaff(user) ? {} : { isInternal: false },
          include: { sender: { select: { id: true, fullName: true, role: true, avatarUrl: true } } },
          orderBy: { createdAt: 'asc' },
        },
      },
    });
    if (!ticket) throw new NotFoundException('طلب الدعم غير موجود');
    if (ticket.category === 'PASSWORD_RESET' && user.role !== Role.ADMIN) throw new ForbiddenException('هذا الطلب مخصص للإدارة');
    if (ticket.category === 'ACCOUNT_DELETION' && user.role !== Role.ADMIN && ticket.createdById !== user.id) throw new ForbiddenException('لا تملك صلاحية الوصول إلى الطلب');
    if (!this.isStaff(user) && ticket.createdById !== user.id) {
      throw new ForbiddenException('لا تملك صلاحية الوصول إلى هذا الطلب');
    }
    return ticket;
  }

  async reply(actor: AuthUser, id: string, dto: ReplyTicketDto) {
    const ticket = await this.prisma.supportTicket.findFirst({
      where: { id, deletedAt: null },
      include: { createdBy: { select: { id: true, fullName: true } } },
    });
    if (!ticket) throw new NotFoundException('طلب الدعم غير موجود');
    if (ticket.category === 'PASSWORD_RESET' && actor.role !== Role.ADMIN) throw new ForbiddenException('هذا الطلب مخصص للإدارة');
    if (ticket.category === 'ACCOUNT_DELETION' && actor.role !== Role.ADMIN && ticket.createdById !== actor.id) throw new ForbiddenException('لا تملك صلاحية الوصول إلى الطلب');

    const staff = this.isStaff(actor);
    if (!staff && ticket.createdById !== actor.id) {
      throw new ForbiddenException('لا تملك صلاحية الرد على هذا الطلب');
    }
    if (ticket.status === TicketStatus.CLOSED) {
      throw new BadRequestException('هذا الطلب مغلق، يرجى إنشاء طلب جديد');
    }
    if (dto.isInternal && !staff) {
      throw new ForbiddenException('الملاحظات الداخلية متاحة لفريق الدعم فقط');
    }

    const message = await this.prisma.ticketMessage.create({
      data: {
        ticketId: id,
        senderId: actor.id,
        body: dto.body,
        isInternal: !!dto.isInternal && staff,
      },
      include: { sender: { select: { id: true, fullName: true, role: true, avatarUrl: true } } },
    });

    // A staff reply moves an open ticket into progress and claims it if unassigned.
    await this.prisma.supportTicket.update({
      where: { id },
      data: {
        updatedAt: new Date(),
        ...(staff && ticket.status === TicketStatus.OPEN
          ? { status: TicketStatus.IN_PROGRESS, assignedToId: ticket.assignedToId ?? actor.id }
          : {}),
      },
    });

    if (staff && ticket.status === TicketStatus.OPEN && ticket.createdById) {
      await this.notifications.notify({ userId: ticket.createdById, type: NotificationType.SUPPORT_TICKET,
        title: `طلبك #${ticket.number} قيد المعالجة`, body: 'بدأ فريق الدعم معالجة الطلب', link: `/support/${id}` });
    }
    if (!message.isInternal) {
      const recipient = staff ? ticket.createdById : ticket.assignedToId;
      if (recipient && recipient !== actor.id) {
        await this.notifications.notify({
          userId: recipient,
          type: NotificationType.SUPPORT_REPLY,
          title: `رد جديد على الطلب #${ticket.number}`,
          body: dto.body.slice(0, 120),
          link: `/support/${id}`,
        });
      } else if (staff === false && !ticket.assignedToId) {
        await this.notifications.notifyRoles([Role.SUPPORT], {
          type: NotificationType.SUPPORT_REPLY,
          title: `رد جديد على الطلب #${ticket.number}`,
          body: dto.body.slice(0, 120),
          link: `/support/${id}`,
        });
      }
      // A ticket raised from the login screen has no account behind it, so
      // there is nobody to push the reply to.
      if (ticket.createdById) {
        this.realtime.emitToUser(ticket.createdById, 'support:message', { ticketId: id, message });
      }
      if (ticket.assignedToId) {
        this.realtime.emitToUser(ticket.assignedToId, 'support:message', { ticketId: id, message });
      }
    }

    return message;
  }

  async update(actor: AuthUser, id: string, dto: UpdateTicketDto) {
    if (!this.isStaff(actor)) throw new ForbiddenException('هذا الإجراء متاح لفريق الدعم فقط');

    const ticket = await this.prisma.supportTicket.findFirst({ where: { id, deletedAt: null } });
    if (!ticket) throw new NotFoundException('طلب الدعم غير موجود');
    if (ticket.category === 'PASSWORD_RESET' && actor.role !== Role.ADMIN) throw new ForbiddenException('هذا الطلب مخصص للإدارة');
    if (ticket.category === 'PASSWORD_RESET' && dto.category && dto.category !== 'PASSWORD_RESET') throw new BadRequestException('لا يمكن تغيير نوع طلب استعادة الحساب');
    if (ticket.category === 'ACCOUNT_DELETION' && (actor.role !== Role.ADMIN || dto.category && dto.category !== 'ACCOUNT_DELETION')) throw new ForbiddenException('طلبات الحذف مخصصة للإدارة ولا يمكن تغيير نوعها');

    if (dto.assignedToId) {
      const assignee = await this.prisma.user.findFirst({
        where: {
          id: dto.assignedToId,
          deletedAt: null,
          isActive: true,
          role: { in: ['PASSWORD_RESET', 'ACCOUNT_DELETION'].includes(ticket.category || '') ? [Role.ADMIN] : [Role.SUPPORT, Role.ADMIN] },
        },
      });
      if (!assignee) throw new BadRequestException('المستخدم المحدد ليس من فريق الدعم');
    }

    const updated = await this.prisma.supportTicket.update({
      where: { id },
      data: {
        status: dto.status,
        priority: dto.priority,
        category: dto.category,
        ...(dto.assignedToId !== undefined ? { assignedToId: dto.assignedToId || null } : {}),
        ...(dto.status === TicketStatus.RESOLVED ? { resolvedAt: new Date() } : {}),
        ...(dto.status === TicketStatus.CLOSED ? { closedAt: new Date() } : {}),
      },
      include: TICKET_INCLUDE,
    });

    if (dto.status && dto.status !== ticket.status && ticket.createdById) {
      await this.notifications.notify({
        userId: ticket.createdById,
        type: NotificationType.SUPPORT_TICKET,
        title: `تحديث حالة الطلب #${ticket.number}`,
        body: `الحالة الجديدة: ${this.statusLabel(dto.status)}`,
        link: `/support/${id}`,
      });
    }
    if (dto.assignedToId && dto.assignedToId !== ticket.assignedToId) {
      await this.notifications.notify({
        userId: dto.assignedToId,
        type: NotificationType.SUPPORT_TICKET,
        title: `تم إسناد الطلب #${ticket.number} إليك`,
        body: ticket.subject,
        link: `/support/${id}`,
      });
    }

    await this.activity.log({
      userId: actor.id,
      action: 'TICKET_UPDATE',
      summary: `تحديث طلب الدعم #${ticket.number}`,
      entityType: 'SupportTicket',
      entityId: id,
    });

    return updated;
  }

  async stats(user: AuthUser) {
    const base: Prisma.SupportTicketWhereInput = {
      deletedAt: null,
      ...(this.isStaff(user) ? {} : { createdById: user.id }),
    };
    if (user.role !== Role.ADMIN) base.AND = [{ OR: [{ category: null }, { category: { notIn: ['PASSWORD_RESET', 'ACCOUNT_DELETION'] } }, { category: 'ACCOUNT_DELETION', createdById: user.id }] }];

    const grouped = await this.prisma.supportTicket.groupBy({
      by: ['status'],
      where: base,
      _count: { _all: true },
    });

    const counts = { OPEN: 0, IN_PROGRESS: 0, RESOLVED: 0, CLOSED: 0 } as Record<TicketStatus, number>;
    grouped.forEach((g) => (counts[g.status] = g._count._all));

    return {
      ...counts,
      total: Object.values(counts).reduce((a, b) => a + b, 0),
      assignedToMe: this.isStaff(user)
        ? await this.prisma.supportTicket.count({
            where: { ...base, assignedToId: user.id, status: { in: ['OPEN', 'IN_PROGRESS'] } },
          })
        : 0,
    };
  }

  /** Support staff available for assignment. */
  staff() {
    return this.prisma.user.findMany({
      where: { role: { in: [Role.SUPPORT, Role.ADMIN] }, isActive: true, deletedAt: null },
      select: { id: true, fullName: true, role: true },
      orderBy: { fullName: 'asc' },
    });
  }

  private statusLabel(status: TicketStatus) {
    const labels: Record<TicketStatus, string> = {
      OPEN: 'مفتوح',
      IN_PROGRESS: 'قيد المعالجة',
      RESOLVED: 'تم الحل',
      CLOSED: 'مغلق',
    };
    return labels[status];
  }
}
