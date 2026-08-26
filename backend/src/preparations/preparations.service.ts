import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { NotificationType, Prisma, Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AccessControlService } from '../common/services/access-control.service';
import { ActivityService } from '../common/services/activity.service';
import { NotificationsService } from '../notifications/notifications.service';
import { AuthUser } from '../common/decorators';
import { paginate } from '../common/dto/pagination.dto';
import { findSurah } from '../common/quran';
import {
  CreatePreparationDto,
  QueryPreparationsDto,
  UpdatePreparationDto,
} from './dto/preparation.dto';

function toDateOnly(value: string | Date): Date {
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) throw new BadRequestException('التاريخ غير صالح');
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

const INCLUDE = {
  student: {
    select: {
      id: true,
      code: true,
      fullName: true,
      circle: { select: { id: true, name: true } },
    },
  },
  teacher: { select: { id: true, user: { select: { id: true, fullName: true } } } },
} satisfies Prisma.PreparationAssignmentInclude;

/**
 * "Prepare Al-Baqarah 1–20 for the next session."
 *
 * The teacher sets the passage; the guardian is notified the moment it is
 * created, so a parent does not have to open the app to find out what their
 * child owes.
 */
@Injectable()
export class PreparationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly acl: AccessControlService,
    private readonly activity: ActivityService,
    private readonly notifications: NotificationsService,
  ) {}

  async findAll(user: AuthUser, query: QueryPreparationsDto) {
    const scope = await this.acl.studentScope(user);
    if (query.studentId) await this.acl.assertStudentAccess(user, query.studentId);
    if (query.circleId) await this.acl.assertCircleAccess(user, query.circleId);

    const where: Prisma.PreparationAssignmentWhereInput = {
      student: {
        ...scope,
        deletedAt: null,
        ...(query.circleId ? { circleId: query.circleId } : {}),
      },
      ...(query.studentId ? { studentId: query.studentId } : {}),
      ...(query.pending ? { completedAt: null } : {}),
    };

    const [data, total] = await this.prisma.$transaction([
      this.prisma.preparationAssignment.findMany({
        where,
        include: INCLUDE,
        orderBy: [{ createdAt: 'desc' }],
        skip: query.skip,
        take: query.take,
      }),
      this.prisma.preparationAssignment.count({ where }),
    ]);

    return paginate(data, total, query.page, query.limit);
  }

  async create(actor: AuthUser, dto: CreatePreparationDto) {
    const student = await this.acl.assertStudentWriteAccess(actor, dto.studentId);
    this.validateRange(dto);

    const teacherId = await this.resolveTeacherId(actor, student.circleId);

    const assignment = await this.prisma.preparationAssignment.create({
      data: {
        studentId: dto.studentId,
        teacherId,
        fromSurah: dto.fromSurah.trim(),
        fromAyah: dto.fromAyah,
        toSurah: dto.toSurah.trim(),
        toAyah: dto.toAyah,
        note: dto.note || null,
        dueDate: dto.dueDate ? toDateOnly(dto.dueDate) : null,
      },
      include: INCLUDE,
    });

    await this.notifyGuardian(assignment.studentId, student.fullName, dto);

    await this.activity.log({
      userId: actor.id,
      action: 'PREPARATION_CREATE',
      summary: `تكليف تحضير للطالب ${student.fullName}: ${dto.fromSurah} ${dto.fromAyah} - ${dto.toSurah} ${dto.toAyah}`,
      entityType: 'PreparationAssignment',
      entityId: assignment.id,
    });

    return assignment;
  }

  async update(actor: AuthUser, id: string, dto: UpdatePreparationDto) {
    const current = await this.prisma.preparationAssignment.findUnique({ where: { id } });
    if (!current) throw new NotFoundException('التكليف غير موجود');
    await this.acl.assertStudentWriteAccess(actor, current.studentId);

    if (actor.role === Role.TEACHER && current.teacherId !== actor.teacherId) {
      throw new ForbiddenException('يمكن تعديل التكليف من قبل المعلم الذي أنشأه فقط');
    }

    if (dto.fromSurah || dto.toSurah || dto.fromAyah !== undefined || dto.toAyah !== undefined) {
      this.validateRange({
        fromSurah: dto.fromSurah ?? current.fromSurah,
        fromAyah: dto.fromAyah ?? current.fromAyah,
        toSurah: dto.toSurah ?? current.toSurah,
        toAyah: dto.toAyah ?? current.toAyah,
      });
    }

    return this.prisma.preparationAssignment.update({
      where: { id },
      data: {
        fromSurah: dto.fromSurah?.trim(),
        fromAyah: dto.fromAyah,
        toSurah: dto.toSurah?.trim(),
        toAyah: dto.toAyah,
        note: dto.note === '' ? null : dto.note,
        ...(dto.dueDate !== undefined
          ? { dueDate: dto.dueDate ? toDateOnly(dto.dueDate) : null }
          : {}),
      },
      include: INCLUDE,
    });
  }

  /** Marks the passage as recited. Toggling back is allowed if it was a slip. */
  async setCompleted(actor: AuthUser, id: string, completed: boolean) {
    const current = await this.prisma.preparationAssignment.findUnique({ where: { id } });
    if (!current) throw new NotFoundException('التكليف غير موجود');
    await this.acl.assertStudentWriteAccess(actor, current.studentId);

    return this.prisma.preparationAssignment.update({
      where: { id },
      data: { completedAt: completed ? new Date() : null },
      include: INCLUDE,
    });
  }

  async remove(actor: AuthUser, id: string) {
    const current = await this.prisma.preparationAssignment.findUnique({ where: { id } });
    if (!current) throw new NotFoundException('التكليف غير موجود');
    await this.acl.assertStudentWriteAccess(actor, current.studentId);
    if (actor.role === Role.TEACHER && current.teacherId !== actor.teacherId) {
      throw new ForbiddenException('يمكن حذف التكليف من قبل المعلم الذي أنشأه فقط');
    }

    await this.prisma.preparationAssignment.delete({ where: { id } });
    return { message: 'تم حذف التكليف' };
  }

  // -------------------------------------------------------------------------

  private async notifyGuardian(
    studentId: string,
    studentName: string,
    dto: CreatePreparationDto,
  ) {
    const student = await this.prisma.student.findUnique({
      where: { id: studentId },
      select: { parentProfile: { select: { userId: true } } },
    });
    if (!student?.parentProfile?.userId) return;

    const range =
      dto.fromSurah === dto.toSurah
        ? `${dto.fromSurah} من الآية ${dto.fromAyah} إلى ${dto.toAyah}`
        : `من ${dto.fromSurah} (${dto.fromAyah}) إلى ${dto.toSurah} (${dto.toAyah})`;

    await this.notifications.notify({
      userId: student.parentProfile.userId,
      type: NotificationType.PREPARATION,
      title: 'تحضير مطلوب',
      body: `ابنكم ${studentName} لديه تحضير ${range}، يُرجى تحضيره للتسميع القادم${
        dto.dueDate ? ` بتاريخ ${dto.dueDate}` : ''
      }`,
      link: `/parent/children/${studentId}`,
    });
  }

  /** An assignment always belongs to a teacher, as a recitation does. */
  private async resolveTeacherId(actor: AuthUser, circleId: string | null) {
    if (actor.role === Role.TEACHER && actor.teacherId) return actor.teacherId;
    if (!circleId) {
      throw new BadRequestException('الطالب غير مسجل في حلقة، ولا يمكن تحديد المعلم');
    }

    const primary = await this.prisma.circleTeacher.findFirst({
      where: { circleId, role: 'PRIMARY', endedAt: null },
      select: { teacherId: true },
    });
    if (primary) return primary.teacherId;

    const any = await this.prisma.circleTeacher.findFirst({
      where: { circleId, endedAt: null },
      select: { teacherId: true },
    });
    if (!any) throw new BadRequestException('لا يوجد معلم مسند لهذه الحلقة');
    return any.teacherId;
  }

  private validateRange(dto: {
    fromSurah: string;
    fromAyah: number;
    toSurah: string;
    toAyah: number;
  }) {
    const from = findSurah(dto.fromSurah);
    const to = findSurah(dto.toSurah);
    if (!from) throw new BadRequestException(`سورة البداية "${dto.fromSurah}" غير معروفة`);
    if (!to) throw new BadRequestException(`سورة النهاية "${dto.toSurah}" غير معروفة`);
    if (dto.fromAyah > from.ayahs) {
      throw new BadRequestException(`سورة ${from.name} تحتوي على ${from.ayahs} آية فقط`);
    }
    if (dto.toAyah > to.ayahs) {
      throw new BadRequestException(`سورة ${to.name} تحتوي على ${to.ayahs} آية فقط`);
    }
    if (from.number > to.number || (from.number === to.number && dto.fromAyah > dto.toAyah)) {
      throw new BadRequestException('نطاق التحضير غير صحيح: البداية بعد النهاية');
    }
  }
}
