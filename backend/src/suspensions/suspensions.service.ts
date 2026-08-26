import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  NotificationType,
  Prisma,
  RequestStatus,
  Role,
  StudentStatus,
  SuspensionAction,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AccessControlService } from '../common/services/access-control.service';
import { ActivityService } from '../common/services/activity.service';
import { NotificationsService } from '../notifications/notifications.service';
import { AuthUser } from '../common/decorators';
import { paginate } from '../common/dto/pagination.dto';
import {
  ApproveSuspensionDto,
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

  /** The requester supplies a reason; everything else is decided on review. */
  async request(actor: AuthUser, dto: CreateSuspensionDto) {
    const student = await this.acl.assertStudentWriteAccess(actor, dto.studentId);
    if (student.status === StudentStatus.SUSPENDED) {
      throw new ConflictException('الطالب موقوف بالفعل');
    }
    if (student.status === StudentStatus.ACTIVITY) {
      throw new ConflictException('الطالب مُحوَّل إلى برنامج النشاط بالفعل');
    }

    const pending = await this.prisma.suspensionRequest.findFirst({
      where: { studentId: dto.studentId, status: RequestStatus.PENDING },
    });
    if (pending) throw new ConflictException('يوجد طلب معلق لهذا الطالب');

    const request = await this.prisma.suspensionRequest.create({
      data: {
        studentId: dto.studentId,
        reason: dto.reason,
        requestedById: actor.id,
      },
      include: SUSPENSION_INCLUDE,
    });

    await this.notifications.notifyRoles([Role.ADMIN], {
      type: NotificationType.SUSPENSION_REQUEST,
      title: 'طلب إيقاف / استبعاد طالب',
      body: `طلب بخصوص الطالب ${student.fullName}. السبب: ${dto.reason}`,
      link: `/suspensions/${request.id}`,
    });

    await this.activity.log({
      userId: actor.id,
      action: 'SUSPENSION_REQUEST',
      summary: `طلب بخصوص الطالب ${student.fullName}: ${dto.reason}`,
      entityType: 'SuspensionRequest',
      entityId: request.id,
    });

    return this.decorate(request);
  }

  /**
   * The administration's decision. Two outcomes, and they do different things
   * to the student's place in the school:
   *
   *  - ACTIVITY_PROGRAM: leaves the circle, keeps the record. The student stays
   *    in the unified profile marked "transferred to the activity programme".
   *  - SUSPEND: keeps the circle, marked "suspended" for a set number of days.
   */
  async approve(actor: AuthUser, id: string, dto: ApproveSuspensionDto) {
    const request = await this.prisma.suspensionRequest.findUnique({
      where: { id },
      include: SUSPENSION_INCLUDE,
    });
    if (!request) throw new NotFoundException('الطلب غير موجود');
    if (request.status !== RequestStatus.PENDING) {
      throw new BadRequestException('تم البت في هذا الطلب مسبقاً');
    }

    const toActivity = dto.action === SuspensionAction.ACTIVITY_PROGRAM;
    const permanent = dto.action === SuspensionAction.PERMANENT;
    // Both of these take the student out of their circle; only a temporary
    // suspension leaves them in it with a date to come back on.
    const leavesCircle = toActivity || permanent;

    let startDate: Date | null = null;
    let endDate: Date | null = null;
    if (permanent) {
      // A permanent stop starts today and never ends.
      startDate = toDateOnly(dto.startDate ?? new Date());
    } else if (!toActivity) {
      if (!dto.durationDays) {
        throw new BadRequestException('مدة الإيقاف مطلوبة');
      }
      startDate = toDateOnly(dto.startDate ?? new Date());
      endDate = new Date(startDate);
      endDate.setUTCDate(endDate.getUTCDate() + dto.durationDays);
    }

    const previousCircleId = request.student.circle?.id ?? null;

    await this.prisma.$transaction([
      this.prisma.suspensionRequest.update({
        where: { id },
        data: {
          status: RequestStatus.APPROVED,
          action: dto.action,
          durationDays: leavesCircle ? null : dto.durationDays,
          startDate,
          endDate,
          decidedById: actor.id,
          decidedAt: new Date(),
          decisionNote: dto.decisionNote,
        },
      }),
      this.prisma.student.update({
        where: { id: request.studentId },
        data: permanent
          ? // Out of the school; the record stays in the unified register.
            { status: StudentStatus.WITHDRAWN, circleId: null }
          : toActivity
            ? // Out of the circle, still on the books.
              { status: StudentStatus.ACTIVITY, circleId: null }
            : // Stays in the circle, flagged as suspended.
              { status: StudentStatus.SUSPENDED },
      }),
      // Close the circle membership so the history says when they left.
      ...(leavesCircle && previousCircleId
        ? [
            this.prisma.circleMembership.updateMany({
              where: { studentId: request.studentId, circleId: previousCircleId, endedAt: null },
              data: {
                endedAt: new Date(),
                reason: permanent ? 'إيقاف نهائي' : 'التحويل إلى برنامج النشاط',
              },
            }),
          ]
        : []),
    ]);

    // Re-read so the embedded student carries the new status.
    const updated = await this.prisma.suspensionRequest.findUniqueOrThrow({
      where: { id },
      include: SUSPENSION_INCLUDE,
    });

    await this.notifyDecision(updated, true, dto.decisionNote);

    await this.activity.log({
      userId: actor.id,
      action: permanent
        ? 'STUDENT_PERMANENT_STOP'
        : toActivity
          ? 'STUDENT_TO_ACTIVITY'
          : 'SUSPENSION_APPROVE',
      summary: permanent
        ? `إيقاف الطالب ${request.student.fullName} نهائياً`
        : toActivity
          ? `تحويل الطالب ${request.student.fullName} إلى برنامج النشاط`
          : `إيقاف الطالب ${request.student.fullName} لمدة ${dto.durationDays} يوماً`,
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
  /**
   * Brings a student back into the school's flow, keyed on the student rather
   * than on a suspension record.
   *
   * The administration works from the unified student record, where what they
   * see is "this child is in the activity programme" — not the id of the
   * request that put them there. This finds that request and returns them
   * through the same path, and still works for a student whose status was set
   * directly and has no open record at all.
   */
  async returnStudentToCircle(actor: AuthUser, studentId: string, dto: ReturnStudentDto) {
    const student = await this.prisma.student.findFirst({
      where: { id: studentId, deletedAt: null },
      select: { id: true, fullName: true, status: true, circleId: true },
    });
    if (!student) throw new NotFoundException('الطالب غير موجود');
    if (student.status !== StudentStatus.ACTIVITY && student.status !== StudentStatus.SUSPENDED) {
      throw new BadRequestException('الطالب ليس في برنامج النشاط ولا موقوفاً');
    }

    const open = await this.prisma.suspensionRequest.findFirst({
      where: { studentId, status: RequestStatus.APPROVED, returnedAt: null },
      orderBy: { createdAt: 'desc' },
      select: { id: true },
    });
    if (open) return this.returnStudent(actor, open.id, dto);

    // No open record — the status was set some other way. Move them back all
    // the same rather than leaving them stuck outside every circle.
    if (student.status === StudentStatus.ACTIVITY && !dto.circleId) {
      throw new BadRequestException('يجب تحديد الحلقة التي سيعود إليها الطالب من برنامج النشاط');
    }
    if (dto.circleId) await this.assertCircleHasRoom(dto.circleId);

    await this.prisma.$transaction([
      this.prisma.student.update({
        where: { id: studentId },
        data: {
          status: StudentStatus.ACTIVE,
          ...(dto.circleId ? { circleId: dto.circleId } : {}),
        },
      }),
      ...(dto.circleId
        ? [
            this.prisma.circleMembership.create({
              data: {
                studentId,
                circleId: dto.circleId,
                reason: 'العودة من برنامج النشاط',
              },
            }),
          ]
        : []),
    ]);

    await this.activity.log({
      userId: actor.id,
      action: 'STUDENT_RETURN',
      summary: `إعادة الطالب ${student.fullName} إلى الحلقات`,
      entityType: 'Student',
      entityId: studentId,
    });

    return this.prisma.student.findFirstOrThrow({
      where: { id: studentId },
      select: { id: true, fullName: true, status: true, circleId: true },
    });
  }

  /** Shared capacity check for both return paths. */
  private async assertCircleHasRoom(circleId: string) {
    const circle = await this.prisma.circle.findFirst({
      where: { id: circleId, deletedAt: null, isActive: true },
      select: { id: true, name: true, capacity: true, _count: { select: { students: true } } },
    });
    if (!circle) throw new BadRequestException('الحلقة المحددة غير موجودة');
    if (circle._count.students >= circle.capacity) {
      throw new BadRequestException(`الحلقة ${circle.name} مكتملة العدد`);
    }
    return circle;
  }

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

    // A student returning from the activity programme has no circle to go back
    // to — they were removed from it — so the caller has to name one.
    const fromActivity = request.action === SuspensionAction.ACTIVITY_PROGRAM;
    if (fromActivity && !dto.circleId) {
      throw new BadRequestException('يجب تحديد الحلقة التي سيعود إليها الطالب من برنامج النشاط');
    }
    if (dto.circleId) await this.assertCircleHasRoom(dto.circleId);

    await this.prisma.$transaction([
      this.prisma.suspensionRequest.update({
        where: { id },
        data: { returnedAt: new Date(), returnedNote: dto.note },
      }),
      this.prisma.student.update({
        where: { id: request.studentId },
        data: {
          status: StudentStatus.ACTIVE,
          ...(dto.circleId ? { circleId: dto.circleId } : {}),
        },
      }),
      ...(dto.circleId
        ? [
            this.prisma.circleMembership.create({
              data: {
                studentId: request.studentId,
                circleId: dto.circleId,
                reason: fromActivity ? 'العودة من برنامج النشاط' : 'العودة بعد الإيقاف',
              },
            }),
          ]
        : []),
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
        ? {
            status: RequestStatus.APPROVED,
            returnedAt: null,
            // An activity-programme transfer has no end date and stays "active"
            // until someone puts the student back into a circle.
            OR: [{ endDate: null }, { endDate: { gte: this.today() } }],
          }
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
        action: SuspensionAction.SUSPEND,
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
    const decided = request.status === RequestStatus.APPROVED && !request.returnedAt;
    // An activity-programme transfer is open-ended: no end date, so no countdown.
    const remainingDays =
      decided && request.endDate
        ? Math.max(0, Math.ceil((new Date(request.endDate).getTime() - Date.now()) / 86400000))
        : null;
    return {
      ...request,
      remainingDays,
      isActive: decided && (request.endDate === null || (remainingDays ?? 0) > 0),
    };
  }

  private async notifyDecision(request: any, approved: boolean, note?: string) {
    await this.notifications.notify({
      userId: request.requestedById,
      type: NotificationType.SUSPENSION_DECISION,
      title: approved ? 'تمت الموافقة على الطلب' : 'تم رفض الطلب',
      body: `الطالب ${request.student.fullName}${note ? ` — ${note}` : ''}`,
      link: `/suspensions/${request.id}`,
    });

    if (approved && request.student.parentProfile?.userId) {
      const toActivity = request.action === SuspensionAction.ACTIVITY_PROGRAM;
      const permanent = request.action === SuspensionAction.PERMANENT;
      await this.notifications.notify({
        userId: request.student.parentProfile.userId,
        type: NotificationType.SUSPENSION_DECISION,
        title: permanent
          ? 'إيقاف نهائي'
          : toActivity
            ? 'التحويل إلى برنامج النشاط'
            : 'إشعار إيقاف',
        body: permanent
          ? `تم إيقاف الطالب ${request.student.fullName} نهائياً. السبب: ${request.reason}`
          : toActivity
            ? `تم تحويل الطالب ${request.student.fullName} إلى برنامج النشاط. السبب: ${request.reason}`
            : `تم إيقاف الطالب ${request.student.fullName} لمدة ${request.durationDays} يوماً. السبب: ${request.reason}`,
        link: `/parent/children/${request.studentId}`,
      });
    }
  }

  private today() {
    const d = new Date();
    return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  }
}
