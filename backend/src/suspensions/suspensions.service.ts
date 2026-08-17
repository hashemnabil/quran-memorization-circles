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

function today(): Date {
  const d = new Date();
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
    if (pending) throw new ConflictException('يوجد طلب فصل معلق لهذا الطالب');

    // The request is now reason-only. The existing date columns are retained
    // for backward-compatible database shape; the same day is stored in both
    // columns so no duration is imposed by the teacher's request.
    const requestDate = today();

    const request = await this.prisma.suspensionRequest.create({
      data: {
        studentId: dto.studentId,
        reason: dto.reason,
        durationDays: 0,
        startDate: requestDate,
        endDate: requestDate,
        requestedById: actor.id,
      },
      include: SUSPENSION_INCLUDE,
    });

    await this.notifications.notifyRoles([Role.ADMIN], {
      type: NotificationType.SUSPENSION_REQUEST,
      title: 'طلب فصل طالب',
      body: `طلب فصل الطالب ${student.fullName} — السبب: ${dto.reason}`,
      link: `/suspensions/${request.id}`,
    });

    await this.activity.log({
      userId: actor.id,
      action: 'SUSPENSION_REQUEST',
      summary: `طلب فصل الطالب ${student.fullName}`,
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

    const updated = await this.prisma.suspensionRequest.findUniqueOrThrow({
      where: { id },
      include: SUSPENSION_INCLUDE,
    });

    await this.notifyDecision(updated, true, dto.decisionNote);
    await this.activity.log({
      userId: actor.id,
      action: 'SUSPENSION_APPROVE',
      summary: `الموافقة على فصل الطالب ${request.student.fullName}`,
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
      summary: `رفض طلب فصل الطالب ${request.student.fullName}`,
      entityType: 'SuspensionRequest',
      entityId: id,
    });

    return this.decorate(updated);
  }

  async returnStudent(actor: AuthUser, id: string, dto: ReturnStudentDto) {
    const request = await this.prisma.suspensionRequest.findUnique({
      where: { id },
      include: SUSPENSION_INCLUDE,
    });
    if (!request) throw new NotFoundException('الطلب غير موجود');
    if (request.status !== RequestStatus.APPROVED) {
      throw new BadRequestException('هذا الفصل غير سارٍ');
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
      title: 'عودة طالب من الفصل',
      body: `تم إرجاع الطالب ${request.student.fullName} إلى الحلقة`,
      link: `/students/${request.studentId}`,
    });

    if (request.student.parentProfile?.userId) {
      await this.notifications.notify({
        userId: request.student.parentProfile.userId,
        type: NotificationType.SUSPENSION_DECISION,
        title: 'عودة الطالب',
        body: `تم إرجاع الطالب ${request.student.fullName} إلى الحلقة`,
        link: `/parent/children/${request.studentId}`,
      });
    }

    await this.activity.log({
      userId: actor.id,
      action: 'SUSPENSION_RETURN',
      summary: `إرجاع الطالب ${request.student.fullName} من الفصل`,
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

  async activeList(user: AuthUser) {
    const scope = await this.acl.studentScope(user);
    const rows = await this.prisma.suspensionRequest.findMany({
      where: {
        student: { ...scope, deletedAt: null },
        status: RequestStatus.APPROVED,
        returnedAt: null,
      },
      include: SUSPENSION_INCLUDE,
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((r) => this.decorate(r));
  }

  async releaseExpired() {
    // Reason-only requests are indefinite until an administrator explicitly
    // returns the student, so there is no automatic release.
    return { released: 0 };
  }

  async pendingCount() {
    return this.prisma.suspensionRequest.count({ where: { status: RequestStatus.PENDING } });
  }

  private decorate(request: any) {
    return {
      ...request,
      remainingDays: null,
      isActive: request.status === RequestStatus.APPROVED && !request.returnedAt,
    };
  }

  private async notifyDecision(request: any, approved: boolean, note?: string) {
    await this.notifications.notify({
      userId: request.requestedById,
      type: NotificationType.SUSPENSION_DECISION,
      title: approved ? 'تمت الموافقة على طلب الفصل' : 'تم رفض طلب الفصل',
      body: `الطالب ${request.student.fullName}${note ? ` — ${note}` : ''}`,
      link: `/suspensions/${request.id}`,
    });

    if (approved && request.student.parentProfile?.userId) {
      await this.notifications.notify({
        userId: request.student.parentProfile.userId,
        type: NotificationType.SUSPENSION_DECISION,
        title: 'إشعار فصل',
        body: `تم فصل الطالب ${request.student.fullName}. السبب: ${request.reason}`,
        link: `/parent/children/${request.studentId}`,
      });
    }
  }
}
