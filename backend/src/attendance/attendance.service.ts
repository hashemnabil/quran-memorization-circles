import { BadRequestException, Injectable } from '@nestjs/common';
import { AttendanceStatus, NotificationType, Prisma, Role } from '@prisma/client';
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
      /** False once the day is submitted, unless this user may correct it. */
      canSubmit: !alreadyRecorded || this.mayOverride(user),
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

    // One submission per circle per day. The button is hidden in the UI too, but
    // this is the check that actually prevents a duplicate.
    const existing = await this.prisma.attendance.findFirst({
      where: { circleId: dto.circleId, date },
      select: { id: true },
    });
    if (existing && !this.mayOverride(actor)) {
      throw new BadRequestException(
        'تم تسجيل حضور هذه الحلقة لهذا اليوم مسبقاً، يمكن للمشرف أو الإدارة تعديله عند الحاجة',
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
      message: existing ? 'تم تعديل سجل الحضور بنجاح' : 'تم حفظ سجل الحضور بنجاح',
      count: dto.entries.length,
    };
  }

  /** Only administration may re-submit a day that a teacher has already closed. */
  private mayOverride(user: AuthUser) {
    return user.role === Role.ADMIN || user.role === Role.SUPERVISOR;
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
