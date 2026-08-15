import { Injectable } from '@nestjs/common';
import { ExamResult, ExamStatus, Prisma, RequestStatus, Role, StudentStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AccessControlService } from '../common/services/access-control.service';
import { SuspensionsService } from '../suspensions/suspensions.service';
import { AuthUser } from '../common/decorators';

@Injectable()
export class DashboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly acl: AccessControlService,
    private readonly suspensions: SuspensionsService,
  ) {}

  /** One entry point; the payload adapts to the caller's role. */
  async overview(user: AuthUser) {
    // Cheap housekeeping: bring back students whose suspension has elapsed.
    await this.suspensions.releaseExpired();

    switch (user.role) {
      case Role.ADMIN:
        return this.adminOverview(user);
      case Role.SUPERVISOR:
        return this.supervisorOverview(user);
      case Role.TEACHER:
        return this.teacherOverview(user);
      case Role.EXAM_COMMITTEE:
        return this.committeeOverview(user);
      case Role.SUPPORT:
        return this.supportOverview(user);
      case Role.PARENT:
        return this.parentOverview(user);
      default:
        return { role: user.role };
    }
  }

  // --- admin ---------------------------------------------------------------

  private async adminOverview(user: AuthUser) {
    const [
      students,
      activeStudents,
      suspendedStudents,
      teachers,
      supervisors,
      circles,
      activeCircles,
      pendingTransfers,
      pendingSuspensions,
      pendingExamRequests,
      upcomingExams,
      openTickets,
      parents,
    ] = await Promise.all([
      this.prisma.student.count({ where: { deletedAt: null } }),
      this.prisma.student.count({ where: { deletedAt: null, status: StudentStatus.ACTIVE } }),
      this.prisma.student.count({ where: { deletedAt: null, status: StudentStatus.SUSPENDED } }),
      this.prisma.teacherProfile.count({ where: { deletedAt: null, isActive: true } }),
      this.prisma.user.count({ where: { deletedAt: null, role: Role.SUPERVISOR, isActive: true } }),
      this.prisma.circle.count({ where: { deletedAt: null } }),
      this.prisma.circle.count({ where: { deletedAt: null, isActive: true } }),
      this.prisma.transferRequest.count({ where: { status: RequestStatus.PENDING } }),
      this.prisma.suspensionRequest.count({ where: { status: RequestStatus.PENDING } }),
      this.prisma.examRequest.count({ where: { status: 'PENDING' } }),
      this.prisma.exam.count({
        where: { status: ExamStatus.SCHEDULED, scheduledAt: { gte: new Date() } },
      }),
      this.prisma.supportTicket.count({
        where: { deletedAt: null, status: { in: ['OPEN', 'IN_PROGRESS'] } },
      }),
      this.prisma.parentProfile.count({ where: { deletedAt: null } }),
    ]);

    const [attendanceToday, evaluationBreakdown, activity, nextExams, topCircles] = await Promise.all([
      this.attendanceForDate(this.today()),
      this.prisma.student.groupBy({
        by: ['evaluation'],
        where: { deletedAt: null, evaluation: { not: null } },
        _count: { _all: true },
      }),
      this.prisma.activityLog.findMany({
        orderBy: { createdAt: 'desc' },
        take: 15,
        include: { user: { select: { id: true, fullName: true, role: true } } },
      }),
      this.prisma.exam.findMany({
        where: { status: ExamStatus.SCHEDULED, scheduledAt: { gte: new Date() } },
        include: {
          student: { select: { fullName: true } },
          section: { select: { name: true } },
          examiner: { select: { fullName: true } },
        },
        orderBy: { scheduledAt: 'asc' },
        take: 8,
      }),
      this.prisma.circle.findMany({
        where: { deletedAt: null, isActive: true },
        select: {
          id: true,
          name: true,
          code: true,
          capacity: true,
          _count: { select: { students: { where: { deletedAt: null } } } },
        },
        orderBy: { students: { _count: 'desc' } },
        take: 6,
      }),
    ]);

    return {
      role: Role.ADMIN,
      counts: {
        students,
        activeStudents,
        suspendedStudents,
        teachers,
        supervisors,
        parents,
        circles,
        activeCircles,
      },
      pending: {
        transfers: pendingTransfers,
        suspensions: pendingSuspensions,
        examRequests: pendingExamRequests,
        supportTickets: openTickets,
      },
      upcomingExamsCount: upcomingExams,
      attendanceToday,
      evaluationBreakdown: evaluationBreakdown.map((e) => ({
        evaluation: e.evaluation,
        count: e._count._all,
      })),
      nextExams,
      topCircles: topCircles.map((c) => ({
        id: c.id,
        name: c.name,
        code: c.code,
        students: c._count.students,
        capacity: c.capacity,
        fillRate: Math.round((c._count.students / c.capacity) * 100),
      })),
      activity,
      weeklyAttendance: await this.weeklyAttendance(),
    };
  }

  // --- supervisor ----------------------------------------------------------

  private async supervisorOverview(user: AuthUser) {
    const circleIds = await this.acl.supervisorCircleIds(user);
    const studentFilter: Prisma.StudentWhereInput = { deletedAt: null, circleId: { in: circleIds } };

    const [circles, students, activeStudents, suspended, teachersCount, pendingTransfers, upcomingExams] =
      await Promise.all([
        this.prisma.circle.findMany({
          where: { id: { in: circleIds }, deletedAt: null },
          select: {
            id: true,
            name: true,
            code: true,
            isActive: true,
            capacity: true,
            startTime: true,
            endTime: true,
            scheduleDays: true,
            _count: { select: { students: { where: { deletedAt: null } } } },
            teachers: {
              where: { endedAt: null },
              select: { role: true, teacher: { select: { user: { select: { fullName: true } } } } },
            },
          },
        }),
        this.prisma.student.count({ where: studentFilter }),
        this.prisma.student.count({ where: { ...studentFilter, status: StudentStatus.ACTIVE } }),
        this.prisma.student.count({ where: { ...studentFilter, status: StudentStatus.SUSPENDED } }),
        this.prisma.circleTeacher.findMany({
          where: { circleId: { in: circleIds }, endedAt: null },
          select: { teacherId: true },
        }),
        this.prisma.transferRequest.count({
          where: {
            status: RequestStatus.PENDING,
            OR: [{ fromCircleId: { in: circleIds } }, { toCircleId: { in: circleIds } }],
          },
        }),
        this.prisma.exam.count({
          where: {
            status: ExamStatus.SCHEDULED,
            scheduledAt: { gte: new Date() },
            student: studentFilter,
          },
        }),
      ]);

    return {
      role: Role.SUPERVISOR,
      counts: {
        circles: circles.length,
        students,
        activeStudents,
        suspendedStudents: suspended,
        teachers: new Set(teachersCount.map((t) => t.teacherId)).size,
      },
      pending: { transfers: pendingTransfers },
      upcomingExamsCount: upcomingExams,
      attendanceToday: await this.attendanceForDate(this.today(), circleIds),
      weeklyAttendance: await this.weeklyAttendance(circleIds),
      circles: circles.map((c) => ({
        id: c.id,
        name: c.name,
        code: c.code,
        isActive: c.isActive,
        students: c._count.students,
        capacity: c.capacity,
        startTime: c.startTime,
        endTime: c.endTime,
        scheduleDays: c.scheduleDays,
        primaryTeacher:
          c.teachers.find((t) => t.role === 'PRIMARY')?.teacher.user.fullName ?? null,
        assistants: c.teachers
          .filter((t) => t.role === 'ASSISTANT')
          .map((t) => t.teacher.user.fullName),
      })),
      suspendedList: await this.suspensions.activeList(user),
    };
  }

  // --- teacher -------------------------------------------------------------

  private async teacherOverview(user: AuthUser) {
    const circleIds = await this.acl.teacherCircleIds(user);
    const studentFilter: Prisma.StudentWhereInput = { deletedAt: null, circleId: { in: circleIds } };
    const today = this.today();

    const [circles, students, suspended, todayRecorded, myRecitations, pendingExamRequests, upcomingExams] =
      await Promise.all([
        this.prisma.circle.findMany({
          where: { id: { in: circleIds }, deletedAt: null },
          select: {
            id: true,
            name: true,
            code: true,
            startTime: true,
            endTime: true,
            scheduleDays: true,
            location: true,
            _count: { select: { students: { where: { deletedAt: null } } } },
          },
        }),
        this.prisma.student.count({ where: { ...studentFilter, status: StudentStatus.ACTIVE } }),
        this.prisma.student.count({ where: { ...studentFilter, status: StudentStatus.SUSPENDED } }),
        this.prisma.attendance.groupBy({
          by: ['circleId'],
          where: { circleId: { in: circleIds }, date: today },
          _count: { _all: true },
        }),
        this.prisma.recitation.count({
          where: {
            teacherId: user.teacherId ?? '__none__',
            deletedAt: null,
            date: { gte: this.daysAgo(7) },
          },
        }),
        this.prisma.examRequest.count({
          where: { teacherId: user.teacherId ?? '__none__', status: 'PENDING' },
        }),
        this.prisma.exam.findMany({
          where: {
            status: ExamStatus.SCHEDULED,
            scheduledAt: { gte: new Date() },
            student: studentFilter,
          },
          include: {
            student: { select: { id: true, fullName: true } },
            section: { select: { name: true } },
          },
          orderBy: { scheduledAt: 'asc' },
          take: 8,
        }),
      ]);

    const recordedCircleIds = new Set(todayRecorded.map((t) => t.circleId));

    return {
      role: Role.TEACHER,
      counts: {
        circles: circles.length,
        students,
        suspendedStudents: suspended,
        recitationsLast7Days: myRecitations,
        pendingExamRequests,
      },
      attendanceToday: await this.attendanceForDate(today, circleIds),
      circles: circles.map((c) => ({
        id: c.id,
        name: c.name,
        code: c.code,
        students: c._count.students,
        startTime: c.startTime,
        endTime: c.endTime,
        scheduleDays: c.scheduleDays,
        location: c.location,
        attendanceRecordedToday: recordedCircleIds.has(c.id),
      })),
      upcomingExams,
      weeklyAttendance: await this.weeklyAttendance(circleIds),
    };
  }

  // --- exam committee ------------------------------------------------------

  private async committeeOverview(user: AuthUser) {
    const [waiting, scheduled, completedThisMonth, passed, failed, nextExams, waitingList] =
      await Promise.all([
        this.prisma.examRequest.count({ where: { status: 'PENDING' } }),
        this.prisma.exam.count({ where: { status: ExamStatus.SCHEDULED } }),
        this.prisma.exam.count({
          where: { status: ExamStatus.COMPLETED, gradedAt: { gte: this.startOfMonth() } },
        }),
        this.prisma.exam.count({ where: { status: ExamStatus.COMPLETED, result: ExamResult.PASSED } }),
        this.prisma.exam.count({ where: { status: ExamStatus.COMPLETED, result: ExamResult.FAILED } }),
        this.prisma.exam.findMany({
          where: { status: ExamStatus.SCHEDULED, scheduledAt: { gte: new Date() } },
          include: {
            student: { select: { id: true, fullName: true, circle: { select: { name: true } } } },
            section: { select: { name: true } },
            examiner: { select: { fullName: true } },
          },
          orderBy: { scheduledAt: 'asc' },
          take: 10,
        }),
        this.prisma.examRequest.findMany({
          where: { status: 'PENDING' },
          include: {
            student: { select: { id: true, fullName: true, circle: { select: { name: true } } } },
            section: { select: { name: true, order: true } },
            teacher: { select: { user: { select: { fullName: true } } } },
          },
          orderBy: { createdAt: 'asc' },
          take: 10,
        }),
      ]);

    const completed = passed + failed;

    return {
      role: Role.EXAM_COMMITTEE,
      counts: {
        waitingList: waiting,
        scheduled,
        completedThisMonth,
        passed,
        failed,
        passRate: completed ? Math.round((passed / completed) * 100) : 0,
      },
      nextExams,
      waitingListPreview: waitingList,
    };
  }

  // --- support -------------------------------------------------------------

  private async supportOverview(user: AuthUser) {
    const [open, inProgress, resolved, closed, assignedToMe, recent] = await Promise.all([
      this.prisma.supportTicket.count({ where: { deletedAt: null, status: 'OPEN' } }),
      this.prisma.supportTicket.count({ where: { deletedAt: null, status: 'IN_PROGRESS' } }),
      this.prisma.supportTicket.count({ where: { deletedAt: null, status: 'RESOLVED' } }),
      this.prisma.supportTicket.count({ where: { deletedAt: null, status: 'CLOSED' } }),
      this.prisma.supportTicket.count({
        where: { deletedAt: null, assignedToId: user.id, status: { in: ['OPEN', 'IN_PROGRESS'] } },
      }),
      this.prisma.supportTicket.findMany({
        where: { deletedAt: null, status: { in: ['OPEN', 'IN_PROGRESS'] } },
        include: {
          createdBy: { select: { id: true, fullName: true, role: true } },
          assignedTo: { select: { id: true, fullName: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: 10,
      }),
    ]);

    return {
      role: Role.SUPPORT,
      counts: { open, inProgress, resolved, closed, assignedToMe, total: open + inProgress + resolved + closed },
      recentTickets: recent,
    };
  }

  // --- parent --------------------------------------------------------------

  private async parentOverview(user: AuthUser) {
    if (!user.parentId) return { role: Role.PARENT, children: [] };

    const students = await this.prisma.student.findMany({
      where: { parentId: user.parentId, deletedAt: null },
      select: { id: true, fullName: true, status: true, evaluation: true, memorizedParts: true },
    });

    const ids = students.map((s) => s.id);
    const [upcomingExams, recentRecitations, absencesThisMonth] = await Promise.all([
      ids.length
        ? this.prisma.exam.findMany({
            where: {
              studentId: { in: ids },
              status: ExamStatus.SCHEDULED,
              scheduledAt: { gte: new Date() },
            },
            include: {
              student: { select: { id: true, fullName: true } },
              section: { select: { name: true } },
            },
            orderBy: { scheduledAt: 'asc' },
            take: 5,
          })
        : [],
      ids.length
        ? this.prisma.recitation.findMany({
            where: { studentId: { in: ids }, deletedAt: null },
            include: { student: { select: { id: true, fullName: true } } },
            orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
            take: 5,
          })
        : [],
      ids.length
        ? this.prisma.attendance.count({
            where: { studentId: { in: ids }, status: 'ABSENT', date: { gte: this.startOfMonth() } },
          })
        : 0,
    ]);

    return {
      role: Role.PARENT,
      counts: {
        children: students.length,
        suspended: students.filter((s) => s.status === StudentStatus.SUSPENDED).length,
        absencesThisMonth,
      },
      children: students,
      upcomingExams,
      recentRecitations,
    };
  }

  // --- shared helpers ------------------------------------------------------

  private async attendanceForDate(date: Date, circleIds?: string[]) {
    const grouped = await this.prisma.attendance.groupBy({
      by: ['status'],
      where: { date, ...(circleIds ? { circleId: { in: circleIds } } : {}) },
      _count: { _all: true },
    });

    const counts = { PRESENT: 0, ABSENT: 0, EXCUSED: 0 };
    grouped.forEach((g) => (counts[g.status] = g._count._all));
    const total = Object.values(counts).reduce((a, b) => a + b, 0);

    return {
      ...counts,
      total,
      rate: total ? Math.round((counts.PRESENT / total) * 100) : 0,
    };
  }

  private async weeklyAttendance(circleIds?: string[]) {
    const from = this.daysAgo(13);
    const rows = await this.prisma.attendance.groupBy({
      by: ['date', 'status'],
      where: { date: { gte: from }, ...(circleIds ? { circleId: { in: circleIds } } : {}) },
      _count: { _all: true },
    });

    const map = new Map<string, Record<string, number>>();
    rows.forEach((r) => {
      const key = r.date.toISOString().slice(0, 10);
      const row = map.get(key) ?? { PRESENT: 0, ABSENT: 0, EXCUSED: 0 };
      row[r.status] = r._count._all;
      map.set(key, row);
    });

    return [...map.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([date, values]) => ({ date, ...values }));
  }

  /** Recent system activity, restricted to administration. */
  async activity(limit = 30) {
    return this.prisma.activityLog.findMany({
      orderBy: { createdAt: 'desc' },
      take: Math.min(limit, 100),
      include: { user: { select: { id: true, fullName: true, role: true } } },
    });
  }

  private today() {
    const d = new Date();
    return new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  }

  private daysAgo(n: number) {
    const d = new Date();
    d.setDate(d.getDate() - n);
    return new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  }

  private startOfMonth() {
    const d = new Date();
    return new Date(Date.UTC(d.getFullYear(), d.getMonth(), 1));
  }
}
