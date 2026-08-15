import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { NotificationType, Prisma, Role, TicketStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ActivityService } from '../common/services/activity.service';
import { NotificationsService } from '../notifications/notifications.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { AuthUser } from '../common/decorators';
import { paginate } from '../common/dto/pagination.dto';
import {
  CreateTicketDto,
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

  async create(actor: AuthUser, dto: CreateTicketDto) {
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

    await this.notifications.notifyRoles([Role.SUPPORT, Role.ADMIN], {
      type: NotificationType.SUPPORT_TICKET,
      title: 'طلب دعم فني جديد',
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

    return ticket;
  }

  async findAll(user: AuthUser, query: QueryTicketsDto) {
    const where: Prisma.SupportTicketWhereInput = {
      deletedAt: null,
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

    // Non-staff users only ever see their own tickets.
    if (!this.isStaff(user)) {
      where.createdById = user.id;
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
      this.realtime.emitToUser(ticket.createdById, 'support:message', { ticketId: id, message });
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

    if (dto.assignedToId) {
      const assignee = await this.prisma.user.findFirst({
        where: {
          id: dto.assignedToId,
          deletedAt: null,
          isActive: true,
          role: { in: [Role.SUPPORT, Role.ADMIN] },
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

    if (dto.status && dto.status !== ticket.status) {
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
            where: { deletedAt: null, assignedToId: user.id, status: { in: ['OPEN', 'IN_PROGRESS'] } },
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
