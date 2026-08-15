import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AccessControlService } from '../common/services/access-control.service';
import { ActivityService } from '../common/services/activity.service';
import { AuthUser } from '../common/decorators';
import { paginate } from '../common/dto/pagination.dto';
import { SURAHS, findSurah } from '../common/quran';
import {
  CreateRecitationDto,
  QueryRecitationsDto,
  UpdateRecitationDto,
} from './dto/recitation.dto';

function toDateOnly(value: string | Date): Date {
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) throw new BadRequestException('التاريخ غير صالح');
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

const RECITATION_INCLUDE = {
  student: { select: { id: true, code: true, fullName: true } },
  circle: { select: { id: true, name: true, code: true } },
  teacher: { select: { id: true, user: { select: { id: true, fullName: true } } } },
} satisfies Prisma.RecitationInclude;

@Injectable()
export class RecitationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly acl: AccessControlService,
    private readonly activity: ActivityService,
  ) {}

  /** Reference data for the recitation form. */
  surahs() {
    return SURAHS;
  }

  async findAll(user: AuthUser, query: QueryRecitationsDto) {
    const scope = await this.acl.studentScope(user);
    if (query.circleId) await this.acl.assertCircleAccess(user, query.circleId);
    if (query.studentId) await this.acl.assertStudentAccess(user, query.studentId);

    const where: Prisma.RecitationWhereInput = {
      deletedAt: null,
      student: { ...scope, deletedAt: null },
      ...(query.studentId ? { studentId: query.studentId } : {}),
      ...(query.circleId ? { circleId: query.circleId } : {}),
      ...(query.teacherId ? { teacherId: query.teacherId } : {}),
      ...(query.type ? { type: query.type } : {}),
      ...(query.evaluation ? { evaluation: query.evaluation } : {}),
      ...(query.from || query.to
        ? {
            date: {
              ...(query.from ? { gte: toDateOnly(query.from) } : {}),
              ...(query.to ? { lte: toDateOnly(query.to) } : {}),
            },
          }
        : {}),
    };

    const [data, total] = await this.prisma.$transaction([
      this.prisma.recitation.findMany({
        where,
        include: RECITATION_INCLUDE,
        orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
        skip: query.skip,
        take: query.take,
      }),
      this.prisma.recitation.count({ where }),
    ]);

    return paginate(data, total, query.page, query.limit);
  }

  async findOne(user: AuthUser, id: string) {
    const recitation = await this.prisma.recitation.findFirst({
      where: { id, deletedAt: null },
      include: RECITATION_INCLUDE,
    });
    if (!recitation) throw new NotFoundException('سجل التسميع غير موجود');
    await this.acl.assertStudentAccess(user, recitation.studentId);
    return recitation;
  }

  async create(actor: AuthUser, dto: CreateRecitationDto) {
    const student = await this.acl.assertStudentWriteAccess(actor, dto.studentId);
    if (!student.circleId) throw new BadRequestException('الطالب غير مسجل في حلقة');

    const teacherId = await this.resolveTeacherId(actor, student.circleId);
    this.validateRange(dto);

    const date = toDateOnly(dto.date);
    if (date.getTime() > toDateOnly(new Date()).getTime()) {
      throw new BadRequestException('لا يمكن تسجيل تسميع بتاريخ مستقبلي');
    }

    const recitation = await this.prisma.recitation.create({
      data: {
        studentId: dto.studentId,
        circleId: student.circleId,
        teacherId,
        date,
        type: dto.type,
        fromSurah: dto.fromSurah.trim(),
        fromAyah: dto.fromAyah,
        toSurah: dto.toSurah.trim(),
        toAyah: dto.toAyah,
        pagesCount: dto.pagesCount,
        evaluation: dto.evaluation,
        notes: dto.notes,
      },
      include: RECITATION_INCLUDE,
    });

    // Keep the student's "current position" in sync with the latest memorization.
    if (dto.type === undefined || dto.type === 'MEMORIZATION') {
      await this.prisma.student.update({
        where: { id: dto.studentId },
        data: { currentSurah: dto.toSurah.trim() },
      });
    }

    await this.activity.log({
      userId: actor.id,
      action: 'RECITATION_CREATE',
      summary: `تسجيل تسميع للطالب ${student.fullName}: ${dto.fromSurah} ${dto.fromAyah} - ${dto.toSurah} ${dto.toAyah}`,
      entityType: 'Recitation',
      entityId: recitation.id,
    });

    return recitation;
  }

  async update(actor: AuthUser, id: string, dto: UpdateRecitationDto) {
    const recitation = await this.prisma.recitation.findFirst({
      where: { id, deletedAt: null },
    });
    if (!recitation) throw new NotFoundException('سجل التسميع غير موجود');
    await this.acl.assertStudentWriteAccess(actor, recitation.studentId);

    // Only the recording teacher (or administration) may edit an entry.
    if (actor.role === Role.TEACHER && recitation.teacherId !== actor.teacherId) {
      throw new ForbiddenException('يمكن تعديل السجل من قبل المعلم الذي سجّله فقط');
    }

    if (dto.fromSurah || dto.toSurah || dto.fromAyah || dto.toAyah) {
      this.validateRange({
        fromSurah: dto.fromSurah ?? recitation.fromSurah,
        fromAyah: dto.fromAyah ?? recitation.fromAyah,
        toSurah: dto.toSurah ?? recitation.toSurah,
        toAyah: dto.toAyah ?? recitation.toAyah,
      });
    }

    return this.prisma.recitation.update({
      where: { id },
      data: {
        date: dto.date ? toDateOnly(dto.date) : undefined,
        type: dto.type,
        fromSurah: dto.fromSurah?.trim(),
        fromAyah: dto.fromAyah,
        toSurah: dto.toSurah?.trim(),
        toAyah: dto.toAyah,
        pagesCount: dto.pagesCount,
        evaluation: dto.evaluation,
        notes: dto.notes,
      },
      include: RECITATION_INCLUDE,
    });
  }

  async remove(actor: AuthUser, id: string) {
    const recitation = await this.prisma.recitation.findFirst({ where: { id, deletedAt: null } });
    if (!recitation) throw new NotFoundException('سجل التسميع غير موجود');
    await this.acl.assertStudentWriteAccess(actor, recitation.studentId);
    if (actor.role === Role.TEACHER && recitation.teacherId !== actor.teacherId) {
      throw new ForbiddenException('يمكن حذف السجل من قبل المعلم الذي سجّله فقط');
    }

    await this.prisma.recitation.update({ where: { id }, data: { deletedAt: new Date() } });
    return { message: 'تم حذف سجل التسميع' };
  }

  /** Progress numbers shown on the student file and the parent portal. */
  async studentProgress(user: AuthUser, studentId: string) {
    await this.acl.assertStudentAccess(user, studentId);

    const [aggregate, byType, byEvaluation, recent, monthly] = await Promise.all([
      this.prisma.recitation.aggregate({
        where: { studentId, deletedAt: null },
        _sum: { pagesCount: true },
        _count: { _all: true },
      }),
      this.prisma.recitation.groupBy({
        by: ['type'],
        where: { studentId, deletedAt: null },
        _count: { _all: true },
        _sum: { pagesCount: true },
      }),
      this.prisma.recitation.groupBy({
        by: ['evaluation'],
        where: { studentId, deletedAt: null, evaluation: { not: null } },
        _count: { _all: true },
      }),
      this.prisma.recitation.findMany({
        where: { studentId, deletedAt: null },
        include: { teacher: { select: { user: { select: { fullName: true } } } } },
        orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
        take: 10,
      }),
      this.prisma.recitation.findMany({
        where: { studentId, deletedAt: null, date: { gte: this.monthsAgo(6) } },
        select: { date: true, pagesCount: true },
        orderBy: { date: 'asc' },
      }),
    ]);

    const monthMap = new Map<string, { pages: number; sessions: number }>();
    monthly.forEach((r) => {
      const key = r.date.toISOString().slice(0, 7);
      const row = monthMap.get(key) ?? { pages: 0, sessions: 0 };
      row.pages += r.pagesCount ?? 0;
      row.sessions += 1;
      monthMap.set(key, row);
    });

    return {
      totalSessions: aggregate._count._all,
      totalPages: Number(aggregate._sum.pagesCount ?? 0),
      // Daily recitation is graded by evaluation, so the summary counts each
      // grade instead of averaging a score that no longer exists.
      byEvaluation: byEvaluation.map((e) => ({
        evaluation: e.evaluation,
        sessions: e._count._all,
      })),
      byType: byType.map((t) => ({
        type: t.type,
        sessions: t._count._all,
        pages: Number(t._sum.pagesCount ?? 0),
      })),
      recent,
      monthlyTrend: [...monthMap.entries()].map(([month, v]) => ({
        month,
        pages: Math.round(v.pages * 10) / 10,
        sessions: v.sessions,
      })),
    };
  }

  // -------------------------------------------------------------------------

  /**
   * A recitation always belongs to a teacher. When an admin or supervisor records
   * one, it is attributed to the circle's primary teacher.
   */
  private async resolveTeacherId(actor: AuthUser, circleId: string) {
    if (actor.role === Role.TEACHER && actor.teacherId) return actor.teacherId;

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
      throw new BadRequestException('نطاق التسميع غير صحيح: البداية بعد النهاية');
    }
  }

  private monthsAgo(n: number) {
    const d = new Date();
    d.setMonth(d.getMonth() - n);
    return new Date(Date.UTC(d.getFullYear(), d.getMonth(), 1));
  }
}
