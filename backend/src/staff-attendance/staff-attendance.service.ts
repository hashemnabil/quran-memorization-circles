import { BadRequestException, Injectable } from '@nestjs/common';
import { AttendanceStatus, Prisma, Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ActivityService } from '../common/services/activity.service';
import { AuthUser } from '../common/decorators';
import { paginate } from '../common/dto/pagination.dto';
import { STAFF_ROLES } from '../users/users.service';
import {
  QueryStaffAttendanceDto,
  RecordStaffAttendanceDto,
  StaffSheetQueryDto,
} from './dto/staff-attendance.dto';

function toDateOnly(value: string | Date): Date {
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) throw new BadRequestException('التاريخ غير صالح');
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

/**
 * Attendance for the staff, mirroring the student register: one sheet per day,
 * three states, one submission that then moves into the history. Keyed on the
 * user account rather than a student, so it covers teachers, supervisors,
 * administrators and exam-committee members from the one unified directory.
 */
@Injectable()
export class StaffAttendanceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly activity: ActivityService,
  ) {}

  async sheet(query: StaffSheetQueryDto) {
    const date = toDateOnly(query.date);

    const [staff, existing] = await Promise.all([
      this.prisma.user.findMany({
        where: {
          deletedAt: null,
          isActive: true,
          role: query.role ? query.role : { in: STAFF_ROLES },
        },
        select: { id: true, fullName: true, role: true, jobTitle: true, avatarUrl: true },
        orderBy: { fullName: 'asc' },
      }),
      this.prisma.staffAttendance.findMany({
        where: { date },
        select: {
          userId: true,
          status: true,
          note: true,
          createdAt: true,
          recordedBy: { select: { id: true, fullName: true } },
        },
      }),
    ]);

    const byUser = new Map(existing.map((e) => [e.userId, e]));
    const alreadyRecorded = existing.length > 0;

    return {
      date: query.date,
      alreadyRecorded,
      canSubmit: !alreadyRecorded,
      submittedAt: existing[0]?.createdAt ?? null,
      submittedBy: existing[0]?.recordedBy ?? null,
      staff: staff.map((s) => ({ ...s, attendance: byUser.get(s.id) ?? null })),
    };
  }

  async record(actor: AuthUser, dto: RecordStaffAttendanceDto) {
    const date = toDateOnly(dto.date);
    if (date.getTime() > toDateOnly(new Date()).getTime()) {
      throw new BadRequestException('لا يمكن تسجيل الحضور لتاريخ مستقبلي');
    }

    const ids = [...new Set(dto.entries.map((e) => e.userId))];
    const staff = await this.prisma.user.findMany({
      where: { id: { in: ids }, deletedAt: null, role: { in: STAFF_ROLES } },
      select: { id: true },
    });
    if (staff.length !== ids.length) {
      throw new BadRequestException('بعض الحسابات المحددة ليست ضمن الكادر');
    }

    const existing = await this.prisma.staffAttendance.findFirst({
      where: { date },
      select: { id: true },
    });

    await this.prisma.$transaction(
      dto.entries.map((entry) =>
        this.prisma.staffAttendance.upsert({
          where: { userId_date: { userId: entry.userId, date } },
          create: {
            userId: entry.userId,
            date,
            status: entry.status,
            note: entry.status === AttendanceStatus.EXCUSED ? entry.note ?? null : null,
            recordedById: actor.id,
          },
          update: {
            status: entry.status,
            note: entry.status === AttendanceStatus.EXCUSED ? entry.note ?? null : null,
            recordedById: actor.id,
          },
        }),
      ),
    );

    await this.activity.log({
      userId: actor.id,
      action: 'STAFF_ATTENDANCE_RECORD',
      summary: `تسجيل حضور ${dto.entries.length} من الكادر بتاريخ ${dto.date}`,
      entityType: 'StaffAttendance',
    });

    return {
      message: existing ? 'تم تعديل سجل الحضور بنجاح' : 'تم حفظ سجل الحضور بنجاح',
      count: dto.entries.length,
    };
  }

  async findAll(query: QueryStaffAttendanceDto) {
    const where: Prisma.StaffAttendanceWhereInput = {
      ...(query.userId ? { userId: query.userId } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.role ? { user: { role: query.role } } : {}),
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
      this.prisma.staffAttendance.findMany({
        where,
        include: {
          user: { select: { id: true, fullName: true, role: true, jobTitle: true } },
          recordedBy: { select: { id: true, fullName: true } },
        },
        orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
        skip: query.skip,
        take: query.take,
      }),
      this.prisma.staffAttendance.count({ where }),
    ]);

    return paginate(data, total, query.page, query.limit);
  }

  /** History grouped by day, matching the students' register. */
  async history(query: QueryStaffAttendanceDto) {
    const where: Prisma.StaffAttendanceWhereInput = {
      ...(query.role ? { user: { role: query.role } } : {}),
      ...(query.from || query.to
        ? {
            date: {
              ...(query.from ? { gte: toDateOnly(query.from) } : {}),
              ...(query.to ? { lte: toDateOnly(query.to) } : {}),
            },
          }
        : {}),
    };

    const grouped = await this.prisma.staffAttendance.groupBy({
      by: ['date', 'status'],
      where,
      _count: { _all: true },
      orderBy: { date: 'desc' },
    });

    const dates = [...new Set(grouped.map((g) => g.date.toISOString().slice(0, 10)))].sort((a, b) =>
      b.localeCompare(a),
    );
    const pageDates = dates.slice(query.skip, query.skip + query.take);

    const days = pageDates.map((date) => {
      const rows = grouped.filter((g) => g.date.toISOString().slice(0, 10) === date);
      const get = (s: AttendanceStatus) => rows.find((r) => r.status === s)?._count._all ?? 0;
      const present = get(AttendanceStatus.PRESENT);
      const absent = get(AttendanceStatus.ABSENT);
      const excused = get(AttendanceStatus.EXCUSED);
      const total = present + absent + excused;
      return {
        date,
        present,
        absent,
        excused,
        total,
        attendanceRate: total ? Math.round((present / total) * 100) : 0,
      };
    });

    return paginate(days, dates.length, query.page, query.limit);
  }

  async detail(date: string) {
    const records = await this.prisma.staffAttendance.findMany({
      where: { date: toDateOnly(date) },
      include: {
        user: { select: { id: true, fullName: true, role: true, jobTitle: true } },
        recordedBy: { select: { id: true, fullName: true } },
      },
      orderBy: { user: { fullName: 'asc' } },
    });
    return { date, records };
  }

  /** Per-person totals, used for the staff directory's attendance column. */
  async summary(from?: string, to?: string, role?: Role) {
    const where: Prisma.StaffAttendanceWhereInput = {
      ...(role ? { user: { role } } : {}),
      ...(from || to
        ? {
            date: {
              ...(from ? { gte: toDateOnly(from) } : {}),
              ...(to ? { lte: toDateOnly(to) } : {}),
            },
          }
        : {}),
    };

    const [staff, records] = await Promise.all([
      this.prisma.user.findMany({
        where: {
          deletedAt: null,
          isActive: true,
          role: role ? role : { in: STAFF_ROLES },
        },
        select: { id: true, fullName: true, role: true, jobTitle: true },
        orderBy: { fullName: 'asc' },
      }),
      this.prisma.staffAttendance.groupBy({
        by: ['userId', 'status'],
        where,
        _count: { _all: true },
      }),
    ]);

    return staff.map((person) => {
      const rows = records.filter((r) => r.userId === person.id);
      const get = (s: AttendanceStatus) => rows.find((r) => r.status === s)?._count._all ?? 0;
      const present = get(AttendanceStatus.PRESENT);
      const absent = get(AttendanceStatus.ABSENT);
      const excused = get(AttendanceStatus.EXCUSED);
      const total = present + absent + excused;
      return {
        ...person,
        present,
        absent,
        excused,
        total,
        attendanceRate: total ? Math.round((present / total) * 100) : 0,
      };
    });
  }
}
