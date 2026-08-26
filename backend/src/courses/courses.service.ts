import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AttendanceStatus, NotificationType, Prisma, Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ActivityService } from '../common/services/activity.service';
import { NotificationsService } from '../notifications/notifications.service';
import { AuthUser } from '../common/decorators';
import { buildOrderBy, paginate } from '../common/dto/pagination.dto';
import {
  BulkCourseIdsDto,
  CourseAttendanceQueryDto,
  CreateCourseDto,
  EnrollStudentsDto,
  QueryCoursesDto,
  RecordCourseAttendanceDto,
  UpdateCourseDto,
} from './dto/course.dto';

function toDateOnly(value: string | Date): Date {
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) throw new BadRequestException('التاريخ غير صالح');
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

const COURSE_SELECT = {
  id: true,
  name: true,
  code: true,
  type: true,
  description: true,
  instructorName: true,
  location: true,
  startDate: true,
  endDate: true,
  scheduleDays: true,
  startTime: true,
  endTime: true,
  capacity: true,
  isActive: true,
  createdAt: true,
  instructor: { select: { id: true, fullName: true, avatarUrl: true } },
  _count: { select: { enrollments: true } },
} satisfies Prisma.CourseSelect;

/**
 * Educational courses — a track of its own, deliberately kept apart from the
 * memorization circles. Enrolments and attendance live in their own tables, so
 * a course register never mixes with a circle register, while the people
 * involved are the same `Student` and `User` records the rest of the system
 * uses. That is what lets one unified student profile cover both tracks.
 */
@Injectable()
export class CoursesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly activity: ActivityService,
    private readonly notifications: NotificationsService,
  ) {}

  async findAll(query: QueryCoursesDto) {
    const where: Prisma.CourseWhereInput = {
      deletedAt: null,
      ...(query.type ? { type: query.type } : {}),
      ...(query.isActive !== undefined ? { isActive: query.isActive } : {}),
      ...(query.instructorId ? { instructorId: query.instructorId } : {}),
      ...(query.studentId
        ? { enrollments: { some: { studentId: query.studentId } } }
        : {}),
      ...(query.search
        ? {
            OR: [
              { name: { contains: query.search, mode: 'insensitive' } },
              { code: { contains: query.search, mode: 'insensitive' } },
              { instructorName: { contains: query.search, mode: 'insensitive' } },
              { location: { contains: query.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const [data, total] = await this.prisma.$transaction([
      this.prisma.course.findMany({
        where,
        select: COURSE_SELECT,
        orderBy: buildOrderBy(query.sortBy, query.sortOrder, [
          'name',
          'startDate',
          'createdAt',
        ]),
        skip: query.skip,
        take: query.take,
      }),
      this.prisma.course.count({ where }),
    ]);

    return paginate(
      data.map((c) => this.shape(c)),
      total,
      query.page,
      query.limit,
    );
  }

  async findOne(id: string) {
    const course = await this.prisma.course.findFirst({
      where: { id, deletedAt: null },
      select: {
        ...COURSE_SELECT,
        enrollments: {
          where: { student: { deletedAt: null } },
          select: {
            id: true,
            enrolledAt: true,
            endedAt: true,
            note: true,
            student: {
              select: {
                id: true,
                code: true,
                fullName: true,
                nationalId: true,
                phone: true,
                birthDate: true,
                status: true,
                guardianName: true,
                guardianPhone: true,
              },
            },
          },
          orderBy: { student: { fullName: 'asc' } },
        },
      },
    });
    if (!course) throw new NotFoundException('الدورة غير موجودة');

    const attendanceDays = await this.prisma.courseAttendance.groupBy({
      by: ['date'],
      where: { courseId: id },
      _count: { _all: true },
      orderBy: { date: 'desc' },
      take: 30,
    });

    return {
      ...this.shape(course),
      students: course.enrollments.map((e) => ({
        enrollmentId: e.id,
        enrolledAt: e.enrolledAt,
        endedAt: e.endedAt,
        isCurrent: e.endedAt === null,
        ...e.student,
      })),
      attendanceDays: attendanceDays.map((d) => ({
        date: d.date.toISOString().slice(0, 10),
        records: d._count._all,
      })),
    };
  }

  async create(actor: AuthUser, dto: CreateCourseDto) {
    this.assertDateOrder(dto.startDate, dto.endDate);
    await this.assertInstructor(dto.instructorId);

    const code = dto.code?.trim() || (await this.nextCode(dto.type));
    const taken = await this.prisma.course.findUnique({ where: { code }, select: { id: true } });
    if (taken) throw new ConflictException('رمز الدورة مستخدم مسبقاً');

    const course = await this.prisma.course.create({
      data: {
        name: dto.name.trim(),
        code,
        type: dto.type,
        description: dto.description || null,
        instructorId: dto.instructorId || null,
        instructorName: dto.instructorName || null,
        location: dto.location || null,
        startDate: dto.startDate ? toDateOnly(dto.startDate) : null,
        endDate: dto.endDate ? toDateOnly(dto.endDate) : null,
        scheduleDays: dto.scheduleDays ?? [],
        startTime: dto.startTime || null,
        endTime: dto.endTime || null,
        capacity: dto.capacity ?? 30,
        isActive: dto.isActive ?? true,
      },
      select: COURSE_SELECT,
    });

    await this.activity.log({
      userId: actor.id,
      action: 'COURSE_CREATE',
      summary: `إنشاء دورة جديدة: ${course.name}`,
      entityType: 'Course',
      entityId: course.id,
    });

    return this.shape(course);
  }

  async update(actor: AuthUser, id: string, dto: UpdateCourseDto) {
    const current = await this.prisma.course.findFirst({ where: { id, deletedAt: null } });
    if (!current) throw new NotFoundException('الدورة غير موجودة');

    this.assertDateOrder(
      dto.startDate ?? current.startDate?.toISOString().slice(0, 10),
      dto.endDate ?? current.endDate?.toISOString().slice(0, 10),
    );
    await this.assertInstructor(dto.instructorId);

    if (dto.code && dto.code !== current.code) {
      const taken = await this.prisma.course.findUnique({
        where: { code: dto.code },
        select: { id: true },
      });
      if (taken) throw new ConflictException('رمز الدورة مستخدم مسبقاً');
    }

    const course = await this.prisma.course.update({
      where: { id },
      data: {
        name: dto.name?.trim(),
        code: dto.code?.trim(),
        type: dto.type,
        description: dto.description === '' ? null : dto.description,
        instructorId: dto.instructorId === '' ? null : dto.instructorId,
        instructorName: dto.instructorName === '' ? null : dto.instructorName,
        location: dto.location === '' ? null : dto.location,
        ...(dto.startDate !== undefined
          ? { startDate: dto.startDate ? toDateOnly(dto.startDate) : null }
          : {}),
        ...(dto.endDate !== undefined
          ? { endDate: dto.endDate ? toDateOnly(dto.endDate) : null }
          : {}),
        scheduleDays: dto.scheduleDays,
        startTime: dto.startTime === '' ? null : dto.startTime,
        endTime: dto.endTime === '' ? null : dto.endTime,
        capacity: dto.capacity,
        isActive: dto.isActive,
      },
      select: COURSE_SELECT,
    });

    await this.activity.log({
      userId: actor.id,
      action: 'COURSE_UPDATE',
      summary: `تعديل الدورة: ${course.name}`,
      entityType: 'Course',
      entityId: id,
    });

    return this.shape(course);
  }

  async remove(actor: AuthUser, id: string) {
    const course = await this.prisma.course.findFirst({ where: { id, deletedAt: null } });
    if (!course) throw new NotFoundException('الدورة غير موجودة');

    await this.prisma.course.update({
      where: { id },
      data: { deletedAt: new Date(), isActive: false },
    });

    await this.activity.log({
      userId: actor.id,
      action: 'COURSE_DELETE',
      summary: `حذف الدورة: ${course.name}`,
      entityType: 'Course',
      entityId: id,
    });

    return { message: 'تم حذف الدورة' };
  }

  async removeMany(actor: AuthUser, dto: BulkCourseIdsDto) {
    const ids = [...new Set(dto.ids)];
    const courses = await this.prisma.course.findMany({
      where: { id: { in: ids }, deletedAt: null },
      select: { id: true },
    });
    if (!courses.length) return { deleted: 0, message: 'لا توجد سجلات للحذف' };

    await this.prisma.course.updateMany({
      where: { id: { in: courses.map((c) => c.id) } },
      data: { deletedAt: new Date(), isActive: false },
    });

    await this.activity.log({
      userId: actor.id,
      action: 'COURSE_BULK_DELETE',
      summary: `حذف ${courses.length} دورة`,
      entityType: 'Course',
      metadata: { ids: courses.map((c) => c.id) },
    });

    return { deleted: courses.length, message: `تم حذف ${courses.length} دورة` };
  }

  // --- enrolment -----------------------------------------------------------

  async enroll(actor: AuthUser, courseId: string, dto: EnrollStudentsDto) {
    const course = await this.prisma.course.findFirst({
      where: { id: courseId, deletedAt: null },
      select: { id: true, name: true, capacity: true, _count: { select: { enrollments: true } } },
    });
    if (!course) throw new NotFoundException('الدورة غير موجودة');

    const ids = [...new Set(dto.studentIds)];
    const students = await this.prisma.student.findMany({
      where: { id: { in: ids }, deletedAt: null },
      select: { id: true, fullName: true, parentProfile: { select: { userId: true } } },
    });
    if (students.length !== ids.length) {
      throw new BadRequestException('بعض الطلاب المحددين غير موجودين');
    }

    const existing = await this.prisma.courseEnrollment.findMany({
      where: { courseId, studentId: { in: ids } },
      select: { studentId: true, endedAt: true },
    });
    const existingIds = new Set(existing.map((e) => e.studentId));
    const fresh = students.filter((s) => !existingIds.has(s.id));

    if (course._count.enrollments + fresh.length > course.capacity) {
      throw new BadRequestException(
        `سعة الدورة ${course.capacity} طالب، ولا تتسع لهذا العدد`,
      );
    }

    await this.prisma.$transaction([
      ...fresh.map((s) =>
        this.prisma.courseEnrollment.create({ data: { courseId, studentId: s.id } }),
      ),
      // Someone who left and is coming back gets their existing row reopened
      // rather than a second one, so the history stays a single line per course.
      ...existing
        .filter((e) => e.endedAt !== null)
        .map((e) =>
          this.prisma.courseEnrollment.updateMany({
            where: { courseId, studentId: e.studentId },
            data: { endedAt: null },
          }),
        ),
    ]);

    for (const student of students) {
      if (student.parentProfile?.userId) {
        await this.notifications.notify({
          userId: student.parentProfile.userId,
          type: NotificationType.COURSE,
          title: 'تسجيل في دورة',
          body: `تم تسجيل ${student.fullName} في ${course.name}`,
          link: `/parent/children/${student.id}`,
        });
      }
    }

    await this.activity.log({
      userId: actor.id,
      action: 'COURSE_ENROLL',
      summary: `تسجيل ${students.length} طالب في الدورة ${course.name}`,
      entityType: 'Course',
      entityId: courseId,
    });

    return {
      enrolled: fresh.length,
      reactivated: existing.filter((e) => e.endedAt !== null).length,
      message: `تم تسجيل ${students.length} طالب في الدورة`,
    };
  }

  async unenroll(actor: AuthUser, courseId: string, studentId: string) {
    const enrollment = await this.prisma.courseEnrollment.findUnique({
      where: { courseId_studentId: { courseId, studentId } },
      include: {
        course: { select: { name: true } },
        student: { select: { fullName: true } },
      },
    });
    if (!enrollment) throw new NotFoundException('الطالب غير مسجّل في هذه الدورة');

    // Ended, not deleted: the course stays in the student's history.
    await this.prisma.courseEnrollment.update({
      where: { id: enrollment.id },
      data: { endedAt: new Date() },
    });

    await this.activity.log({
      userId: actor.id,
      action: 'COURSE_UNENROLL',
      summary: `إنهاء تسجيل ${enrollment.student.fullName} من الدورة ${enrollment.course.name}`,
      entityType: 'Course',
      entityId: courseId,
    });

    return { message: 'تم إنهاء تسجيل الطالب في الدورة' };
  }

  // --- attendance ----------------------------------------------------------

  async attendanceSheet(courseId: string, query: CourseAttendanceQueryDto) {
    const course = await this.prisma.course.findFirst({
      where: { id: courseId, deletedAt: null },
      select: { id: true, name: true, code: true, type: true, scheduleDays: true, startTime: true },
    });
    if (!course) throw new NotFoundException('الدورة غير موجودة');

    const date = toDateOnly(query.date);
    const [enrollments, existing] = await Promise.all([
      this.prisma.courseEnrollment.findMany({
        where: { courseId, endedAt: null, student: { deletedAt: null } },
        select: {
          student: { select: { id: true, code: true, fullName: true, status: true } },
        },
        orderBy: { student: { fullName: 'asc' } },
      }),
      this.prisma.courseAttendance.findMany({
        where: { courseId, date },
        select: {
          studentId: true,
          status: true,
          note: true,
          createdAt: true,
          recordedBy: { select: { id: true, fullName: true } },
        },
      }),
    ]);

    const byStudent = new Map(existing.map((e) => [e.studentId, e]));
    const alreadyRecorded = existing.length > 0;

    return {
      course,
      date: query.date,
      alreadyRecorded,
      // Same one-submission-per-day rule as the circles register.
      canSubmit: !alreadyRecorded,
      submittedAt: existing[0]?.createdAt ?? null,
      submittedBy: existing[0]?.recordedBy ?? null,
      students: enrollments.map((e) => ({
        ...e.student,
        attendance: byStudent.get(e.student.id) ?? null,
      })),
    };
  }

  async recordAttendance(actor: AuthUser, courseId: string, dto: RecordCourseAttendanceDto) {
    const course = await this.prisma.course.findFirst({
      where: { id: courseId, deletedAt: null },
      select: { id: true, name: true },
    });
    if (!course) throw new NotFoundException('الدورة غير موجودة');

    const date = toDateOnly(dto.date);
    if (date.getTime() > toDateOnly(new Date()).getTime()) {
      throw new BadRequestException('لا يمكن تسجيل الحضور لتاريخ مستقبلي');
    }

    const existing = await this.prisma.courseAttendance.findFirst({
      where: { courseId, date },
      select: { id: true },
    });
    const mayOverride = actor.role === Role.ADMIN || actor.role === Role.SUPERVISOR;
    if (existing && !mayOverride) {
      throw new BadRequestException(
        'تم تسجيل حضور هذه الدورة لهذا اليوم مسبقاً، يمكن للمشرف أو الإدارة تعديله عند الحاجة',
      );
    }

    const ids = dto.entries.map((e) => e.studentId);
    const enrolled = await this.prisma.courseEnrollment.findMany({
      where: { courseId, studentId: { in: ids } },
      select: { studentId: true },
    });
    if (enrolled.length !== new Set(ids).size) {
      throw new BadRequestException('بعض الطلاب المحددين غير مسجلين في هذه الدورة');
    }

    await this.prisma.$transaction(
      dto.entries.map((entry) =>
        this.prisma.courseAttendance.upsert({
          where: {
            courseId_studentId_date: { courseId, studentId: entry.studentId, date },
          },
          create: {
            courseId,
            studentId: entry.studentId,
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
      action: 'COURSE_ATTENDANCE',
      summary: `تسجيل حضور ${dto.entries.length} طالب في الدورة ${course.name} بتاريخ ${dto.date}`,
      entityType: 'Course',
      entityId: courseId,
    });

    return {
      message: existing ? 'تم تعديل سجل الحضور بنجاح' : 'تم حفظ سجل الحضور بنجاح',
      count: dto.entries.length,
    };
  }

  /** Course attendance history, grouped by day like the circles register. */
  async attendanceHistory(courseId: string) {
    const grouped = await this.prisma.courseAttendance.groupBy({
      by: ['date', 'status'],
      where: { courseId },
      _count: { _all: true },
      orderBy: { date: 'desc' },
    });

    const dates = [...new Set(grouped.map((g) => g.date.toISOString().slice(0, 10)))].sort((a, b) =>
      b.localeCompare(a),
    );

    return dates.map((date) => {
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
  }

  async attendanceDetail(courseId: string, date: string) {
    const records = await this.prisma.courseAttendance.findMany({
      where: { courseId, date: toDateOnly(date) },
      include: {
        student: { select: { id: true, code: true, fullName: true } },
        recordedBy: { select: { id: true, fullName: true } },
      },
      orderBy: { student: { fullName: 'asc' } },
    });
    return { date, records };
  }

  async stats() {
    const [byType, total, active, enrolled] = await Promise.all([
      this.prisma.course.groupBy({
        by: ['type'],
        where: { deletedAt: null },
        _count: { _all: true },
      }),
      this.prisma.course.count({ where: { deletedAt: null } }),
      this.prisma.course.count({ where: { deletedAt: null, isActive: true } }),
      this.prisma.courseEnrollment.count({ where: { endedAt: null } }),
    ]);

    return {
      total,
      active,
      inactive: total - active,
      enrolledStudents: enrolled,
      byType: byType.map((t) => ({ type: t.type, count: t._count._all })),
    };
  }

  // -------------------------------------------------------------------------

  private shape<T extends { _count?: { enrollments: number } }>(course: T) {
    const { _count, ...rest } = course as T & { _count?: { enrollments: number } };
    return { ...rest, studentsCount: _count?.enrollments ?? 0 };
  }

  private assertDateOrder(start?: string | null, end?: string | null) {
    if (start && end && toDateOnly(start).getTime() > toDateOnly(end).getTime()) {
      throw new BadRequestException('تاريخ بداية الدورة يجب أن يسبق تاريخ نهايتها');
    }
  }

  private async assertInstructor(instructorId?: string) {
    if (!instructorId) return;
    const user = await this.prisma.user.findFirst({
      where: { id: instructorId, deletedAt: null },
      select: { id: true },
    });
    if (!user) throw new BadRequestException('المحاضر المحدد غير موجود');
  }

  /** SHR-0001 / TJW-0001 — a readable code the staff can quote. */
  private async nextCode(type: 'SHARIA' | 'TAJWEED') {
    const prefix = type === 'SHARIA' ? 'SHR' : 'TJW';
    const last = await this.prisma.course.findFirst({
      where: { code: { startsWith: `${prefix}-` } },
      orderBy: { code: 'desc' },
      select: { code: true },
    });
    const n = last ? parseInt(last.code.split('-')[1], 10) + 1 : 1;
    return `${prefix}-${String(n).padStart(4, '0')}`;
  }
}
