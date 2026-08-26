import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  CircleTeacherRole,
  NotificationType,
  Prisma,
  RequestStatus,
  Role,
  TransferKind,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AccessControlService } from '../common/services/access-control.service';
import { ActivityService } from '../common/services/activity.service';
import { NotificationsService } from '../notifications/notifications.service';
import { AuthUser } from '../common/decorators';
import { paginate } from '../common/dto/pagination.dto';
import {
  ApproveStudentTransferDto,
  CreateStudentTransferDto,
  CreateTeacherSwapDto,
  CreateTeacherTransferDto,
  DecideTransferDto,
  QueryTransfersDto,
} from './dto/transfer.dto';

const TRANSFER_INCLUDE = {
  student: { select: { id: true, code: true, fullName: true } },
  fromCircle: { select: { id: true, name: true, code: true } },
  toCircle: { select: { id: true, name: true, code: true } },
  requestedBy: { select: { id: true, fullName: true, role: true } },
  decidedBy: { select: { id: true, fullName: true, role: true } },
} satisfies Prisma.TransferRequestInclude;

@Injectable()
export class TransfersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly acl: AccessControlService,
    private readonly activity: ActivityService,
    private readonly notifications: NotificationsService,
  ) {}

  // --- requests ------------------------------------------------------------

  async requestStudentTransfer(actor: AuthUser, dto: CreateStudentTransferDto) {
    const student = await this.acl.assertStudentWriteAccess(actor, dto.studentId);
    if (!student.circleId) throw new BadRequestException('الطالب غير مسجل في حلقة');

    const pending = await this.prisma.transferRequest.findFirst({
      where: { studentId: dto.studentId, status: RequestStatus.PENDING },
    });
    if (pending) throw new ConflictException('يوجد طلب نقل معلق لهذا الطالب');

    // `toCircleId` stays null until the administration picks a destination.
    const request = await this.prisma.transferRequest.create({
      data: {
        kind: TransferKind.STUDENT_TRANSFER,
        studentId: dto.studentId,
        fromCircleId: student.circleId,
        reason: dto.reason,
        requestedById: actor.id,
      },
      include: TRANSFER_INCLUDE,
    });

    await this.notifyDecisionMakers(
      'طلب نقل طالب جديد',
      `طلب نقل الطالب ${student.fullName}. السبب: ${dto.reason}`,
      `/transfers/${request.id}`,
    );

    await this.activity.log({
      userId: actor.id,
      action: 'TRANSFER_REQUEST_STUDENT',
      summary: `طلب نقل الطالب ${student.fullName}: ${dto.reason}`,
      entityType: 'TransferRequest',
      entityId: request.id,
    });

    return request;
  }

  async requestTeacherTransfer(actor: AuthUser, dto: CreateTeacherTransferDto) {
    const teacher = await this.prisma.teacherProfile.findFirst({
      where: { id: dto.teacherId, deletedAt: null },
      include: { user: { select: { id: true, fullName: true } } },
    });
    if (!teacher) throw new NotFoundException('المعلم غير موجود');

    // Teachers may only request a move for themselves.
    if (actor.role === Role.TEACHER && actor.teacherId !== dto.teacherId) {
      throw new ForbiddenException('يمكنك طلب نقل نفسك فقط');
    }

    const currentLink = await this.prisma.circleTeacher.findFirst({
      where: {
        teacherId: dto.teacherId,
        endedAt: null,
        ...(dto.fromCircleId ? { circleId: dto.fromCircleId } : {}),
      },
      include: { circle: { select: { id: true, name: true } } },
    });

    const target = await this.prisma.circle.findFirst({
      where: { id: dto.toCircleId, deletedAt: null, isActive: true },
    });
    if (!target) throw new BadRequestException('الحلقة المطلوبة غير موجودة أو غير مفعّلة');
    if (currentLink?.circleId === dto.toCircleId) {
      throw new BadRequestException('المعلم مسند لهذه الحلقة بالفعل');
    }

    const pending = await this.prisma.transferRequest.findFirst({
      where: {
        kind: TransferKind.TEACHER_TRANSFER,
        teacherAId: dto.teacherId,
        status: RequestStatus.PENDING,
      },
    });
    if (pending) throw new ConflictException('يوجد طلب نقل معلق لهذا المعلم');

    const request = await this.prisma.transferRequest.create({
      data: {
        kind: TransferKind.TEACHER_TRANSFER,
        teacherAId: dto.teacherId,
        fromCircleId: currentLink?.circleId ?? null,
        toCircleId: dto.toCircleId,
        reason: dto.reason,
        requestedById: actor.id,
      },
      include: TRANSFER_INCLUDE,
    });

    await this.notifyDecisionMakers(
      'طلب نقل معلم',
      `طلب نقل المعلم ${teacher.user.fullName} إلى حلقة "${target.name}"`,
      `/transfers/${request.id}`,
    );

    await this.activity.log({
      userId: actor.id,
      action: 'TRANSFER_REQUEST_TEACHER',
      summary: `طلب نقل المعلم ${teacher.user.fullName} إلى حلقة ${target.name}`,
      entityType: 'TransferRequest',
      entityId: request.id,
    });

    return request;
  }

  async requestTeacherSwap(actor: AuthUser, dto: CreateTeacherSwapDto) {
    if (dto.teacherAId === dto.teacherBId) {
      throw new BadRequestException('لا يمكن تبادل المعلم مع نفسه');
    }

    const [linkA, linkB] = await Promise.all([
      this.activeLink(dto.teacherAId),
      this.activeLink(dto.teacherBId),
    ]);
    if (!linkA || !linkB) {
      throw new BadRequestException('يجب أن يكون كلا المعلمين مسنداً إلى حلقة');
    }
    if (linkA.circleId === linkB.circleId) {
      throw new BadRequestException('المعلمان في نفس الحلقة');
    }

    const request = await this.prisma.transferRequest.create({
      data: {
        kind: TransferKind.TEACHER_SWAP,
        teacherAId: dto.teacherAId,
        teacherBId: dto.teacherBId,
        fromCircleId: linkA.circleId,
        toCircleId: linkB.circleId,
        reason: dto.reason,
        requestedById: actor.id,
      },
      include: TRANSFER_INCLUDE,
    });

    await this.notifyDecisionMakers(
      'طلب تبادل معلمين',
      `طلب تبادل بين ${linkA.teacher.user.fullName} و${linkB.teacher.user.fullName}`,
      `/transfers/${request.id}`,
    );

    await this.activity.log({
      userId: actor.id,
      action: 'TRANSFER_REQUEST_SWAP',
      summary: `طلب تبادل المعلمين ${linkA.teacher.user.fullName} و${linkB.teacher.user.fullName}`,
      entityType: 'TransferRequest',
      entityId: request.id,
    });

    return request;
  }

  // --- decisions -----------------------------------------------------------

  /**
   * `toCircleId` on the body is how the administration answers "transfer them
   * where?" for a student request. The other kinds already carry their target
   * from the request itself, so it is ignored for them.
   */
  async approve(actor: AuthUser, id: string, dto: ApproveStudentTransferDto | DecideTransferDto) {
    const request = await this.prisma.transferRequest.findUnique({
      where: { id },
      include: TRANSFER_INCLUDE,
    });
    if (!request) throw new NotFoundException('الطلب غير موجود');
    if (request.status !== RequestStatus.PENDING) {
      throw new BadRequestException('تم البت في هذا الطلب مسبقاً');
    }

    const chosenCircleId = (dto as ApproveStudentTransferDto).toCircleId;

    switch (request.kind) {
      case TransferKind.STUDENT_TRANSFER: {
        if (!chosenCircleId) {
          throw new BadRequestException('يجب تحديد الحلقة التي سيُنقل إليها الطالب');
        }
        if (chosenCircleId === request.fromCircleId) {
          throw new BadRequestException('الطالب مسجل في هذه الحلقة بالفعل');
        }

        const target = await this.prisma.circle.findFirst({
          where: { id: chosenCircleId, deletedAt: null, isActive: true },
          include: { _count: { select: { students: { where: { deletedAt: null } } } } },
        });
        if (!target) throw new BadRequestException('الحلقة المحددة غير موجودة أو غير مفعّلة');
        if (target._count.students >= target.capacity) {
          throw new BadRequestException(`الحلقة "${target.name}" مكتملة العدد`);
        }

        // Recorded before the move so the request itself says where they went.
        await this.prisma.transferRequest.update({
          where: { id },
          data: { toCircleId: chosenCircleId },
        });
        await this.applyStudentTransfer({ ...request, toCircleId: chosenCircleId });
        break;
      }
      case TransferKind.TEACHER_TRANSFER:
        await this.applyTeacherTransfer(request);
        break;
      case TransferKind.TEACHER_SWAP:
        await this.applyTeacherSwap(request);
        break;
      default:
        throw new BadRequestException('نوع الطلب غير مدعوم');
    }

    const updated = await this.prisma.transferRequest.update({
      where: { id },
      data: {
        status: RequestStatus.APPROVED,
        decidedById: actor.id,
        decidedAt: new Date(),
        decisionNote: dto.decisionNote,
        effectiveAt: new Date(),
      },
      include: TRANSFER_INCLUDE,
    });

    await this.notifyRequester(updated, true, dto.decisionNote);

    await this.activity.log({
      userId: actor.id,
      action: 'TRANSFER_APPROVE',
      summary: `الموافقة على ${this.kindLabel(request.kind)}`,
      entityType: 'TransferRequest',
      entityId: id,
    });

    return updated;
  }

  async reject(actor: AuthUser, id: string, dto: DecideTransferDto) {
    const request = await this.prisma.transferRequest.findUnique({ where: { id } });
    if (!request) throw new NotFoundException('الطلب غير موجود');
    if (request.status !== RequestStatus.PENDING) {
      throw new BadRequestException('تم البت في هذا الطلب مسبقاً');
    }

    const updated = await this.prisma.transferRequest.update({
      where: { id },
      data: {
        status: RequestStatus.REJECTED,
        decidedById: actor.id,
        decidedAt: new Date(),
        decisionNote: dto.decisionNote,
      },
      include: TRANSFER_INCLUDE,
    });

    await this.notifyRequester(updated, false, dto.decisionNote);

    await this.activity.log({
      userId: actor.id,
      action: 'TRANSFER_REJECT',
      summary: `رفض ${this.kindLabel(request.kind)}`,
      entityType: 'TransferRequest',
      entityId: id,
    });

    return updated;
  }

  async cancel(actor: AuthUser, id: string) {
    const request = await this.prisma.transferRequest.findUnique({ where: { id } });
    if (!request) throw new NotFoundException('الطلب غير موجود');
    if (request.status !== RequestStatus.PENDING) {
      throw new BadRequestException('لا يمكن إلغاء طلب تم البت فيه');
    }
    if (request.requestedById !== actor.id && actor.role !== Role.ADMIN) {
      throw new ForbiddenException('يمكن إلغاء الطلب من قبل مُنشئه أو الإدارة فقط');
    }

    return this.prisma.transferRequest.update({
      where: { id },
      data: { status: RequestStatus.CANCELLED, decidedAt: new Date() },
      include: TRANSFER_INCLUDE,
    });
  }

  // --- reads ---------------------------------------------------------------

  async findAll(user: AuthUser, query: QueryTransfersDto) {
    const where: Prisma.TransferRequestWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.kind ? { kind: query.kind } : {}),
      ...(query.studentId ? { studentId: query.studentId } : {}),
      ...(query.circleId
        ? { OR: [{ fromCircleId: query.circleId }, { toCircleId: query.circleId }] }
        : {}),
    };

    // Teachers see the requests they raised; supervisors see anything touching their circles.
    if (user.role === Role.TEACHER) {
      where.requestedById = user.id;
    } else if (user.role === Role.SUPERVISOR) {
      const ids = await this.acl.supervisorCircleIds(user);
      where.AND = [
        ...(Array.isArray(where.AND) ? where.AND : where.AND ? [where.AND] : []),
        { OR: [{ fromCircleId: { in: ids } }, { toCircleId: { in: ids } }, { requestedById: user.id }] },
      ];
    } else if (user.role !== Role.ADMIN) {
      where.requestedById = user.id;
    }

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.transferRequest.findMany({
        where,
        include: TRANSFER_INCLUDE,
        orderBy: { createdAt: query.sortOrder || 'desc' },
        skip: query.skip,
        take: query.take,
      }),
      this.prisma.transferRequest.count({ where }),
    ]);

    const data = await this.attachTeachers(rows);
    return paginate(data, total, query.page, query.limit);
  }

  async findOne(user: AuthUser, id: string) {
    const request = await this.prisma.transferRequest.findUnique({
      where: { id },
      include: TRANSFER_INCLUDE,
    });
    if (!request) throw new NotFoundException('الطلب غير موجود');

    if (user.role === Role.TEACHER && request.requestedById !== user.id) {
      // Still visible if it concerns a circle the teacher works in.
      const circles = await this.acl.teacherCircleIds(user);
      const related =
        (request.fromCircleId && circles.includes(request.fromCircleId)) ||
        (request.toCircleId && circles.includes(request.toCircleId));
      if (!related) throw new ForbiddenException('لا تملك صلاحية الوصول إلى هذا الطلب');
    }

    const [withTeachers] = await this.attachTeachers([request]);
    return withTeachers;
  }

  async pendingCount() {
    return this.prisma.transferRequest.count({ where: { status: RequestStatus.PENDING } });
  }

  // --- application of an approved request ----------------------------------

  private async applyStudentTransfer(request: any) {
    if (!request.studentId || !request.toCircleId) {
      throw new BadRequestException('بيانات الطلب غير مكتملة');
    }

    const target = await this.prisma.circle.findFirst({
      where: { id: request.toCircleId, deletedAt: null, isActive: true },
      include: { _count: { select: { students: { where: { deletedAt: null } } } } },
    });
    if (!target) throw new BadRequestException('الحلقة المستهدفة لم تعد متاحة');
    if (target._count.students >= target.capacity) {
      throw new BadRequestException(`الحلقة "${target.name}" مكتملة العدد`);
    }

    await this.prisma.$transaction([
      this.prisma.circleMembership.updateMany({
        where: { studentId: request.studentId, endedAt: null },
        data: { endedAt: new Date(), reason: 'نقل بموافقة الإدارة' },
      }),
      this.prisma.circleMembership.create({
        data: {
          studentId: request.studentId,
          circleId: request.toCircleId,
          reason: request.reason ?? 'نقل بموافقة الإدارة',
        },
      }),
      this.prisma.student.update({
        where: { id: request.studentId },
        data: { circleId: request.toCircleId },
      }),
    ]);
  }

  private async applyTeacherTransfer(request: any) {
    if (!request.teacherAId || !request.toCircleId) {
      throw new BadRequestException('بيانات الطلب غير مكتملة');
    }

    const current = await this.activeLink(request.teacherAId);
    const role = current?.role ?? CircleTeacherRole.PRIMARY;

    await this.prisma.$transaction(async (tx) => {
      await tx.circleTeacher.updateMany({
        where: { teacherId: request.teacherAId, endedAt: null },
        data: { endedAt: new Date(), note: 'نقل بموافقة الإدارة' },
      });
      // Taking over as primary ends the previous primary assignment of the target circle.
      if (role === CircleTeacherRole.PRIMARY) {
        await tx.circleTeacher.updateMany({
          where: { circleId: request.toCircleId, role: CircleTeacherRole.PRIMARY, endedAt: null },
          data: { endedAt: new Date(), note: 'استبدال بمعلم منقول' },
        });
      }
      await tx.circleTeacher.create({
        data: {
          circleId: request.toCircleId,
          teacherId: request.teacherAId,
          role,
          note: 'نقل بموافقة الإدارة',
        },
      });
    });
  }

  private async applyTeacherSwap(request: any) {
    if (!request.teacherAId || !request.teacherBId) {
      throw new BadRequestException('بيانات الطلب غير مكتملة');
    }

    const [linkA, linkB] = await Promise.all([
      this.activeLink(request.teacherAId),
      this.activeLink(request.teacherBId),
    ]);
    if (!linkA || !linkB) throw new BadRequestException('أحد المعلمين لم يعد مسنداً إلى حلقة');

    await this.prisma.$transaction(async (tx) => {
      const now = new Date();
      await tx.circleTeacher.updateMany({
        where: { id: { in: [linkA.id, linkB.id] } },
        data: { endedAt: now, note: 'تبادل بين حلقتين' },
      });
      await tx.circleTeacher.createMany({
        data: [
          { circleId: linkB.circleId, teacherId: linkA.teacherId, role: linkA.role, note: 'تبادل معلمين' },
          { circleId: linkA.circleId, teacherId: linkB.teacherId, role: linkB.role, note: 'تبادل معلمين' },
        ],
      });
    });
  }

  // --- helpers -------------------------------------------------------------

  private activeLink(teacherId: string) {
    return this.prisma.circleTeacher.findFirst({
      where: { teacherId, endedAt: null },
      include: {
        circle: { select: { id: true, name: true } },
        teacher: { include: { user: { select: { id: true, fullName: true } } } },
      },
      orderBy: { role: 'asc' },
    });
  }

  /** Transfer rows store bare teacher ids; hydrate them for the UI. */
  private async attachTeachers(rows: any[]) {
    const ids = [...new Set(rows.flatMap((r) => [r.teacherAId, r.teacherBId]).filter(Boolean))];
    if (ids.length === 0) return rows.map((r) => ({ ...r, teacherA: null, teacherB: null }));

    const teachers = await this.prisma.teacherProfile.findMany({
      where: { id: { in: ids as string[] } },
      select: { id: true, user: { select: { id: true, fullName: true } } },
    });
    const map = new Map(teachers.map((t) => [t.id, t]));

    return rows.map((r) => ({
      ...r,
      teacherA: r.teacherAId ? map.get(r.teacherAId) ?? null : null,
      teacherB: r.teacherBId ? map.get(r.teacherBId) ?? null : null,
    }));
  }

  private async notifyDecisionMakers(title: string, body: string, link: string) {
    await this.notifications.notifyRoles([Role.ADMIN], {
      type: NotificationType.TRANSFER_REQUEST,
      title,
      body,
      link,
    });
  }

  private async notifyRequester(request: any, approved: boolean, note?: string) {
    await this.notifications.notify({
      userId: request.requestedById,
      type: NotificationType.TRANSFER_DECISION,
      title: approved ? 'تمت الموافقة على طلب النقل' : 'تم رفض طلب النقل',
      body: `${this.kindLabel(request.kind)}${note ? ` — ${note}` : ''}`,
      link: `/transfers/${request.id}`,
      data: { requestId: request.id, approved },
    });

    // The moved teacher should hear about it too.
    if (request.teacherAId) {
      const teacher = await this.prisma.teacherProfile.findUnique({
        where: { id: request.teacherAId },
        select: { userId: true },
      });
      if (teacher && teacher.userId !== request.requestedById) {
        await this.notifications.notify({
          userId: teacher.userId,
          type: NotificationType.TRANSFER_DECISION,
          title: approved ? 'تم اعتماد نقلك' : 'تم رفض طلب نقلك',
          body: this.kindLabel(request.kind),
          link: `/transfers/${request.id}`,
        });
      }
    }
  }

  private kindLabel(kind: TransferKind) {
    const labels: Record<TransferKind, string> = {
      STUDENT_TRANSFER: 'طلب نقل طالب',
      TEACHER_TRANSFER: 'طلب نقل معلم',
      TEACHER_SWAP: 'طلب تبادل معلمين',
      ASSISTANT_ADD: 'إضافة معلم مساعد',
      ASSISTANT_REMOVE: 'إزالة معلم مساعد',
    };
    return labels[kind];
  }
}
