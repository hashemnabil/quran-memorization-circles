import { createAbsenceAlerts } from './absence-alerts';
import { applyAttendanceEntries } from './attendance-write';
import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { AttendanceStatus, Notification, NotificationType, Prisma, Role } from '@prisma/client';
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

  async absencePermissions(user: AuthUser) {
    const scope = await this.acl.studentScope(user);
    return this.prisma.absencePermissionRequest.findMany({
      where: user.role === 'ADMIN' ? {} : { student: scope },
      include: { student: { select: { id: true, fullName: true, code: true, circleId: true } }, requester: { select: { id: true, fullName: true, role: true } }, decidedBy: { select: { fullName: true } } },
      orderBy: [{ status: 'asc' }, { createdAt: 'desc' }], take: 500,
    });
  }

  async createAbsencePermission(user: AuthUser, input: { studentId: string; date: string; reason: string; durationMinutes: number }) {
    if (user.role !== 'STUDENT') throw new BadRequestException('Only the student can submit this request');
    const durationMinutes = Number.isInteger(input.durationMinutes) ? input.durationMinutes : 1;
    if (durationMinutes < 1 || durationMinutes > 7) throw new BadRequestException('Duration must be between 1 and 7 days');
    if (!input?.studentId || !input.date || !input.reason?.trim()) throw new BadRequestException('الطالب والتاريخ والسبب مطلوبة');
    const student = await this.acl.assertStudentAccess(user, input.studentId);
    if (user.role === 'STUDENT') {
      const own = await this.prisma.student.findFirst({ where: { id: student.id, userId: user.id }, select: { id: true } });
      if (!own) throw new NotFoundException('لا يوجد ملف طالب مرتبط بهذا الحساب');
    }
    if (!student.circleId) throw new BadRequestException('الطالب غير مرتبط بحلقة');
    const date = toDateOnly(input.date);
    if (date < toDateOnly(new Date())) throw new BadRequestException('تاريخ الإذن يجب أن يكون اليوم أو في المستقبل');
    if (await this.prisma.attendance.findUnique({ where: { studentId_date: { studentId: student.id, date } } }))
      throw new ConflictException('يوجد سجل حضور لهذا الطالب في التاريخ المحدد');
    const request = await this.prisma.absencePermissionRequest.create({
      data: { studentId: student.id, requesterId: user.id, date, durationMinutes, reason: input.reason.trim().slice(0, 500) },
      include: { student: { select: { id: true, fullName: true, code: true } }, requester: { select: { fullName: true } } },
    });
    await this.notifications.notifyRoles([Role.ADMIN], { type: NotificationType.ATTENDANCE, title: 'طلب إذن غياب جديد', body: `${request.student.fullName} — ${input.date}`, link: '/absence-permissions', data: { absencePermissionId: request.id } });
    await this.activity.log({ userId: user.id, action: 'ABSENCE_PERMISSION_REQUEST', summary: `طلب إذن غياب للطالب ${request.student.fullName}`, entityType: 'AbsencePermissionRequest', entityId: request.id });
    return request;
  }

  async decideAbsencePermission(actor: AuthUser, id: string, approve: boolean, decisionNote?: string) {
    const request = await this.prisma.absencePermissionRequest.findUnique({ where: { id }, include: { student: { select: { id: true, fullName: true, circleId: true, userId: true, parentProfile: { select: { userId: true } } } } } });
    if (!request) throw new NotFoundException('طلب الإذن غير موجود');
    if (request.status !== 'PENDING') throw new ConflictException('تم اتخاذ قرار بهذا الطلب مسبقًا');
    if (approve && !request.student.circleId) throw new BadRequestException('الطالب لم يعد مرتبطًا بحلقة');
    const saved = await this.prisma.$transaction(async tx => {
      if (approve) {
        const attendance = await tx.attendance.findUnique({ where: { studentId_date: { studentId: request.studentId, date: request.date } } });
        if (attendance) throw new ConflictException('يوجد سجل حضور لهذا الطالب في التاريخ؛ لم يتم اعتماد الطلب');
        await tx.attendance.create({ data: { studentId: request.studentId, circleId: request.student.circleId!, date: request.date, status: AttendanceStatus.EXCUSED, note: request.reason, recordedById: actor.id } });
      }
      return tx.absencePermissionRequest.update({ where: { id }, data: { status: approve ? 'APPROVED' : 'REJECTED', decidedById: actor.id, decidedAt: new Date(), decisionNote: decisionNote?.trim() || null } });
    });
    const resultTitle = approve ? 'تمت الموافقة على إذن الغياب' : 'تم رفض إذن الغياب';
    const resultBody = decisionNote?.trim() || (approve ? 'سُجّل الغياب بعذر في الحضور.' : 'راجع الإدارة لمعرفة التفاصيل.');
    await this.notifications.notify({ userId: request.requesterId, type: NotificationType.ATTENDANCE, title: resultTitle, body: resultBody, link: '/absence-permissions', data: { absencePermissionId: id } });
    await this.notifications.notifyStudent(request.studentId, { type: NotificationType.ATTENDANCE, title: resultTitle, body: resultBody, data: { absencePermissionId: id } });
    await this.activity.log({ userId: actor.id, action: approve ? 'ABSENCE_PERMISSION_APPROVE' : 'ABSENCE_PERMISSION_REJECT', summary: `${resultTitle}: ${request.student.fullName}`, entityType: 'AbsencePermissionRequest', entityId: id });
    return saved;
  }

  async listSummons() {
    return this.prisma.guardianSummons.findMany({ include: { student: { select: { fullName: true, code: true, guardianName: true, guardianPhone: true } }, issuedBy: { select: { fullName: true } } }, orderBy: { createdAt: 'desc' }, take: 500 });
  }

  async createSummons(actor: AuthUser, input: { studentId: string; title: string; body: string }) {
    if (!input?.studentId || !input.title?.trim() || !input.body?.trim()) throw new BadRequestException('الطالب والعنوان ونص الاستدعاء مطلوبة');
    const student = await this.prisma.student.findUnique({ where: { id: input.studentId }, select: { id: true, fullName: true, parentProfile: { select: { userId: true } } } });
    if (!student) throw new NotFoundException('الطالب غير موجود');
    if (!student.parentProfile?.userId) throw new BadRequestException('لا يوجد حساب ولي أمر مرتبط بالطالب لإرسال الإشعار إليه');
    const row = await this.prisma.guardianSummons.create({ data: { studentId: student.id, issuedById: actor.id, title: input.title.trim(), body: input.body.trim() } });
    await this.notifications.notify({ userId: student.parentProfile.userId, type: NotificationType.ATTENDANCE, title: row.title, body: row.body, link: `/parent/children/${student.id}`, data: { guardianSummonsId: row.id, warning: true } });
    await this.activity.log({ userId: actor.id, action: 'GUARDIAN_SUMMON_ISSUED', summary: `إرسال استدعاء لولي أمر ${student.fullName}`, entityType: 'GuardianSummon', entityId: row.id });
    return row;
  }

  /**
   * A small, permission-scoped bootstrap for offline attendance.
   * Student rows are cursor-paginated so large schools never silently truncate.
   * Only roster fields needed to prepare an attendance sheet are returned.
   */
  async offlineBundle(user: AuthUser, cursor?: string, requestedLimit = 500) {
    const limit = Math.min(500, Math.max(1, Number.isFinite(requestedLimit) ? Math.floor(requestedLimit) : 500));
    const allowed = await this.acl.accessibleCircleIds(user);
    const circleWhere: Prisma.CircleWhereInput = {
      deletedAt: null,
      isActive: true,
      ...(allowed !== null ? { id: { in: allowed } } : {}),
    };
    const circles = await this.prisma.circle.findMany({
      where: circleWhere,
      select: { id: true, name: true, code: true, scheduleDays: true, startTime: true },
      orderBy: { id: 'asc' },
    });
    const circleIds = circles.map((circle) => circle.id);
    const rows = circleIds.length
      ? await this.prisma.student.findMany({
          where: {
            circleId: { in: circleIds },
            deletedAt: null,
            status: { in: ['ACTIVE', 'SUSPENDED'] },
          },
          select: { id: true, circleId: true, code: true, fullName: true, status: true, evaluation: true },
          orderBy: { id: 'asc' },
          ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
          take: limit + 1,
        })
      : [];
    const hasMore = rows.length > limit;
    const students = hasMore ? rows.slice(0, limit) : rows;
    return {
      version: 1,
      generatedAt: new Date().toISOString(),
      accountId: user.id,
      circles,
      students,
      nextCursor: hasMore ? students[students.length - 1]?.id ?? null : null,
      complete: !hasMore,
      pageSize: limit,
    };
  }

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
    // Excused permission approvals may be written before the register is submitted.
    // Keep the sheet open until every active roster member has an attendance row.
    const alreadyRecorded = students.length > 0 && students.every(student => byStudent.has(student.id));
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

    // Concurrent submissions from different accounts are serialized per circle/day.
    // PRESENT wins over either absence state, regardless of which request arrives first.
    // Other conflicting non-present states keep the first saved value; use history corrections
    // when an authorized staff member needs to change a saved record deliberately.
    const studentIds = dto.entries.map((entry) => entry.studentId);
    if (new Set(studentIds).size !== studentIds.length) {
      throw new BadRequestException('يوجد طالب مكرر في كشف الحضور');
    }
    const students = await this.prisma.student.findMany({
      where: { id: { in: studentIds }, circleId: dto.circleId, deletedAt: null },
      select: { id: true, fullName: true, parentId: true, parentProfile: { select: { userId: true } } },
    });
    if (students.length !== studentIds.length) {
      throw new BadRequestException('بعض الطلاب المحددين لا ينتمون إلى هذه الحلقة');
    }

    const newlyAbsentIds: string[] = [];
    const savedNotices: Notification[] = [];
    let changedCount = 0;
    await this.prisma.$transaction(async (tx) => {
      // PostgreSQL transaction-scoped lock prevents two accounts from both observing
      // an empty sheet and then racing to overwrite each other's attendance statuses.
      await tx.$queryRaw`SELECT 1 FROM (SELECT pg_advisory_xact_lock(hashtext(${dto.circleId}), hashtext(${date.toISOString()}))) AS locked`;
      const applied = await applyAttendanceEntries(tx, actor, dto, date);
      newlyAbsentIds.push(...applied.newlyAbsentIds);
      changedCount = applied.changedCount;
      for (const id of [...newlyAbsentIds].sort()) savedNotices.push(...await createAbsenceAlerts(tx, id, date));
    }, { timeout: 30000 });
    for (const notice of savedNotices) await this.notifications.deliver(notice);

    // Replays that changed nothing must not duplicate notifications or activity logs.
    if (changedCount === 0) {
      return {
        message: 'تمت معالجة كشف الحضور؛ الحالة المحفوظة هي المعتمدة',
        date: dto.date,
        circleId: dto.circleId,
        count: dto.entries.length,
        idempotentReplay: true,
      };
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
      presentWinsConflicts: true,
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

    const savedNotices: Notification[] = [];
    const updated = await this.prisma.$transaction(async tx => {
      const updated = await tx.attendance.update({
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

      if (dto.status === AttendanceStatus.ABSENT && record.status !== AttendanceStatus.ABSENT) savedNotices.push(...await createAbsenceAlerts(tx, record.studentId, record.date));
      return updated;
    });
    for (const notice of savedNotices) await this.notifications.deliver(notice);

    const dateLabel = record.date.toISOString().slice(0, 10);

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
