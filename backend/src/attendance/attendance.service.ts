import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { AttendanceStatus, NotificationType, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AccessControlService } from '../common/services/access-control.service';
import { ActivityService } from '../common/services/activity.service';
import { NotificationsService } from '../notifications/notifications.service';
import { AuthUser } from '../common/decorators';
import { paginate } from '../common/dto/pagination.dto';
import {
  AttendanceSheetQueryDto,
  QueryAttendanceDto,
  RecordAttendanceDto,
  UpdateAttendanceEntryDto,
} from './dto/attendance.dto';

/** Converts a `YYYY-MM-DD` string into the UTC midnight value stored in a `@db.Date` column. */
function toDateOnly(value: string | Date): Date {
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) throw new BadRequestException('التاريخ غير صالح');
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

@Injectable()
export class AttendanceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly acl: AccessControlService,
    private readonly activity: ActivityService,
    private readonly notifications: NotificationsService,
  ) {}

  /** The roster for a circle on a date, pre-filled with whatever was already recorded. */
  async sheet(user: AuthUser, query: AttendanceSheetQueryDto) {
    await this.acl.assertCircleAccess(user, query.circleId);
    const date = toDateOnly(query.date);

    const [students, existing, circle] = await Promise.all([
      this.prisma.student.findMany({
        where: { circleId: query.circleId, deletedAt: null, status: { in: ['ACTIVE', 'SUSPENDED'] } },
        select: { id: true, code: true, fullName: true, status: true, evaluation: true },
        orderBy: { fullName: 'asc' },
      }),
      this.prisma.attendance.findMany({
        where: { circleId: query.circleId, date },
        select: {
          studentId: true,
          status: true,
          note: true,
          createdAt: true,
          recordedBy: { select: { id: true, fullName: true } },
        },
      }),
      this.prisma.circle.findUnique({
        where: { id: query.circleId },
        select: { id: true, name: true, code: true, scheduleDays: true, startTime: true },
      }),
    ]);

    const byStudent = new Map(existing.map((e) => [e.studentId, e]));
    const alreadyRecorded = existing.length > 0;
    const first = existing[0];

    return {
      circle,
      date: query.date,
      alreadyRecorded,
      /**
       * The register is a one-way door: once a day is submitted the form is
       * gone for everyone and the day lives in the history, where individual
       * students can still be corrected one at a time.
       */
      canSubmit: !alreadyRecorded,
      submittedAt: first?.createdAt ?? null,
      submittedBy: first?.recordedBy ?? null,
      students: students.map((s) => ({
        ...s,
        attendance: byStudent.get(s.id) ?? null,
      })),
    };
  }

  async record(actor: AuthUser, dto: RecordAttendanceDto) {
    await this.acl.assertCircleWriteAccess(actor, dto.circleId);
    const date = toDateOnly(dto.date);

    if (date.getTime() > toDateOnly(new Date()).getTime()) {
      throw new BadRequestException('لا يمكن تسجيل الحضور لتاريخ مستقبلي');
    }

    // One submission per circle per day. The form disappears in the UI too, but
    // this is the check that actually prevents a duplicate — a correction after
    // the fact goes through `updateRecord`, one student at a time.
    const existing = await this.prisma.attendance.findFirst({
      where: { circleId: dto.circleId, date },
      select: { id: true },
    });
    if (existing) {
      throw new BadRequestException(
        'تم حفظ كشف حضور هذه الحلقة لهذا اليوم، ويمكن تعديل حضور أي طالب من سجل الحضور',
      );
    }

    // Every student in the payload must actually belong to this circle.
    const studentIds = dto.entries.map((e) => e.studentId);
    const students = await this.prisma.student.findMany({
      where: { id: { in: studentIds }, circleId: dto.circleId, deletedAt: null },
      select: { id: true, fullName: true, parentId: true, parentProfile: { select: { userId: true } } },
    });
    if (students.length !== new Set(studentIds).size) {
      throw new BadRequestException('بعض الطلاب المحددين لا ينتمون إلى هذه الحلقة');
    }

    await this.prisma.$transaction(
      dto.entries.map((entry) =>
        this.prisma.attendance.upsert({
          where: { studentId_date: { studentId: entry.studentId, date } },
          create: {
            studentId: entry.studentId,
            circleId: dto.circleId,
            date,
            status: entry.status,
            // The reason only belongs to an excused absence.
            note: entry.status === AttendanceStatus.EXCUSED ? entry.note ?? null : null,
            recordedById: actor.id,
          },
          update: {
            status: entry.status,
            circleId: dto.circleId,
            note: entry.status === AttendanceStatus.EXCUSED ? entry.note ?? null : null,
            recordedById: actor.id,
          },
        }),
      ),
    );

    // Let parents know about an unexcused absence the same day.
    const absentIds = dto.entries
      .filter((e) => e.status === AttendanceStatus.ABSENT)
      .map((e) => e.studentId);

    for (const student of students.filter((s) => absentIds.includes(s.id))) {
      if (student.parentProfile?.userId) {
        await this.notifications.notify({
          userId: student.parentProfile.userId,
          type: NotificationType.ATTENDANCE,
          title: 'تسجيل غياب',
          body: `تم تسجيل غياب الطالب ${student.fullName} بتاريخ ${dto.date}`,
          link: `/parent/children/${student.id}`,
        });
      }
    }

    await this.activity.log({
      userId: actor.id,
      action: 'ATTENDANCE_RECORD',
      summary: `تسجيل حضور ${dto.entries.length} طالب بتاريخ ${dto.date}`,
      entityType: 'Circle',
      entityId: dto.circleId,
    });

    return {
      message: 'تم حفظ كشف الحضور لهذا اليوم',
      date: dto.date,
      circleId: dto.circleId,
      count: dto.entries.length,
    };
  }

  /**
   * Corrects one student's row after the sheet has been submitted.
   *
   * The register closes as soon as it is saved — the form disappears and the
   * day moves to the history — so this is the only way back into a recorded
   * day, and it deliberately touches a single student rather than the sheet.
   */
  async updateRecord(actor: AuthUser, id: string, dto: UpdateAttendanceEntryDto) {
    const record = await this.prisma.attendance.findUnique({
      where: { id },
      include: {
        student: {
          select: { id: true, fullName: true, parentProfile: { select: { userId: true } } },
        },
      },
    });
    if (!record) throw new NotFoundException('سجل الحضور غير موجود');
    await this.acl.assertCircleWriteAccess(actor, record.circleId);

    const updated = await this.prisma.attendance.update({
      where: { id },
      data: {
        status: dto.status,
        note: dto.status === AttendanceStatus.EXCUSED ? dto.note ?? null : null,
        recordedById: actor.id,
      },
      include: {
        student: { select: { id: true, code: true, fullName: true, status: true } },
        recordedBy: { select: { id: true, fullName: true } },
      },
    });

    const dateLabel = record.date.toISOString().slice(0, 10);

    // Only a change *into* an unexcused absence is worth waking the family for.
    if (
      dto.status === AttendanceStatus.ABSENT &&
      record.status !== AttendanceStatus.ABSENT &&
      record.student.parentProfile?.userId
    ) {
      await this.notifications.notify({
        userId: record.student.parentProfile.userId,
        type: NotificationType.ATTENDANCE,
        title: 'تعديل سجل الحضور',
        body: `تم تسجيل غياب الطالب ${record.student.fullName} بتاريخ ${dateLabel}`,
        link: `/parent/children/${record.student.id}`,
      });
    }

    await this.activity.log({
      userId: actor.id,
      action: 'ATTENDANCE_UPDATE',
      summary: `تعديل حضور ${record.student.fullName} بتاريخ ${dateLabel}`,
      entityType: 'Attendance',
      entityId: id,
    });

    return { message: 'تم تحديث سجل الطالب', record: updated };
  }

  async findAll(user: AuthUser, query: QueryAttendanceDto) {
    const scope = await this.acl.studentScope(user);

    const where: Prisma.AttendanceWhereInput = {
      student: { ...scope, deletedAt: null },
      ...(query.circleId ? { circleId: query.circleId } : {}),
      ...(query.studentId ? { studentId: query.studentId } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.from || query.to
        ? {
            date: {
              ...(query.from ? { gte: toDateOnly(query.from) } : {}),
              ...(query.to ? { lte: toDateOnly(query.to) } : {}),
            },
          }
        : {}),
    };

    if (query.circleId) await this.acl.assertCircleAccess(user, query.circleId);
    if (query.studentId) await this.acl.assertStudentAccess(user, query.studentId);

    const [data, total] = await this.prisma.$transaction([
      this.prisma.attendance.findMany({
        where,
        include: {
          student: { select: { id: true, code: true, fullName: true } },
          circle: { select: { id: true, name: true, code: true } },
          recordedBy: { select: { id: true, fullName: true } },
        },
        orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
        skip: query.skip,
        take: query.take,
      }),
      this.prisma.attendance.count({ where }),
    ]);

    return paginate(data, total, query.page, query.limit);
  }

  /**
   * Attendance history, organised by day first and circle second.
   *
   * Once a day is submitted the sheet disappears from the "record attendance"
   * screen and shows up here instead, which is why this is grouped the way the
   * administration actually reads it: "the register for 21 August" listing every
   * circle, each of which opens into its own students.
   */
  async history(user: AuthUser, query: QueryAttendanceDto) {
    const allowedCircles = await this.acl.accessibleCircleIds(user);
    if (allowedCircles !== null && allowedCircles.length === 0) {
      return paginate([], 0, query.page, query.limit);
    }

    const where: Prisma.AttendanceWhereInput = {
      ...(allowedCircles !== null ? { circleId: { in: allowedCircles } } : {}),
      ...(query.circleId ? { circleId: query.circleId } : {}),
      ...(query.from || query.to
        ? {
            date: {
              ...(query.from ? { gte: toDateOnly(query.from) } : {}),
              ...(query.to ? { lte: toDateOnly(query.to) } : {}),
            },
          }
        : {}),
    };
    if (query.circleId) await this.acl.assertCircleAccess(user, query.circleId);

    // One row per (day, circle, status); folded into a day-major tree below.
    const grouped = await this.prisma.attendance.groupBy({
      by: ['date', 'circleId', 'status'],
      where,
      _count: { _all: true },
      orderBy: { date: 'desc' },
    });

    const dates = [...new Set(grouped.map((g) => g.date.toISOString().slice(0, 10)))].sort((a, b) =>
      b.localeCompare(a),
    );
    const pageDates = dates.slice(query.skip, query.skip + query.take);

    const circleIds = [...new Set(grouped.map((g) => g.circleId))];
    const circles = await this.prisma.circle.findMany({
      where: { id: { in: circleIds } },
      select: { id: true, name: true, code: true },
    });
    const circleById = new Map(circles.map((c) => [c.id, c]));

    // Who submitted each (day, circle), for the "recorded by" column.
    const submissions = pageDates.length
      ? await this.prisma.attendance.findMany({
          where: {
            ...where,
            date: { in: pageDates.map((d) => toDateOnly(d)) },
          },
          distinct: ['date', 'circleId'],
          select: {
            date: true,
            circleId: true,
            createdAt: true,
            recordedBy: { select: { id: true, fullName: true } },
          },
          orderBy: { createdAt: 'asc' },
        })
      : [];
    const submissionKey = (d: string, c: string) => `${d}|${c}`;
    const submissionBy = new Map(
      submissions.map((s) => [
        submissionKey(s.date.toISOString().slice(0, 10), s.circleId),
        { at: s.createdAt, by: s.recordedBy },
      ]),
    );

    const days = pageDates.map((date) => {
      const rows = grouped.filter((g) => g.date.toISOString().slice(0, 10) === date);
      const byCircle = [...new Set(rows.map((r) => r.circleId))].map((circleId) => {
        const own = rows.filter((r) => r.circleId === circleId);
        const get = (s: AttendanceStatus) => own.find((r) => r.status === s)?._count._all ?? 0;
        const present = get(AttendanceStatus.PRESENT);
        const absent = get(AttendanceStatus.ABSENT);
        const excused = get(AttendanceStatus.EXCUSED);
        const total = present + absent + excused;
        const submission = submissionBy.get(submissionKey(date, circleId));
        return {
          circle: circleById.get(circleId) ?? { id: circleId, name: '—', code: '—' },
          present,
          absent,
          excused,
          total,
          attendanceRate: total ? Math.round((present / total) * 100) : 0,
          submittedAt: submission?.at ?? null,
          submittedBy: submission?.by ?? null,
        };
      });

      const totals = byCircle.reduce(
        (acc, c) => ({
          present: acc.present + c.present,
          absent: acc.absent + c.absent,
          excused: acc.excused + c.excused,
          total: acc.total + c.total,
        }),
        { present: 0, absent: 0, excused: 0, total: 0 },
      );

      return {
        date,
        circlesCount: byCircle.length,
        ...totals,
        attendanceRate: totals.total ? Math.round((totals.present / totals.total) * 100) : 0,
        circles: byCircle.sort((a, b) => a.circle.name.localeCompare(b.circle.name, 'ar')),
      };
    });

    return paginate(days, dates.length, query.page, query.limit);
  }

  /** The individual student rows behind one circle on one day. */
  async historyDetail(user: AuthUser, date: string, circleId: string) {
    await this.acl.assertCircleAccess(user, circleId);
    const day = toDateOnly(date);

    const records = await this.prisma.attendance.findMany({
      where: { circleId, date: day },
      include: {
        student: { select: { id: true, code: true, fullName: true, status: true } },
        recordedBy: { select: { id: true, fullName: true } },
      },
      orderBy: { student: { fullName: 'asc' } },
    });

    const circle = await this.prisma.circle.findUnique({
      where: { id: circleId },
      select: { id: true, name: true, code: true },
    });

    const count = (s: AttendanceStatus) => records.filter((r) => r.status === s).length;
    const present = count(AttendanceStatus.PRESENT);

    return {
      date,
      circle,
      submittedAt: records[0]?.createdAt ?? null,
      submittedBy: records[0]?.recordedBy ?? null,
      totals: {
        present,
        absent: count(AttendanceStatus.ABSENT),
        excused: count(AttendanceStatus.EXCUSED),
        total: records.length,
        attendanceRate: records.length ? Math.round((present / records.length) * 100) : 0,
      },
      records,
    };
  }

  /** Aggregated statistics used by dashboards and the reports page. */
  async stats(user: AuthUser, query: QueryAttendanceDto) {
    const scope = await this.acl.studentScope(user);
    if (query.circleId) await this.acl.assertCircleAccess(user, query.circleId);
    if (query.studentId) await this.acl.assertStudentAccess(user, query.studentId);

    const where: Prisma.AttendanceWhereInput = {
      student: { ...scope, deletedAt: null },
      ...(query.circleId ? { circleId: query.circleId } : {}),
      ...(query.studentId ? { studentId: query.studentId } : {}),
      ...(query.from || query.to
        ? {
            date: {
              ...(query.from ? { gte: toDateOnly(query.from) } : {}),
              ...(query.to ? { lte: toDateOnly(query.to) } : {}),
            },
          }
        : {}),
    };

    const grouped = await this.prisma.attendance.groupBy({
      by: ['status'],
      where,
      _count: { _all: true },
    });

    const counts = {
      PRESENT: 0,
      ABSENT: 0,
      EXCUSED: 0,
    } as Record<AttendanceStatus, number>;
    grouped.forEach((g) => (counts[g.status] = g._count._all));

    const total = Object.values(counts).reduce((a, b) => a + b, 0);

    // Daily trend for the last 30 recorded days.
    const daily = await this.prisma.attendance.groupBy({
      by: ['date', 'status'],
      where,
      _count: { _all: true },
      orderBy: { date: 'desc' },
      take: 120,
    });

    const trendMap = new Map<string, Record<string, number>>();
    daily.forEach((d) => {
      const key = d.date.toISOString().slice(0, 10);
      const row = trendMap.get(key) ?? { PRESENT: 0, ABSENT: 0, EXCUSED: 0 };
      row[d.status] = d._count._all;
      trendMap.set(key, row);
    });

    return {
      total,
      counts,
      attendanceRate: total ? Math.round((counts.PRESENT / total) * 100) : 0,
      absenceRate: total ? Math.round(((counts.ABSENT + counts.EXCUSED) / total) * 100) : 0,
      trend: [...trendMap.entries()]
        .sort((a, b) => a[0].localeCompare(b[0]))
        .slice(-30)
        .map(([date, values]) => ({ date, ...values })),
    };
  }

  /** Per-student attendance summary for a circle, used by supervisors and teachers. */
  async circleSummary(user: AuthUser, circleId: string, from?: string, to?: string) {
    await this.acl.assertCircleAccess(user, circleId);

    const where: Prisma.AttendanceWhereInput = {
      circleId,
      ...(from || to
        ? {
            date: {
              ...(from ? { gte: toDateOnly(from) } : {}),
              ...(to ? { lte: toDateOnly(to) } : {}),
            },
          }
        : {}),
    };

    const [students, records] = await Promise.all([
      this.prisma.student.findMany({
        where: { circleId, deletedAt: null },
        select: { id: true, code: true, fullName: true, status: true },
        orderBy: { fullName: 'asc' },
      }),
      this.prisma.attendance.groupBy({
        by: ['studentId', 'status'],
        where,
        _count: { _all: true },
      }),
    ]);

    return students.map((student) => {
      const rows = records.filter((r) => r.studentId === student.id);
      const get = (s: AttendanceStatus) => rows.find((r) => r.status === s)?._count._all ?? 0;
      const present = get('PRESENT');
      const absent = get('ABSENT');
      const excused = get('EXCUSED');
      const total = present + absent + excused;
      return {
        ...student,
        present,
        absent,
        excused,
        total,
        attendanceRate: total ? Math.round((present / total) * 100) : 0,
      };
    });
  }
}
