import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { NotificationType, Prisma, RequestStatus, Role, StudentStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AccessControlService } from '../common/services/access-control.service';
import { ActivityService } from '../common/services/activity.service';
import { NotificationsService } from '../notifications/notifications.service';
import { AuthUser } from '../common/decorators';
import { paginate } from '../common/dto/pagination.dto';
import {
  CreateSuspensionDto,
  DecideSuspensionDto,
  QuerySuspensionsDto,
  ReturnStudentDto,
} from './dto/suspension.dto';

function toDateOnly(value: string | Date): Date {
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) throw new BadRequestException('التاريخ غير صالح');
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

const SUSPENSION_INCLUDE = {
  student: {
    select: {
      id: true,
      code: true,
      fullName: true,
      status: true,
      guardianPhone: true,
      parentProfile: { select: { userId: true } },
      circle: { select: { id: true, name: true, code: true } },
    },
  },
  requestedBy: { select: { id: true, fullName: true, role: true } },
  decidedBy: { select: { id: true, fullName: true, role: true } },
} satisfies Prisma.SuspensionRequestInclude;

@Injectable()
export class SuspensionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly acl: AccessControlService,
    private readonly activity: ActivityService,
    private readonly notifications: NotificationsService,
  ) {}

  async request(actor: AuthUser, dto: CreateSuspensionDto) {
    const student = await this.acl.assertStudentWriteAccess(actor, dto.studentId);
    if (student.status === StudentStatus.SUSPENDED) {
      throw new ConflictException('الطالب موقوف بالفعل');
    }

    const pending = await this.prisma.suspensionRequest.findFirst({
      where: { studentId: dto.studentId, status: RequestStatus.PENDING },
    });
    if (pending) throw new ConflictException('يوجد طلب إيقاف معلق لهذا الطالب');

    const startDate = toDateOnly(dto.startDate ?? new Date());
    const endDate = new Date(startDate);
    endDate.setUTCDate(endDate.getUTCDate() + dto.durationDays);

    const request = await this.prisma.suspensionRequest.create({
      data: {
        studentId: dto.studentId,
        reason: dto.reason,
        durationDays: dto.durationDays,
        startDate,
        endDate,
        requestedById: actor.id,
      },
      include: SUSPENSION_INCLUDE,
    });

    await this.notifications.notifyRoles([Role.ADMIN], {
      type: NotificationType.SUSPENSION_REQUEST,
      title: 'طلب إيقاف طالب',
      body: `طلب إيقاف الطالب ${student.fullName} لمدة ${dto.durationDays} يوماً`,
      link: `/suspensions/${request.id}`,
    });

    await this.activity.log({
      userId: actor.id,
      action: 'SUSPENSION_REQUEST',
      summary: `طلب إيقاف الطالب ${student.fullName} لمدة ${dto.durationDays} يوماً`,
      entityType: 'SuspensionRequest',
      entityId: request.id,
    });

    return this.decorate(request);
  }

  async approve(actor: AuthUser, id: string, dto: DecideSuspensionDto) {
    const request = await this.prisma.suspensionRequest.findUnique({
      where: { id },
      include: SUSPENSION_INCLUDE,
    });
    if (!request) throw new NotFoundException('الطلب غير موجود');
    if (request.status !== RequestStatus.PENDING) {
      throw new BadRequestException('تم البت في هذا الطلب مسبقاً');
    }

    await this.prisma.$transaction([
      this.prisma.suspensionRequest.update({
        where: { id },
        data: {
          status: RequestStatus.APPROVED,
          decidedById: actor.id,
          decidedAt: new Date(),
          decisionNote: dto.decisionNote,
        },
      }),
      this.prisma.student.update({
        where: { id: request.studentId },
        data: { status: StudentStatus.SUSPENDED },
      }),
    ]);

    // Re-read so the embedded student carries the new status.
    const updated = await this.prisma.suspensionRequest.findUniqueOrThrow({
      where: { id },
      include: SUSPENSION_INCLUDE,
    });

    await this.notifyDecision(updated, true, dto.decisionNote);

    await this.activity.log({
      userId: actor.id,
      action: 'SUSPENSION_APPROVE',
      summary: `الموافقة على إيقاف الطالب ${request.student.fullName}`,
      entityType: 'SuspensionRequest',
      entityId: id,
    });

    return this.decorate(updated);
  }

  async reject(actor: AuthUser, id: string, dto: DecideSuspensionDto) {
    const request = await this.prisma.suspensionRequest.findUnique({
      where: { id },
      include: SUSPENSION_INCLUDE,
    });
    if (!request) throw new NotFoundException('الطلب غير موجود');
    if (request.status !== RequestStatus.PENDING) {
      throw new BadRequestException('تم البت في هذا الطلب مسبقاً');
    }

    const updated = await this.prisma.suspensionRequest.update({
      where: { id },
      data: {
        status: RequestStatus.REJECTED,
        decidedById: actor.id,
        decidedAt: new Date(),
        decisionNote: dto.decisionNote,
      },
      include: SUSPENSION_INCLUDE,
    });

    await this.notifyDecision(updated, false, dto.decisionNote);

    await this.activity.log({
      userId: actor.id,
      action: 'SUSPENSION_REJECT',
      summary: `رفض طلب إيقاف الطالب ${request.student.fullName}`,
      entityType: 'SuspensionRequest',
      entityId: id,
    });

    return this.decorate(updated);
  }

  /** Brings a suspended student back, either at the end of the period or early. */
  async returnStudent(actor: AuthUser, id: string, dto: ReturnStudentDto) {
    const request = await this.prisma.suspensionRequest.findUnique({
      where: { id },
      include: SUSPENSION_INCLUDE,
    });
    if (!request) throw new NotFoundException('الطلب غير موجود');
    if (request.status !== RequestStatus.APPROVED) {
      throw new BadRequestException('هذا الإيقاف غير سارٍ');
    }
    if (request.returnedAt) throw new BadRequestException('تم إرجاع الطالب مسبقاً');

    await this.prisma.$transaction([
      this.prisma.suspensionRequest.update({
        where: { id },
        data: { returnedAt: new Date(), returnedNote: dto.note },
      }),
      this.prisma.student.update({
        where: { id: request.studentId },
        data: { status: StudentStatus.ACTIVE },
      }),
    ]);

    const updated = await this.prisma.suspensionRequest.findUniqueOrThrow({
      where: { id },
      include: SUSPENSION_INCLUDE,
    });

    await this.notifications.notify({
      userId: request.requestedById,
      type: NotificationType.SUSPENSION_DECISION,
      title: 'عودة طالب من الإيقاف',
      body: `تم إرجاع الطالب ${request.student.fullName} إلى الحلقة`,
      link: `/students/${request.studentId}`,
    });

    if (request.student.parentProfile?.userId) {
      await this.notifications.notify({
        userId: request.student.parentProfile.userId,
        type: NotificationType.SUSPENSION_DECISION,
        title: 'انتهاء فترة الإيقاف',
        body: `تم إرجاع الطالب ${request.student.fullName} إلى الحلقة`,
        link: `/parent/children/${request.studentId}`,
      });
    }

    await this.activity.log({
      userId: actor.id,
      action: 'SUSPENSION_RETURN',
      summary: `إرجاع الطالب ${request.student.fullName} من الإيقاف`,
      entityType: 'SuspensionRequest',
      entityId: id,
    });

    return this.decorate(updated);
  }

  async cancel(actor: AuthUser, id: string) {
    const request = await this.prisma.suspensionRequest.findUnique({ where: { id } });
    if (!request) throw new NotFoundException('الطلب غير موجود');
    if (request.status !== RequestStatus.PENDING) {
      throw new BadRequestException('لا يمكن إلغاء طلب تم البت فيه');
    }
    if (request.requestedById !== actor.id && actor.role !== Role.ADMIN) {
      throw new ForbiddenException('يمكن إلغاء الطلب من قبل مُنشئه أو الإدارة فقط');
    }

    const updated = await this.prisma.suspensionRequest.update({
      where: { id },
      data: { status: RequestStatus.CANCELLED, decidedAt: new Date() },
      include: SUSPENSION_INCLUDE,
    });
    return this.decorate(updated);
  }

  async findAll(user: AuthUser, query: QuerySuspensionsDto) {
    const scope = await this.acl.studentScope(user);

    const where: Prisma.SuspensionRequestWhereInput = {
      student: { ...scope, deletedAt: null },
      ...(query.status ? { status: query.status } : {}),
      ...(query.studentId ? { studentId: query.studentId } : {}),
      ...(query.circleId ? { student: { ...scope, circleId: query.circleId } } : {}),
      ...(query.activeOnly === 'true'
        ? { status: RequestStatus.APPROVED, returnedAt: null, endDate: { gte: this.today() } }
        : {}),
    };

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.suspensionRequest.findMany({
        where,
        include: SUSPENSION_INCLUDE,
        orderBy: { createdAt: query.sortOrder || 'desc' },
        skip: query.skip,
        take: query.take,
      }),
      this.prisma.suspensionRequest.count({ where }),
    ]);

    return paginate(rows.map((r) => this.decorate(r)), total, query.page, query.limit);
  }

  async findOne(user: AuthUser, id: string) {
    const request = await this.prisma.suspensionRequest.findUnique({
      where: { id },
      include: SUSPENSION_INCLUDE,
    });
    if (!request) throw new NotFoundException('الطلب غير موجود');
    await this.acl.assertStudentAccess(user, request.studentId);
    return this.decorate(request);
  }

  /** Currently suspended students with their remaining time. */
  async activeList(user: AuthUser) {
    const scope = await this.acl.studentScope(user);
    const rows = await this.prisma.suspensionRequest.findMany({
      where: {
        student: { ...scope, deletedAt: null },
        status: RequestStatus.APPROVED,
        returnedAt: null,
      },
      include: SUSPENSION_INCLUDE,
      orderBy: { endDate: 'asc' },
    });
    return rows.map((r) => this.decorate(r));
  }

  /**
   * Reactivates students whose suspension period has elapsed.
   * Called opportunistically by the dashboard so no scheduler is required.
   */
  async releaseExpired() {
    const expired = await this.prisma.suspensionRequest.findMany({
      where: {
        status: RequestStatus.APPROVED,
        returnedAt: null,
        endDate: { lt: this.today() },
      },
      select: { id: true, studentId: true },
    });
    if (expired.length === 0) return { released: 0 };

    await this.prisma.$transaction([
      this.prisma.suspensionRequest.updateMany({
        where: { id: { in: expired.map((e) => e.id) } },
        data: { returnedAt: new Date(), returnedNote: 'انتهاء المدة تلقائياً' },
      }),
      this.prisma.student.updateMany({
        where: { id: { in: expired.map((e) => e.studentId) }, status: StudentStatus.SUSPENDED },
        data: { status: StudentStatus.ACTIVE },
      }),
    ]);

    return { released: expired.length };
  }

  async pendingCount() {
    return this.prisma.suspensionRequest.count({ where: { status: RequestStatus.PENDING } });
  }

  // -------------------------------------------------------------------------

  private decorate(request: any) {
    const remainingDays =
      request.status === RequestStatus.APPROVED && !request.returnedAt
        ? Math.max(0, Math.ceil((new Date(request.endDate).getTime() - Date.now()) / 86400000))
        : 0;
    return {
      ...request,
      remainingDays,
      isActive: request.status === RequestStatus.APPROVED && !request.returnedAt && remainingDays > 0,
    };
  }

  private async notifyDecision(request: any, approved: boolean, note?: string) {
    await this.notifications.notify({
      userId: request.requestedById,
      type: NotificationType.SUSPENSION_DECISION,
      title: approved ? 'تمت الموافقة على طلب الإيقاف' : 'تم رفض طلب الإيقاف',
      body: `الطالب ${request.student.fullName}${note ? ` — ${note}` : ''}`,
      link: `/suspensions/${request.id}`,
    });

    if (approved && request.student.parentProfile?.userId) {
      await this.notifications.notify({
        userId: request.student.parentProfile.userId,
        type: NotificationType.SUSPENSION_DECISION,
        title: 'إشعار إيقاف',
        body: `تم إيقاف الطالب ${request.student.fullName} لمدة ${request.durationDays} يوماً. السبب: ${request.reason}`,
        link: `/parent/children/${request.studentId}`,
      });
    }
  }

  private today() {
    const d = new Date();
    return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  }
}
