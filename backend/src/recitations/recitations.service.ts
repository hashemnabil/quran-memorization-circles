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
import { SURAHS, countVerses, findSurah } from '../common/quran';
import { calculatePoints, pointsBreakdown } from '../common/points';
import { StudentsService } from '../students/students.service';
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
    private readonly students: StudentsService,
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

  /**
   * The recitation log, read the way the school actually reads it: by day
   * first, then by circle, then by student — the same shape as the attendance
   * record, because it answers the same kind of question ("what happened in the
   * circles on Tuesday?") rather than "list every row ever".
   */
  async history(user: AuthUser, query: QueryRecitationsDto) {
    const allowedCircles = await this.acl.accessibleCircleIds(user);
    if (allowedCircles !== null && allowedCircles.length === 0) {
      return paginate([], 0, query.page, query.limit);
    }
    if (query.circleId) await this.acl.assertCircleAccess(user, query.circleId);

    const where: Prisma.RecitationWhereInput = {
      deletedAt: null,
      ...(allowedCircles !== null ? { circleId: { in: allowedCircles } } : {}),
      ...(query.circleId ? { circleId: query.circleId } : {}),
      ...(query.type ? { type: query.type } : {}),
      ...(query.evaluation ? { evaluation: query.evaluation } : {}),
      ...(query.teacherId ? { teacherId: query.teacherId } : {}),
      ...(query.from || query.to
        ? {
            date: {
              ...(query.from ? { gte: toDateOnly(query.from) } : {}),
              ...(query.to ? { lte: toDateOnly(query.to) } : {}),
            },
          }
        : {}),
    };

    // One row per (day, circle); folded into a day-major tree below.
    const grouped = await this.prisma.recitation.groupBy({
      by: ['date', 'circleId'],
      where,
      _count: { _all: true },
      _sum: { points: true, pagesCount: true, mistakes: true, warnings: true },
      orderBy: { date: 'desc' },
    });

    const dates = [...new Set(grouped.map((g) => g.date.toISOString().slice(0, 10)))].sort((a, b) =>
      b.localeCompare(a),
    );
    const pageDates = dates.slice(query.skip, query.skip + query.take);

    const circleIds = [...new Set(grouped.map((g) => g.circleId).filter(Boolean))] as string[];
    const circles = await this.prisma.circle.findMany({
      where: { id: { in: circleIds } },
      select: { id: true, name: true, code: true },
    });
    const circleById = new Map(circles.map((c) => [c.id, c]));

    // How many distinct students recited in each (day, circle).
    const perStudent = pageDates.length
      ? await this.prisma.recitation.groupBy({
          by: ['date', 'circleId', 'studentId'],
          where: { ...where, date: { in: pageDates.map((d) => toDateOnly(d)) } },
          _count: { _all: true },
        })
      : [];

    const days = pageDates.map((date) => {
      const rows = grouped.filter((g) => g.date.toISOString().slice(0, 10) === date);
      const byCircle = rows.map((row) => {
        const students = perStudent.filter(
          (x) => x.date.toISOString().slice(0, 10) === date && x.circleId === row.circleId,
        ).length;
        return {
          circle: row.circleId
            ? circleById.get(row.circleId) ?? { id: row.circleId, name: '—', code: '—' }
            : { id: 'none', name: 'بدون حلقة', code: '—' },
          sessions: row._count._all,
          students,
          points: Math.round((row._sum.points ?? 0) * 100) / 100,
          pages: row._sum.pagesCount ?? 0,
          mistakes: row._sum.mistakes ?? 0,
          warnings: row._sum.warnings ?? 0,
        };
      });

      const totals = byCircle.reduce(
        (acc, c) => ({
          sessions: acc.sessions + c.sessions,
          students: acc.students + c.students,
          points: acc.points + c.points,
          pages: acc.pages + c.pages,
        }),
        { sessions: 0, students: 0, points: 0, pages: 0 },
      );

      return {
        date,
        circlesCount: byCircle.length,
        ...totals,
        points: Math.round(totals.points * 100) / 100,
        circles: byCircle.sort((a, b) => a.circle.name.localeCompare(b.circle.name, 'ar')),
      };
    });

    return paginate(days, dates.length, query.page, query.limit);
  }

  /** The individual recitations behind one circle on one day. */
  async historyDetail(user: AuthUser, date: string, circleId: string) {
    const real = circleId === 'none' ? null : circleId;
    if (real) await this.acl.assertCircleAccess(user, real);
    const day = toDateOnly(date);

    const records = await this.prisma.recitation.findMany({
      where: { deletedAt: null, date: day, circleId: real },
      include: RECITATION_INCLUDE,
      orderBy: [{ student: { fullName: 'asc' } }, { createdAt: 'asc' }],
    });

    const circle = real
      ? await this.prisma.circle.findUnique({
          where: { id: real },
          select: { id: true, name: true, code: true },
        })
      : null;

    // Grouped by student: one child may recite more than once in a day.
    const byStudent = new Map<string, { student: any; records: typeof records }>();
    for (const record of records) {
      const entry = byStudent.get(record.studentId) ?? { student: record.student, records: [] };
      entry.records.push(record);
      byStudent.set(record.studentId, entry);
    }

    return {
      date,
      circle,
      totals: {
        sessions: records.length,
        students: byStudent.size,
        points: Math.round(records.reduce((sum, r) => sum + (r.points ?? 0), 0) * 100) / 100,
        pages: records.reduce((sum, r) => sum + (r.pagesCount ?? 0), 0),
      },
      students: [...byStudent.values()].map((entry) => ({
        student: entry.student,
        sessions: entry.records.length,
        points: Math.round(entry.records.reduce((sum, r) => sum + (r.points ?? 0), 0) * 100) / 100,
        records: entry.records,
      })),
    };
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

    // One point per ayah, minus the deductions. Counting the ayat from the
    // range means the teacher never has to do arithmetic to record a session.
    const verses =
      dto.versesCount ?? countVerses(dto.fromSurah, dto.fromAyah, dto.toSurah, dto.toAyah);
    const points = calculatePoints({
      versesCount: verses,
      mistakes: dto.mistakes,
      warnings: dto.warnings,
    });

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
        versesCount: verses,
        mistakes: dto.mistakes ?? 0,
        warnings: dto.warnings ?? 0,
        points,
        evaluation: dto.evaluation,
        notes: dto.notes,
      },
      include: RECITATION_INCLUDE,
    });

    await this.students.recalculatePoints(dto.studentId);

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

    return { ...recitation, breakdown: pointsBreakdown({ versesCount: verses, mistakes: dto.mistakes, warnings: dto.warnings }) };
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

    // Any edit to the range or the deductions re-scores the session, so the
    // stored points always match the record the teacher is looking at.
    const fromSurah = dto.fromSurah?.trim() ?? recitation.fromSurah;
    const fromAyah = dto.fromAyah ?? recitation.fromAyah;
    const toSurah = dto.toSurah?.trim() ?? recitation.toSurah;
    const toAyah = dto.toAyah ?? recitation.toAyah;
    const mistakes = dto.mistakes ?? recitation.mistakes;
    const warnings = dto.warnings ?? recitation.warnings;
    const verses =
      dto.versesCount ??
      (dto.fromSurah || dto.toSurah || dto.fromAyah !== undefined || dto.toAyah !== undefined
        ? countVerses(fromSurah, fromAyah, toSurah, toAyah)
        : (recitation.versesCount ?? countVerses(fromSurah, fromAyah, toSurah, toAyah)));

    const updated = await this.prisma.recitation.update({
      where: { id },
      data: {
        date: dto.date ? toDateOnly(dto.date) : undefined,
        type: dto.type,
        fromSurah: dto.fromSurah?.trim(),
        fromAyah: dto.fromAyah,
        toSurah: dto.toSurah?.trim(),
        toAyah: dto.toAyah,
        pagesCount: dto.pagesCount,
        versesCount: verses,
        mistakes,
        warnings,
        points: calculatePoints({ versesCount: verses, mistakes, warnings }),
        evaluation: dto.evaluation,
        notes: dto.notes,
      },
      include: RECITATION_INCLUDE,
    });

    await this.students.recalculatePoints(recitation.studentId);
    return {
      ...updated,
      breakdown: pointsBreakdown({ versesCount: verses, mistakes, warnings }),
    };
  }

  async remove(actor: AuthUser, id: string) {
    const recitation = await this.prisma.recitation.findFirst({ where: { id, deletedAt: null } });
    if (!recitation) throw new NotFoundException('سجل التسميع غير موجود');
    await this.acl.assertStudentWriteAccess(actor, recitation.studentId);
    if (actor.role === Role.TEACHER && recitation.teacherId !== actor.teacherId) {
      throw new ForbiddenException('يمكن حذف السجل من قبل المعلم الذي سجّله فقط');
    }

    await this.prisma.recitation.update({ where: { id }, data: { deletedAt: new Date() } });
    // The deleted session's points must come back off the running total.
    await this.students.recalculatePoints(recitation.studentId);
    return { message: 'تم حذف سجل التسميع' };
  }

  /** Progress numbers shown on the student file and the parent portal. */
  async studentProgress(user: AuthUser, studentId: string) {
    await this.acl.assertStudentAccess(user, studentId);

    const [aggregate, byType, byEvaluation, recent, monthly] = await Promise.all([
      this.prisma.recitation.aggregate({
        where: { studentId, deletedAt: null },
        _sum: { pagesCount: true, points: true, mistakes: true, warnings: true, versesCount: true },
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

    const [student, surahs] = await Promise.all([
      this.prisma.student.findUnique({
        where: { id: studentId },
        select: { totalPoints: true },
      }),
      this.prisma.surahCompletion.findMany({
        where: { studentId },
        orderBy: { completedAt: 'desc' },
      }),
    ]);

    return {
      totalSessions: aggregate._count._all,
      totalPages: Number(aggregate._sum.pagesCount ?? 0),
      // Points: the cumulative balance plus the breakdown that produced it.
      points: {
        total: student?.totalPoints ?? 0,
        fromRecitations: Math.round(Number(aggregate._sum.points ?? 0) * 100) / 100,
        fromSurahs: Math.round(surahs.reduce((s, c) => s + c.points, 0) * 100) / 100,
        verses: aggregate._sum.versesCount ?? 0,
        mistakes: aggregate._sum.mistakes ?? 0,
        warnings: aggregate._sum.warnings ?? 0,
      },
      surahCompletions: surahs,
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
