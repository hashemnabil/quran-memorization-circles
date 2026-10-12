import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Evaluation, Prisma, Role, StudentStatus } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { AccessControlService } from '../common/services/access-control.service';
import { ActivityService } from '../common/services/activity.service';
import { UploadsService } from '../uploads/uploads.service';
import { AuthUser } from '../common/decorators';
import { paginate } from '../common/dto/pagination.dto';
import { SURAH_COMPLETION_POINTS } from '../common/points';
import {
  AddNoteDto,
  BulkStudentIdsDto,
  CreateStudentDto,
  QueryStudentsDto,
  SetEvaluationDto,
  StudentTrack,
  StudentRegistrationTrack,
  SurahCompletionDto,
  UpdateStudentDto,
} from './dto/student.dto';

/** Fields a teacher is allowed to change on a student record. */
const TEACHER_EDITABLE_FIELDS = [
  'phone',
  'address',
  'notes',
  'currentSurah',
  'currentPage',
  'memorizedParts',
  'photoUrl',
];

const LIST_SELECT = {
  id: true,
  code: true,
  fullName: true,
  totalPoints: true,
  birthDate: true,
  gender: true,
  nationalId: true,
  status: true,
  evaluation: true,
  memorizedParts: true,
  currentSurah: true,
  currentPage: true,
  photoUrl: true,
  enrollmentDate: true,
  createdAt: true,
  circle: {
    select: {
      id: true,
      name: true,
      code: true,
      supervisor: { select: { id: true, fullName: true } },
      teachers: {
        where: { endedAt: null },
        select: { role: true, teacher: { select: { id: true, user: { select: { fullName: true } } } } },
      },
    },
  },
} satisfies Prisma.StudentSelect;

@Injectable()
export class StudentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly acl: AccessControlService,
    private readonly activity: ActivityService,
    private readonly uploads: UploadsService,
  ) {}

  /** Student self-service: resolve identity from the authenticated account, never from a client-supplied id. */
  async getMyProfile(user: AuthUser) {
    if (user.role !== Role.STUDENT) {
      throw new ForbiddenException('هذه الصفحة مخصصة لحساب الطالب');
    }
    const student = await this.prisma.student.findFirst({
      where: { userId: user.id, deletedAt: null },
      select: { id: true },
    });
    if (!student) throw new NotFoundException('ملف الطالب غير مرتبط بهذا الحساب');
    const profile = await this.findOne(user, student.id);
    // Do not expose guardian identities or guardian contact details to the student session.
    const { parentProfile: _parentProfile, parentName: _parentName, parentPhone: _parentPhone,
      guardianName: _guardianName, guardianPhone: _guardianPhone, parentId: _parentId,
      fatherNationalId: _fatherNationalId, ...safeProfile } = profile as any;
    return safeProfile;
  }

  async getMyHistory(user: AuthUser) {
    if (user.role !== Role.STUDENT) {
      throw new ForbiddenException('هذه الصفحة مخصصة لحساب الطالب');
    }
    const student = await this.prisma.student.findFirst({
      where: { userId: user.id, deletedAt: null },
      select: { id: true },
    });
    if (!student) throw new NotFoundException('ملف الطالب غير مرتبط بهذا الحساب');
    return this.history(user, student.id);
  }

  async findAll(user: AuthUser, query: QueryStudentsDto) {
    const scope = await this.acl.studentScope(user);

    const where: Prisma.StudentWhereInput = {
      AND: [
        scope,
        { deletedAt: null },
        query.status ? { status: query.status } : {},
        query.evaluation ? { evaluation: query.evaluation } : {},
        query.circleId ? { circleId: query.circleId } : {},
        query.parentId ? { parentId: query.parentId } : {},
        query.unassigned ? { circleId: null } : {},
        query.courseId
          ? { courseEnrollments: { some: { courseId: query.courseId, endedAt: null } } }
          : {},
        this.trackFilter(query.track),
        query.search
          ? {
              // Name, student number, national id, or guardian details.
              OR: [
                { fullName: { contains: query.search, mode: 'insensitive' } },
                { code: { contains: query.search, mode: 'insensitive' } },
                { code: { contains: `ST-${query.search}`, mode: 'insensitive' } },
                { nationalId: { contains: query.search } },
                { fatherNationalId: { contains: query.search } },
                { guardianPhone: { contains: query.search } },
                { guardianName: { contains: query.search, mode: 'insensitive' } },
              ],
            }
          : {},
      ],
    };

    // A supervisor filtering by circle must still be limited to their own circles.
    if (query.circleId) await this.acl.assertCircleAccess(user, query.circleId);

    const orderBy: Prisma.StudentOrderByWithRelationInput = [
      'fullName',
      'code',
      'memorizedParts',
      'totalPoints',
      'createdAt',
    ].includes(query.sortBy || '')
      ? ({ [query.sortBy!]: query.sortOrder } as any)
      : { fullName: 'asc' };

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.student.findMany({
        where,
        select: LIST_SELECT,
        orderBy,
        skip: query.skip,
        take: query.take,
      }),
      this.prisma.student.count({ where }),
    ]);

    return paginate(rows.map((r) => this.shape(r)), total, query.page, query.limit);
  }

  async findOne(user: AuthUser, id: string) {
    await this.acl.assertStudentAccess(user, id);

    const student = await this.prisma.student.findFirst({
      where: { id, deletedAt: null },
      select: {
        ...LIST_SELECT,
        address: true,
        phone: true,
        fatherNationalId: true,
        guardianName: true,
        guardianPhone: true,
        guardianRelation: true,
        parentId: true,
        parentProfile: {
          select: {
            id: true,
            nationalId: true,
            phone: true,
            altPhone: true,
            address: true,
            occupation: true,
            user: { select: { fullName: true, phone: true, email: true, username: true } },
          },
        },
        notes: true,
        evaluationNote: true,
        evaluatedAt: true,
        updatedAt: true,
        circleId: true,
      },
    });
    if (!student) throw new NotFoundException('الطالب غير موجود');

    const isParent = user.role === Role.PARENT;

    const [
      attendanceSummary,
      lastRecitation,
      activeSuspension,
      examSummary,
      recentNotes,
      courses,
      preparations,
      surahCompletions,
      pointsAgg,
    ] = await Promise.all([
      this.prisma.attendance.groupBy({
        by: ['status'],
        where: { studentId: id },
        _count: { _all: true },
      }),
      this.prisma.recitation.findFirst({
        where: { studentId: id, deletedAt: null },
        orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
        include: { teacher: { select: { user: { select: { fullName: true } } } } },
      }),
      this.prisma.suspensionRequest.findFirst({
        where: {
          studentId: id,
          status: 'APPROVED',
          returnedAt: null,
          // An open-ended suspension has no end date; it stays active until lifted.
          OR: [{ endDate: null }, { endDate: { gte: this.today() } }],
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.exam.findMany({
        where: { studentId: id, status: 'COMPLETED' },
        select: {
          result: true,
          score: true,
          section: { select: { name: true, order: true } },
          sections: { select: { section: { select: { name: true, order: true } } } },
        },
        orderBy: { section: { order: 'asc' } },
      }),
      this.prisma.studentNote.findMany({
        where: { studentId: id, deletedAt: null, ...(isParent ? { isPrivate: false } : {}) },
        include: { author: { select: { id: true, fullName: true, role: true } } },
        orderBy: { createdAt: 'desc' },
        take: 10,
      }),
      // Course information on the student profile (spec item 10).
      this.prisma.courseEnrollment.findMany({
        where: { studentId: id },
        include: {
          course: {
            select: {
              id: true,
              name: true,
              code: true,
              type: true,
              startDate: true,
              endDate: true,
              isActive: true,
              instructorName: true,
              instructor: { select: { id: true, fullName: true } },
            },
          },
        },
        orderBy: { enrolledAt: 'desc' },
      }),
      this.prisma.preparationAssignment.findMany({
        where: { studentId: id },
        include: { teacher: { select: { user: { select: { fullName: true } } } } },
        orderBy: { createdAt: 'desc' },
        take: 10,
      }),
      this.prisma.surahCompletion.findMany({
        where: { studentId: id },
        orderBy: { completedAt: 'desc' },
      }),
      this.prisma.recitation.aggregate({
        where: { studentId: id, deletedAt: null },
        _sum: { points: true, mistakes: true, warnings: true, versesCount: true },
        _count: { _all: true },
      }),
    ]);

    const totalAttendance = attendanceSummary.reduce((s, a) => s + a._count._all, 0);
    const present = attendanceSummary.find((a) => a.status === 'PRESENT')?._count._all ?? 0;
    const surahPoints = surahCompletions.reduce((s, c) => s + c.points, 0);

    return {
      ...this.shape(student),
      lastRecitation,
      activeSuspension: activeSuspension
        ? {
            ...activeSuspension,
            remainingDays: activeSuspension.endDate
              ? Math.max(0, Math.ceil((activeSuspension.endDate.getTime() - Date.now()) / 86400000))
              : null,
          }
        : null,
      /**
       * The dated note entries, under their own name.
       *
       * They used to be returned as `notes`, which overwrote the student's own
       * `notes` text column in the same response — so the edit form loaded an
       * array into its notes box and PATCHed it straight back, and the API
       * answered "notes must be a string". The column and the log are two
       * different things and now say so.
       */
      noteEntries: recentNotes,
      // Current course first, then the history — spec item 11's "current course"
      // and "other courses" on one record instead of a separate profile.
      courses: courses.map((e) => ({
        enrollmentId: e.id,
        enrolledAt: e.enrolledAt,
        endedAt: e.endedAt,
        isCurrent: e.endedAt === null && e.course.isActive,
        ...e.course,
      })),
      preparations,
      surahCompletions,
      points: {
        total: student.totalPoints,
        fromRecitations: Math.round((pointsAgg._sum.points ?? 0) * 100) / 100,
        fromSurahs: Math.round(surahPoints * 100) / 100,
        sessions: pointsAgg._count._all,
        verses: pointsAgg._sum.versesCount ?? 0,
        mistakes: pointsAgg._sum.mistakes ?? 0,
        warnings: pointsAgg._sum.warnings ?? 0,
        surahsCompleted: surahCompletions.length,
      },
      attendanceSummary: {
        total: totalAttendance,
        present,
        absent: attendanceSummary.find((a) => a.status === 'ABSENT')?._count._all ?? 0,
        excused: attendanceSummary.find((a) => a.status === 'EXCUSED')?._count._all ?? 0,
        attendanceRate: totalAttendance ? Math.round((present / totalAttendance) * 100) : 0,
      },
      examSummary: {
        passed: examSummary.filter((e) => e.result === 'PASSED').length,
        failed: examSummary.filter((e) => e.result === 'FAILED').length,
        lastPassedSection:
          examSummary.filter((e) => e.result === 'PASSED').sort((a, b) => b.section.order - a.section.order)[0]
            ?.section.name ?? null,
      },
    };
  }

  /**
   * Recomputes and stores a student's running points total.
   *
   * Called after anything that changes a recitation or a surah completion. The
   * column is a cache of this sum; recomputing it wholesale rather than
   * incrementing means an edited or deleted session can never leave it adrift.
   */
  async recalculatePoints(studentId: string) {
    const [recitations, surahs] = await Promise.all([
      this.prisma.recitation.aggregate({
        where: { studentId, deletedAt: null },
        _sum: { points: true },
      }),
      this.prisma.surahCompletion.aggregate({
        where: { studentId },
        _sum: { points: true },
      }),
    ]);
    const total =
      Math.round(((recitations._sum.points ?? 0) + (surahs._sum.points ?? 0)) * 100) / 100;
    await this.prisma.student.update({ where: { id: studentId }, data: { totalPoints: total } });
    return total;
  }

  /** Awards the surah-completion bonus. Unique per (student, surah). */
  async completeSurah(actor: AuthUser, studentId: string, dto: SurahCompletionDto) {
    const student = await this.acl.assertStudentWriteAccess(actor, studentId);

    const existing = await this.prisma.surahCompletion.findUnique({
      where: { studentId_surah: { studentId, surah: dto.surah } },
      select: { id: true },
    });
    if (existing) throw new ConflictException('تم تسجيل إتمام هذه السورة لهذا الطالب مسبقاً');

    const completion = await this.prisma.surahCompletion.create({
      data: {
        studentId,
        surah: dto.surah,
        points: dto.points ?? SURAH_COMPLETION_POINTS,
        note: dto.note || null,
        recordedById: actor.id,
      },
    });

    const total = await this.recalculatePoints(studentId);

    await this.activity.log({
      userId: actor.id,
      action: 'SURAH_COMPLETED',
      summary: `إتمام سورة ${dto.surah} للطالب ${student.fullName} (+${completion.points} نقطة)`,
      entityType: 'Student',
      entityId: studentId,
    });

    return { ...completion, totalPoints: total };
  }

  async removeSurahCompletion(actor: AuthUser, studentId: string, completionId: string) {
    await this.acl.assertStudentWriteAccess(actor, studentId);
    const completion = await this.prisma.surahCompletion.findFirst({
      where: { id: completionId, studentId },
    });
    if (!completion) throw new NotFoundException('السجل غير موجود');

    await this.prisma.surahCompletion.delete({ where: { id: completionId } });
    const total = await this.recalculatePoints(studentId);
    return { message: 'تم حذف السجل', totalPoints: total };
  }

  /** Bulk soft-delete, administration only. */
  async removeMany(actor: AuthUser, dto: BulkStudentIdsDto) {
    const ids = [...new Set(dto.ids)];
    const students = await this.prisma.student.findMany({
      where: { id: { in: ids }, deletedAt: null },
      select: { id: true, fullName: true },
    });
    if (!students.length) return { deleted: 0, message: 'لا توجد سجلات للحذف' };

    const now = new Date();
    await this.prisma.student.updateMany({
      where: { id: { in: students.map((s) => s.id) } },
      data: { deletedAt: now, circleId: null },
    });

    await this.activity.log({
      userId: actor.id,
      action: 'STUDENT_BULK_DELETE',
      summary: `حذف ${students.length} طالب`,
      entityType: 'Student',
      metadata: { ids: students.map((s) => s.id) },
    });

    return { deleted: students.length, message: `تم حذف ${students.length} طالب` };
  }

  /**
   * Turns the unified profile's track filter into a `where` fragment.
   *
   * "Course" means enrolled in a live course, whether or not they also attend a
   * circle — a student can genuinely be in both, and hiding them from one list
   * because they appear in the other is what made the old separate pages
   * disagree with each other.
   */
  private trackFilter(track?: StudentTrack): Prisma.StudentWhereInput {
    switch (track) {
      case StudentTrack.CIRCLE:
        return { circleId: { not: null }, status: StudentStatus.ACTIVE };
      case StudentTrack.COURSE:
        return { courseEnrollments: { some: { endedAt: null } } };
      case StudentTrack.ACTIVITY:
        return { status: StudentStatus.ACTIVITY };
      case StudentTrack.SUSPENDED:
        return { status: StudentStatus.SUSPENDED };
      default:
        return {};
    }
  }

  /** The activity programme and a circle are mutually exclusive, everywhere. */
  private circleForStatus(status: StudentStatus | undefined, circleId: string | undefined) {
    return status === StudentStatus.ACTIVITY ? null : circleId || null;
  }

  async create(actor: AuthUser, dto: CreateStudentDto) {
    const registrationTrack = dto.registrationTrack ?? StudentRegistrationTrack.CIRCLE;
    if (actor.role === Role.TEACHER && registrationTrack !== StudentRegistrationTrack.CIRCLE) throw new ForbiddenException('يمكن للمعلم تسجيل الطلاب في حلقات التحفيظ فقط');
    if (registrationTrack === StudentRegistrationTrack.ACTIVITY) { dto.status = StudentStatus.ACTIVITY; dto.circleId = undefined; dto.courseId = undefined; }
    if (registrationTrack === StudentRegistrationTrack.COURSE) { dto.circleId = undefined; if (!dto.courseId) throw new BadRequestException('اختر الدورة'); const course = await this.prisma.course.findFirst({ where: { id: dto.courseId, deletedAt: null, isActive: true }, select: { id: true, capacity: true, _count: { select: { enrollments: { where: { endedAt: null } } } } } }); if (!course) throw new BadRequestException('الدورة المحددة غير موجودة أو غير مفعّلة'); if (course._count.enrollments >= course.capacity) throw new BadRequestException('الدورة مكتملة العدد'); dto.status = StudentStatus.ACTIVE; }
    if (registrationTrack === StudentRegistrationTrack.CIRCLE && !dto.circleId) throw new BadRequestException('اختر حلقة التحفيظ');
    // A teacher may register a student, but only straight into a circle they
    // actually teach — they have no way to choose another one.
    if (actor.role === Role.TEACHER) {
      const own = await this.acl.ownCircleIds(actor);
      if (!own.length) {
        throw new ForbiddenException('لا يمكنك إضافة طالب لأنك غير مسند إلى أي حلقة');
      }
      if (dto.circleId && !own.includes(dto.circleId)) {
        throw new ForbiddenException('يمكنك إضافة الطلاب إلى حلقاتك فقط');
      }
      // Defaulting to their circle keeps the form to one field less.
      if (!dto.circleId) dto.circleId = own[0];
      // Nothing but a live circle student: status and evaluation are not theirs to set.
      delete (dto as Partial<CreateStudentDto>).status;
    }

    if (registrationTrack === StudentRegistrationTrack.CIRCLE && dto.circleId) {
      await this.acl.assertCircleAccess(actor, dto.circleId);
      await this.assertCircleHasRoom(dto.circleId);
    }
    if (dto.createAccount && !dto.nationalId?.trim()) {
      throw new BadRequestException('رقم هوية الطالب مطلوب لإنشاء حساب الدخول');
    }
    dto.nationalId = dto.nationalId?.trim() || undefined;
    if (dto.nationalId) {
      const dup = await this.prisma.student.findFirst({
        where: { nationalId: dto.nationalId, deletedAt: null },
      });
      if (dup) throw new ConflictException('رقم الهوية مسجل مسبقاً لطالب آخر');
      if (dto.createAccount) {
        const usernameTaken = await this.prisma.user.findFirst({
          where: { username: dto.nationalId.toLowerCase(), deletedAt: null },
          select: { id: true },
        });
        if (usernameTaken) throw new ConflictException('رقم الهوية مستخدم كاسم دخول لحساب آخر');
      }
    }
    const trackPrefix = registrationTrack === StudentRegistrationTrack.CIRCLE ? '1' : registrationTrack === StudentRegistrationTrack.COURSE ? '2' : '3';
    const code = dto.code?.trim() || (registrationTrack === StudentRegistrationTrack.CIRCLE ? await this.nextCode() : await this.nextTrackCode(trackPrefix));
    if (!/^\d{1,9}$/.test(code)) {
      throw new BadRequestException('رقم الطالب يجب أن يحتوي على أرقام فقط وبحد أقصى 9 أرقام');
    }
    const existingCode = await this.prisma.student.findUnique({ where: { code } });
    if (existingCode) throw new ConflictException('رقم الطالب مستخدم مسبقاً');

    const temporaryPassword = dto.createAccount ? randomBytes(9).toString('base64url') : undefined;
    const passwordHash = temporaryPassword ? await bcrypt.hash(temporaryPassword, 12) : undefined;
    const student = await this.prisma.$transaction(async (tx) => {
      const user = dto.createAccount
        ? await tx.user.create({
            data: { username: dto.nationalId!.toLowerCase(), passwordHash: passwordHash!, fullName: dto.fullName, role: Role.STUDENT, isActive: true, mustChangePassword: true },
          })
        : null;
      const created = await tx.student.create({
        data: {
          code,
          fullName: dto.fullName,
          birthDate: dto.birthDate ? new Date(dto.birthDate) : null,
          gender: dto.gender,
          nationalId: dto.nationalId,
          userId: user?.id,
          fatherNationalId: dto.fatherNationalId || null,
          address: dto.address,
          phone: dto.phone,
          guardianName: dto.guardianName || null,
          guardianPhone: dto.guardianPhone || null,
          guardianRelation: dto.guardianRelation || null,
          // A student registered straight into the activity programme joins no
          // circle, whatever the form sent.
          circleId: registrationTrack === StudentRegistrationTrack.CIRCLE ? dto.circleId || null : null,
          enrollmentDate: dto.enrollmentDate ? new Date(dto.enrollmentDate) : new Date(),
          status: dto.status ?? StudentStatus.ACTIVE,
          memorizedParts: dto.memorizedParts ?? 0,
          currentSurah: dto.currentSurah,
          currentPage: dto.currentPage,
          notes: dto.notes,
        },
      });

      if (registrationTrack === StudentRegistrationTrack.CIRCLE && dto.circleId && dto.status !== StudentStatus.ACTIVITY) {
        await tx.circleMembership.create({
          data: { studentId: created.id, circleId: dto.circleId, reason: 'تسجيل جديد' },
        });
      }
      if (registrationTrack === StudentRegistrationTrack.COURSE && dto.courseId) await tx.courseEnrollment.create({ data: { studentId: created.id, courseId: dto.courseId } });
      return created;
    });

    await this.activity.log({
      userId: actor.id,
      action: 'STUDENT_CREATE',
      summary: `تسجيل طالب جديد: ${student.fullName}`,
      entityType: 'Student',
      entityId: student.id,
    });

    const profile = await this.findOne(actor, student.id);
    // Temporary credentials are returned only when an account was explicitly requested.
    return temporaryPassword
      ? { ...profile, accountCredentials: { username: dto.nationalId, temporaryPassword } }
      : profile;
  }


  async importStudentsWithAccounts(actor: AuthUser, rows: Array<Record<string, string>>) {
    if (actor.role !== Role.ADMIN) throw new ForbiddenException('استيراد الطلاب متاح للإدارة فقط');
    const results: Array<{ row: number; fullName: string; code?: string; username?: string; temporaryPassword?: string; error?: string }> = [];
    for (let index = 0; index < rows.length; index += 1) {
      const row = rows[index];
      try {
        if (!row.fullName) throw new BadRequestException('اسم الطالب مطلوب');
        if (!row.nationalId) throw new BadRequestException('رقم هوية الطالب مطلوب لإنشاء اسم المستخدم');
        if (row.gender && !['MALE', 'FEMALE'].includes(row.gender)) throw new BadRequestException('الجنس يجب أن يكون MALE أو FEMALE');
        let circleId: string | undefined;
        if (row.circleCode) {
          const circle = await this.prisma.circle.findFirst({ where: { code: row.circleCode, deletedAt: null }, select: { id: true } });
          if (!circle) throw new BadRequestException(`رمز الحلقة غير موجود: ${row.circleCode}`);
          circleId = circle.id;
        }
        const created = await this.create(actor, {
          fullName: row.fullName,
          nationalId: row.nationalId,
          fatherNationalId: row.fatherNationalId || undefined,
          birthDate: row.birthDate || undefined,
          gender: (row.gender || undefined) as any,
          phone: row.phone || undefined,
          address: row.address || undefined,
          guardianName: row.guardianName || undefined,
          guardianPhone: row.guardianPhone || undefined,
          guardianRelation: row.guardianRelation || undefined,
          circleId,
          notes: row.notes || undefined,
          createAccount: true,
        } as CreateStudentDto);
        results.push({ row: index + 2, fullName: created.fullName, code: created.code,
          username: (created as any).accountCredentials?.username, temporaryPassword: (created as any).accountCredentials?.temporaryPassword });
      } catch (error: any) {
        const message = error?.response?.message || error?.message || 'تعذر استيراد الصف';
        results.push({ row: index + 2, fullName: row.fullName || '(بدون اسم)', error: Array.isArray(message) ? message.join('، ') : message });
      }
    }
    const imported = results.filter((item) => !item.error);
    await this.activity.log({ userId: actor.id, action: 'STUDENT_EXCEL_IMPORT',
      summary: `استيراد ${imported.length} طالب من ملف Excel`, entityType: 'Student',
      metadata: { imported: imported.length, failed: results.length - imported.length } });
    return { total: rows.length, imported: imported.length, failed: results.length - imported.length, results,
      credentials: imported.map(({ fullName, code, username, temporaryPassword }) => ({ fullName, code, username, temporaryPassword })) };
  }

  async listAccounts() {
    const students = await this.prisma.student.findMany({
      where: { deletedAt: null, userId: { not: null } },
      select: { id: true, fullName: true, nationalId: true, fatherNationalId: true, phone: true, guardianName: true, guardianPhone: true, code: true,
        user: { select: { id: true, username: true, isActive: true, mustChangePassword: true } } },
      orderBy: { fullName: 'asc' },
    });
    return students.filter((s) => s.user).map((s) => ({
      id: s.id, fullName: s.fullName, nationalId: s.nationalId, fatherNationalId: s.fatherNationalId, phone: s.phone, guardianName: s.guardianName, guardianPhone: s.guardianPhone, code: s.code,
      userId: s.user!.id, username: s.user!.username, isActive: s.user!.isActive,
      mustChangePassword: s.user!.mustChangePassword,
    }));
  }

  async createAccountForStudent(actor: AuthUser, id: string) {
    const student = await this.prisma.student.findFirst({ where: { id, deletedAt: null } });
    if (!student) throw new NotFoundException('الطالب غير موجود');
    if (student.userId) throw new ConflictException('الطالب لديه حساب دخول بالفعل');
    const nationalId = student.nationalId?.trim();
    if (!nationalId) throw new BadRequestException('أضف رقم هوية الطالب أولاً من صفحة تعديل بياناته');
    const username = nationalId.toLowerCase();
    const taken = await this.prisma.user.findFirst({ where: { username, deletedAt: null }, select: { id: true } });
    if (taken) throw new ConflictException('رقم الهوية مستخدم كاسم دخول لحساب آخر');
    const temporaryPassword = randomBytes(9).toString('base64url');
    const user = await this.prisma.user.create({ data: {
      username, passwordHash: await bcrypt.hash(temporaryPassword, 12), fullName: student.fullName,
      phone: student.phone, role: Role.STUDENT, isActive: true, mustChangePassword: true,
    } });
    await this.prisma.student.update({ where: { id }, data: { userId: user.id } });
    await this.activity.log({ userId: actor.id, action: 'STUDENT_ACCOUNT_CREATE', summary: `إنشاء حساب دخول للطالب: ${student.fullName}`, entityType: 'Student', entityId: id });
    return { studentId: id, fullName: student.fullName, username, temporaryPassword };
  }

  async resetStudentAccountPassword(actor: AuthUser, id: string) {
    const student = await this.prisma.student.findFirst({ where: { id, deletedAt: null }, include: { user: true } });
    if (!student) throw new NotFoundException('الطالب غير موجود');
    if (!student.user) throw new BadRequestException('الطالب لا يملك حساب دخول');
    const temporaryPassword = randomBytes(9).toString('base64url');
    await this.prisma.user.update({ where: { id: student.user.id },
      data: { passwordHash: await bcrypt.hash(temporaryPassword, 12), mustChangePassword: true, isActive: true } });
    await this.activity.log({ userId: actor.id, action: 'STUDENT_ACCOUNT_PASSWORD_RESET', summary: `إعادة تعيين كلمة مرور الطالب: ${student.fullName}`, entityType: 'Student', entityId: id });
    return { studentId: id, fullName: student.fullName, username: student.user.username, temporaryPassword };
  }

  async setStudentAccountActive(actor: AuthUser, id: string, active: boolean) {
    const student = await this.prisma.student.findFirst({ where: { id, deletedAt: null }, include: { user: true } });
    if (!student) throw new NotFoundException('الطالب غير موجود');
    if (!student.user) throw new BadRequestException('الطالب لا يملك حساب دخول');
    await this.prisma.user.update({ where: { id: student.user.id }, data: { isActive: active } });
    await this.activity.log({ userId: actor.id, action: active ? 'STUDENT_ACCOUNT_ACTIVATE' : 'STUDENT_ACCOUNT_DEACTIVATE', summary: `${active ? 'تفعيل' : 'إيقاف'} حساب الطالب: ${student.fullName}`, entityType: 'Student', entityId: id });
    return { studentId: id, isActive: active };
  }

  /**
   * Sets or clears a student's picture.
   *
   * Separate from `update` because the guardian may do this and nothing else:
   * `assertStudentAccess` lets a parent through for their own children only,
   * while the school reaches every student it can already see. The replaced
   * file is deleted so storage does not fill with orphans.
   */
  async setPhoto(actor: AuthUser, id: string, photoUrl: string | null) {
    await this.acl.assertStudentAccess(actor, id);
    const current = await this.prisma.student.findFirst({
      where: { id, deletedAt: null },
      select: { id: true, fullName: true, photoUrl: true },
    });
    if (!current) throw new NotFoundException('الطالب غير موجود');

    const updated = await this.prisma.student.update({
      where: { id },
      data: { photoUrl: photoUrl || null },
      select: { id: true, fullName: true, photoUrl: true },
    });

    await this.uploads.removeIfReplaced(current.photoUrl, updated.photoUrl);

    await this.activity.log({
      userId: actor.id,
      action: photoUrl ? 'STUDENT_PHOTO_SET' : 'STUDENT_PHOTO_CLEAR',
      summary: `${photoUrl ? 'تحديث' : 'إزالة'} صورة الطالب: ${current.fullName}`,
      entityType: 'Student',
      entityId: id,
    });

    return updated;
  }

  async update(actor: AuthUser, id: string, dto: UpdateStudentDto) {
    const student = await this.acl.assertStudentWriteAccess(actor, id);

    // Teachers may only touch the day-to-day fields; the rest is administration-only.
    if (actor.role === Role.TEACHER || actor.role === Role.SUPERVISOR) {
      const attempted = Object.keys(dto).filter(
        (k) => dto[k] !== undefined && !TEACHER_EDITABLE_FIELDS.includes(k),
      );
      if (attempted.length) {
        throw new ForbiddenException('لا تملك صلاحية تعديل البيانات الإدارية للطالب');
      }
    }

    if (dto.code !== undefined) {
      const code = dto.code.trim();
      if (!/^\d{1,9}$/.test(code)) {
        throw new BadRequestException('رقم الطالب يجب أن يحتوي على أرقام فقط وبحد أقصى 9 أرقام');
      }
      const duplicateCode = await this.prisma.student.findFirst({ where: { code, id: { not: id } } });
      if (duplicateCode) throw new ConflictException('رقم الطالب مستخدم مسبقاً');
      dto.code = code;
    }

    if (dto.nationalId && dto.nationalId !== undefined) {
      const dup = await this.prisma.student.findFirst({
        where: { nationalId: dto.nationalId, deletedAt: null, id: { not: id } },
      });
      if (dup) throw new ConflictException('رقم الهوية مسجل مسبقاً لطالب آخر');
    }

    /**
     * The activity programme means "not in any circle" — that is what it is.
     *
     * So the two halves are kept in step here rather than trusted to whoever
     * fills the form: putting a student into the programme takes them out of
     * their circle, and putting them back into a circle has to go through the
     * return action, which also clears the status and closes the record.
     */
    const enteringActivity =
      dto.status === StudentStatus.ACTIVITY && student.status !== StudentStatus.ACTIVITY;
    const stayingInActivity =
      student.status === StudentStatus.ACTIVITY && dto.status !== StudentStatus.ACTIVE;

    if (dto.circleId && dto.circleId !== student.circleId && (enteringActivity || stayingInActivity)) {
      throw new BadRequestException(
        'الطالب في برنامج النشاط — استخدم إجراء «إعادة إلى حلقة» لإخراجه من البرنامج وإسناده لحلقة',
      );
    }

    // Changing the circle from here is an administrative move; it keeps history.
    // Entering the programme is one of those moves: it ends the membership.
    const leavingCircle = enteringActivity && !!student.circleId;
    const movingCircle =
      leavingCircle || (dto.circleId !== undefined && dto.circleId !== student.circleId);
    if (movingCircle && dto.circleId) {
      await this.acl.assertCircleAccess(actor, dto.circleId);
      await this.assertCircleHasRoom(dto.circleId);
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.student.update({
        where: { id },
        data: {
          fullName: dto.fullName,
          code: dto.code,
          birthDate: dto.birthDate ? new Date(dto.birthDate) : undefined,
          gender: dto.gender,
          nationalId: dto.nationalId === '' ? null : dto.nationalId,
          fatherNationalId: dto.fatherNationalId === '' ? null : dto.fatherNationalId,
          address: dto.address,
          phone: dto.phone,
          guardianName: dto.guardianName,
          guardianPhone: dto.guardianPhone,
          guardianRelation: dto.guardianRelation,
          memorizedParts: dto.memorizedParts,
          currentSurah: dto.currentSurah,
          currentPage: dto.currentPage,
          notes: dto.notes,
          status: dto.status,
          enrollmentDate: dto.enrollmentDate ? new Date(dto.enrollmentDate) : undefined,
          ...(dto.parentId !== undefined ? { parentId: dto.parentId || null } : {}),
          ...(movingCircle ? { circleId: leavingCircle ? null : dto.circleId || null } : {}),
        },
      });

      if (movingCircle) {
        await tx.circleMembership.updateMany({
          where: { studentId: id, endedAt: null },
          data: {
            endedAt: new Date(),
            reason: leavingCircle ? 'التحويل إلى برنامج النشاط' : 'نقل إداري',
          },
        });
        if (dto.circleId && !leavingCircle) {
          await tx.circleMembership.create({
            data: { studentId: id, circleId: dto.circleId, reason: 'نقل إداري' },
          });
        }
      }
    });

    await this.activity.log({
      userId: actor.id,
      action: 'STUDENT_UPDATE',
      summary: `تعديل بيانات الطالب: ${student.fullName}`,
      entityType: 'Student',
      entityId: id,
    });

    return this.findOne(actor, id);
  }

  /** Manual evaluation set by the teacher; every change is kept in history. */
  async setEvaluation(actor: AuthUser, id: string, dto: SetEvaluationDto) {
    const student = await this.acl.assertStudentWriteAccess(actor, id);

    await this.prisma.$transaction([
      this.prisma.student.update({
        where: { id },
        data: {
          evaluation: dto.evaluation,
          evaluationNote: dto.note,
          evaluatedAt: new Date(),
        },
      }),
      this.prisma.studentEvaluation.create({
        data: {
          studentId: id,
          evaluation: dto.evaluation,
          note: dto.note,
          authorId: actor.id,
        },
      }),
    ]);

    await this.activity.log({
      userId: actor.id,
      action: 'STUDENT_EVALUATION',
      summary: `تحديث تقييم الطالب ${student.fullName} إلى ${this.evaluationLabel(dto.evaluation)}`,
      entityType: 'Student',
      entityId: id,
    });

    return this.findOne(actor, id);
  }

  async evaluationHistory(user: AuthUser, id: string) {
    await this.acl.assertStudentAccess(user, id);
    return this.prisma.studentEvaluation.findMany({
      where: { studentId: id },
      include: { author: { select: { id: true, fullName: true, role: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async addNote(actor: AuthUser, id: string, dto: AddNoteDto) {
    await this.acl.assertStudentWriteAccess(actor, id);
    const note = await this.prisma.studentNote.create({
      data: {
        studentId: id,
        authorId: actor.id,
        body: dto.body,
        isPrivate: dto.isPrivate ?? false,
      },
      include: { author: { select: { id: true, fullName: true, role: true } } },
    });
    return note;
  }

  async listNotes(user: AuthUser, id: string) {
    await this.acl.assertStudentAccess(user, id);
    return this.prisma.studentNote.findMany({
      where: {
        studentId: id,
        deletedAt: null,
        ...(user.role === Role.PARENT ? { isPrivate: false } : {}),
      },
      include: { author: { select: { id: true, fullName: true, role: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async removeNote(actor: AuthUser, studentId: string, noteId: string) {
    await this.acl.assertStudentWriteAccess(actor, studentId);
    const note = await this.prisma.studentNote.findFirst({
      where: { id: noteId, studentId, deletedAt: null },
    });
    if (!note) throw new NotFoundException('الملاحظة غير موجودة');
    if (note.authorId !== actor.id && actor.role !== Role.ADMIN) {
      throw new ForbiddenException('يمكن حذف الملاحظة من قبل كاتبها أو الإدارة فقط');
    }
    await this.prisma.studentNote.update({ where: { id: noteId }, data: { deletedAt: new Date() } });
    return { message: 'تم حذف الملاحظة' };
  }

  /** Timeline combining circle moves, suspensions, evaluations and exams. */
  async history(user: AuthUser, id: string) {
    await this.acl.assertStudentAccess(user, id);

    const [memberships, suspensions, evaluations, exams, attendance, recitations] = await Promise.all([
      this.prisma.circleMembership.findMany({
        where: { studentId: id },
        include: { circle: { select: { id: true, name: true, code: true } } },
        orderBy: { startedAt: 'desc' },
      }),
      this.prisma.suspensionRequest.findMany({
        where: { studentId: id },
        include: {
          requestedBy: { select: { fullName: true } },
          decidedBy: { select: { fullName: true } },
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.studentEvaluation.findMany({
        where: { studentId: id },
        include: { author: { select: { fullName: true } } },
        orderBy: { createdAt: 'desc' },
        take: 20,
      }),
      this.prisma.exam.findMany({
        where: { studentId: id },
        include: {
          section: { select: { name: true, order: true } },
          sections: { select: { section: { select: { name: true, order: true } } } },
        },
        orderBy: { scheduledAt: 'desc' },
      }),
      this.prisma.attendance.findMany({
        where: { studentId: id },
        orderBy: { date: 'desc' },
        take: 100,
      }),
      this.prisma.recitation.findMany({
        where: { studentId: id, deletedAt: null },
        orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
        take: 100,
      }),
    ]);

    return { memberships, suspensions, evaluations, exams, attendance, recitations };
  }

  async remove(actor: AuthUser, id: string) {
    const student = await this.prisma.student.findFirst({ where: { id, deletedAt: null } });
    if (!student) throw new NotFoundException('الطالب غير موجود');

    const now = new Date();
    await this.prisma.$transaction([
      this.prisma.circleMembership.updateMany({
        where: { studentId: id, endedAt: null },
        data: { endedAt: now, reason: 'حذف الطالب' },
      }),
      this.prisma.student.update({
        where: { id },
        data: { deletedAt: now, status: StudentStatus.WITHDRAWN, circleId: null },
      }),
    ]);

    await this.activity.log({
      userId: actor.id,
      action: 'STUDENT_DELETE',
      summary: `حذف الطالب: ${student.fullName}`,
      entityType: 'Student',
      entityId: id,
    });

    return { message: 'تم حذف الطالب' };
  }

  // -------------------------------------------------------------------------

  private shape(student: any) {
    const links = student.circle?.teachers || [];
    const primary = links.find((t: any) => t.role === 'PRIMARY');
    return {
      ...student,
      teacherName: primary?.teacher?.user?.fullName ?? null,
      teacherId: primary?.teacher?.id ?? null,
      supervisorName: student.circle?.supervisor?.fullName ?? null,
    };
  }

  private async assertCircleHasRoom(circleId: string) {
    const circle = await this.prisma.circle.findFirst({
      where: { id: circleId, deletedAt: null },
      include: { _count: { select: { students: { where: { deletedAt: null } } } } },
    });
    if (!circle) throw new BadRequestException('الحلقة المحددة غير موجودة');
    if (!circle.isActive) throw new BadRequestException('الحلقة المحددة غير مفعّلة');
    if (circle._count.students >= circle.capacity) {
      throw new BadRequestException(`الحلقة "${circle.name}" مكتملة العدد (${circle.capacity})`);
    }
  }

  private async nextTrackCode(prefix: '2' | '3') {
    const year = new Date().getFullYear();
    for (let attempt = 0; attempt < 100; attempt += 1) {
      const suffix = String(Number.parseInt(randomBytes(2).toString('hex'), 16) % 10000).padStart(4, '0');
      const code = prefix + year + suffix;
      if (!(await this.prisma.student.findUnique({ where: { code } }))) return code;
    }
    throw new ConflictException('تعذر توليد رقم طالب فريد، حاول مرة أخرى');
  }

  private async nextCode() {
    const year = new Date().getFullYear();
    // Format: 1 + registration year (4 digits) + 4 random digits = 9 digits.
    for (let attempt = 0; attempt < 100; attempt += 1) {
      const suffix = String(Number.parseInt(randomBytes(2).toString('hex'), 16) % 10000).padStart(4, '0');
      const code = `1${year}${suffix}`;
      const exists = await this.prisma.student.findUnique({ where: { code } });
      if (!exists) return code;
    }
    throw new ConflictException('تعذر توليد رقم طالب فريد، حاول مرة أخرى');
  }

  private evaluationLabel(evaluation: Evaluation) {
    const labels: Record<Evaluation, string> = {
      EXCELLENT: 'ممتاز',
      VERY_GOOD: 'جيد جداً',
      GOOD: 'جيد',
      ACCEPTABLE: 'مقبول',
      UNSATISFACTORY: 'غير مرضٍ',
    };
    return labels[evaluation];
  }

  private today() {
    const d = new Date();
    return new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  }
}
