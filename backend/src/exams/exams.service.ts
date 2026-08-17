import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  ExamRequestStatus,
  ExamResult,
  ExamStatus,
  NotificationType,
  Prisma,
  Role,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AccessControlService } from '../common/services/access-control.service';
import { ActivityService } from '../common/services/activity.service';
import { NotificationsService } from '../notifications/notifications.service';
import { AuthUser } from '../common/decorators';
import { EVALUATION_LABELS, evaluationFromScore } from '../common/grading';
import { paginate } from '../common/dto/pagination.dto';
import {
  CreateExamRequestDto,
  CreateSectionDto,
  QueryExamRequestsDto,
  QueryExamsDto,
  RecordResultDto,
  ReviewExamRequestDto,
  ScheduleExamDto,
  UpdateExamDto,
} from './dto/exam.dto';

const REQUEST_INCLUDE = {
  student: {
    select: {
      id: true,
      code: true,
      fullName: true,
      memorizedParts: true,
      circle: { select: { id: true, name: true, code: true } },
      parentProfile: { select: { userId: true } },
    },
  },
  section: { select: { id: true, name: true, code: true, order: true, minScore: true } },
  teacher: { select: { id: true, user: { select: { id: true, fullName: true } } } },
  reviewedBy: { select: { id: true, fullName: true } },
  exam: { select: { id: true, scheduledAt: true, status: true, result: true, score: true, evaluation: true } },
} satisfies Prisma.ExamRequestInclude;

const EXAM_INCLUDE = {
  student: {
    select: {
      id: true,
      code: true,
      fullName: true,
      memorizedParts: true,
      circle: { select: { id: true, name: true, code: true } },
      parentProfile: { select: { userId: true } },
    },
  },
  section: { select: { id: true, name: true, code: true, order: true, minScore: true } },
  examiner: { select: { id: true, fullName: true } },
  gradedBy: { select: { id: true, fullName: true } },
  request: { select: { id: true, teacher: { select: { user: { select: { id: true, fullName: true } } } } } },
} satisfies Prisma.ExamInclude;

@Injectable()
export class ExamsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly acl: AccessControlService,
    private readonly activity: ActivityService,
    private readonly notifications: NotificationsService,
  ) {}

  // --- sections ------------------------------------------------------------

  sections() {
    return this.prisma.examSection.findMany({
      where: { isActive: true },
      orderBy: { order: 'asc' },
    });
  }

  async createSection(actor: AuthUser, dto: CreateSectionDto) {
    const clash = await this.prisma.examSection.findFirst({
      where: { OR: [{ code: dto.code }, { order: dto.order }, { name: dto.name }] },
    });
    if (clash) throw new ConflictException('يوجد مقرر بنفس الاسم أو الرمز أو الترتيب');

    const section = await this.prisma.examSection.create({
      data: {
        name: dto.name,
        code: dto.code,
        order: dto.order,
        minScore: dto.minScore ?? 60,
        pagesCount: dto.pagesCount,
        description: dto.description,
      },
    });

    await this.activity.log({
      userId: actor.id,
      action: 'EXAM_SECTION_CREATE',
      summary: `إضافة مقرر اختبار: ${section.name}`,
      entityType: 'ExamSection',
      entityId: section.id,
    });

    return section;
  }

  // --- progression ---------------------------------------------------------

  /**
   * The core progression rule: a student may only sit for a required section
   * once every earlier required section has been passed.
   */
  async eligibility(user: AuthUser, studentId: string) {
    await this.acl.assertStudentAccess(user, studentId);

    const [sections, passed, openWork] = await Promise.all([
      this.prisma.examSection.findMany({ where: { isActive: true }, orderBy: { order: 'asc' } }),
      this.prisma.exam.findMany({
        where: { studentId, status: ExamStatus.COMPLETED, result: ExamResult.PASSED },
        select: { sectionId: true, score: true, gradedAt: true },
      }),
      this.prisma.examRequest.findMany({
        where: {
          studentId,
          status: { in: [ExamRequestStatus.PENDING, ExamRequestStatus.SCHEDULED] },
        },
        select: { sectionId: true, status: true },
      }),
    ]);

    const passedIds = new Set(passed.map((p) => p.sectionId));
    const openIds = new Set(openWork.map((o) => o.sectionId));

    // The first required section that has not been passed yet blocks everything after it.
    const firstUnpassedRequired = sections.find((s) => s.isRequired && !passedIds.has(s.id));

    const progression = sections.map((section) => {
      const isPassed = passedIds.has(section.id);
      const isOpen = openIds.has(section.id);
      let eligible = true;
      let reason: string | null = null;

      if (isPassed) {
        eligible = false;
        reason = 'تم اجتياز هذا المقرر مسبقاً';
      } else if (isOpen) {
        eligible = false;
        reason = 'يوجد طلب اختبار قائم لهذا المقرر';
      } else if (
        section.isRequired &&
        firstUnpassedRequired &&
        section.order > firstUnpassedRequired.order
      ) {
        eligible = false;
        reason = `يجب اجتياز "${firstUnpassedRequired.name}" أولاً`;
      }

      return {
        ...section,
        isPassed,
        hasOpenRequest: isOpen,
        eligible,
        reason,
        score: passed.find((p) => p.sectionId === section.id)?.score ?? null,
      };
    });

    // `nextSection` drives the request form, so it must stay strictly "requestable".
    // The extra fields let the UI explain *why* nothing is requestable instead of
    // falling back to "the programme is finished", which is only true when every
    // required section has actually been passed.
    const pendingSection = progression.find((p) => p.hasOpenRequest) ?? null;

    return {
      passedCount: passedIds.size,
      totalSections: sections.length,
      nextSection: progression.find((p) => p.eligible) ?? null,
      /** The section the student is already waiting on, if any. */
      pendingSection: pendingSection
        ? { id: pendingSection.id, name: pendingSection.name, order: pendingSection.order }
        : null,
      /** True only when every section (required or optional) has been passed. */
      isComplete: progression.every((p) => p.isPassed),
      progression,
    };
  }

  private async assertEligible(studentId: string, sectionId: string) {
    const section = await this.prisma.examSection.findFirst({
      where: { id: sectionId, isActive: true },
    });
    if (!section) throw new BadRequestException('المقرر المحدد غير موجود');

    const alreadyPassed = await this.prisma.exam.findFirst({
      where: { studentId, sectionId, status: ExamStatus.COMPLETED, result: ExamResult.PASSED },
    });
    if (alreadyPassed) throw new ConflictException(`الطالب اجتاز "${section.name}" مسبقاً`);

    const open = await this.prisma.examRequest.findFirst({
      where: {
        studentId,
        sectionId,
        status: { in: [ExamRequestStatus.PENDING, ExamRequestStatus.SCHEDULED] },
      },
    });
    if (open) throw new ConflictException('يوجد طلب اختبار قائم لهذا المقرر');

    if (section.isRequired) {
      const priorRequired = await this.prisma.examSection.findMany({
        where: { isActive: true, isRequired: true, order: { lt: section.order } },
        orderBy: { order: 'asc' },
      });
      if (priorRequired.length) {
        const passed = await this.prisma.exam.findMany({
          where: {
            studentId,
            sectionId: { in: priorRequired.map((s) => s.id) },
            status: ExamStatus.COMPLETED,
            result: ExamResult.PASSED,
          },
          select: { sectionId: true },
        });
        const passedIds = new Set(passed.map((p) => p.sectionId));
        const missing = priorRequired.find((s) => !passedIds.has(s.id));
        if (missing) {
          throw new BadRequestException(
            `لا يمكن التقدم لاختبار "${section.name}" قبل اجتياز "${missing.name}"`,
          );
        }
      }
    }

    return section;
  }

  // --- requests (waiting list) --------------------------------------------

  async requestExam(actor: AuthUser, dto: CreateExamRequestDto) {
    const student = await this.acl.assertStudentWriteAccess(actor, dto.studentId);
    if (!student.circleId) throw new BadRequestException('الطالب غير مسجل في حلقة');
    if (student.status === 'SUSPENDED') {
      throw new BadRequestException('لا يمكن تقديم طلب اختبار لطالب موقوف');
    }

    const section = await this.assertEligible(dto.studentId, dto.sectionId);
    const teacherId = await this.resolveTeacherId(actor, student.circleId);

    const request = await this.prisma.examRequest.create({
      data: {
        studentId: dto.studentId,
        sectionId: dto.sectionId,
        teacherId,
        note: dto.note,
      },
      include: REQUEST_INCLUDE,
    });

    await this.notifications.notifyRoles([Role.EXAM_COMMITTEE, Role.ADMIN], {
      type: NotificationType.EXAM_REQUEST,
      title: 'طلب اختبار جديد',
      body: `طلب اختبار الطالب ${student.fullName} في "${section.name}"`,
      link: `/exams/requests/${request.id}`,
    });

    await this.activity.log({
      userId: actor.id,
      action: 'EXAM_REQUEST',
      summary: `طلب اختبار الطالب ${student.fullName} في ${section.name}`,
      entityType: 'ExamRequest',
      entityId: request.id,
    });

    return request;
  }

  async findRequests(user: AuthUser, query: QueryExamRequestsDto) {
    const scope = await this.acl.studentScope(user);

    const where: Prisma.ExamRequestWhereInput = {
      student: { ...scope, deletedAt: null },
      ...(query.status ? { status: query.status } : {}),
      ...(query.studentId ? { studentId: query.studentId } : {}),
      ...(query.sectionId ? { sectionId: query.sectionId } : {}),
      ...(query.search
        ? { student: { ...scope, deletedAt: null, fullName: { contains: query.search, mode: 'insensitive' } } }
        : {}),
    };

    const [data, total] = await this.prisma.$transaction([
      this.prisma.examRequest.findMany({
        where,
        include: REQUEST_INCLUDE,
        orderBy: { createdAt: query.sortOrder || 'asc' },
        skip: query.skip,
        take: query.take,
      }),
      this.prisma.examRequest.count({ where }),
    ]);

    return paginate(data, total, query.page, query.limit);
  }

  async findRequest(user: AuthUser, id: string) {
    const request = await this.prisma.examRequest.findUnique({
      where: { id },
      include: REQUEST_INCLUDE,
    });
    if (!request) throw new NotFoundException('طلب الاختبار غير موجود');
    await this.acl.assertStudentAccess(user, request.studentId);
    return request;
  }

  async rejectRequest(actor: AuthUser, id: string, dto: ReviewExamRequestDto) {
    const request = await this.prisma.examRequest.findUnique({
      where: { id },
      include: REQUEST_INCLUDE,
    });
    if (!request) throw new NotFoundException('طلب الاختبار غير موجود');
    if (request.status !== ExamRequestStatus.PENDING) {
      throw new BadRequestException('تم البت في هذا الطلب مسبقاً');
    }

    const updated = await this.prisma.examRequest.update({
      where: { id },
      data: {
        status: ExamRequestStatus.REJECTED,
        reviewedById: actor.id,
        reviewedAt: new Date(),
        reviewNote: dto.reviewNote,
      },
      include: REQUEST_INCLUDE,
    });

    await this.notifications.notify({
      userId: request.teacher.user.id,
      type: NotificationType.EXAM_REQUEST,
      title: 'تم رفض طلب الاختبار',
      body: `طلب اختبار ${request.student.fullName} في "${request.section.name}"${
        dto.reviewNote ? ` — ${dto.reviewNote}` : ''
      }`,
      link: `/exams/requests/${id}`,
    });

    return updated;
  }

  async cancelRequest(actor: AuthUser, id: string) {
    const request = await this.prisma.examRequest.findUnique({
      where: { id },
      include: { teacher: true },
    });
    if (!request) throw new NotFoundException('طلب الاختبار غير موجود');
    if (request.status !== ExamRequestStatus.PENDING) {
      throw new BadRequestException('لا يمكن إلغاء طلب تمت جدولته أو البت فيه');
    }
    if (
      actor.role !== Role.ADMIN &&
      actor.role !== Role.EXAM_COMMITTEE &&
      actor.teacherId !== request.teacherId
    ) {
      throw new ForbiddenException('يمكن إلغاء الطلب من قبل المعلم صاحب الطلب أو اللجنة');
    }

    return this.prisma.examRequest.update({
      where: { id },
      data: { status: ExamRequestStatus.CANCELLED, reviewedAt: new Date(), reviewedById: actor.id },
      include: REQUEST_INCLUDE,
    });
  }

  // --- scheduling ----------------------------------------------------------

  async scheduleExam(actor: AuthUser, requestId: string, dto: ScheduleExamDto) {
    const request = await this.prisma.examRequest.findUnique({
      where: { id: requestId },
      include: REQUEST_INCLUDE,
    });
    if (!request) throw new NotFoundException('طلب الاختبار غير موجود');
    if (request.status !== ExamRequestStatus.PENDING) {
      throw new BadRequestException('هذا الطلب ليس في قائمة الانتظار');
    }

    const scheduledAt = new Date(dto.scheduledAt);
    if (Number.isNaN(scheduledAt.getTime())) throw new BadRequestException('موعد الاختبار غير صالح');
    if (scheduledAt.getTime() < Date.now() - 60 * 60 * 1000) {
      throw new BadRequestException('لا يمكن جدولة اختبار في الماضي');
    }

    if (dto.examinerId) await this.assertExaminer(dto.examinerId);

    // Re-check progression: another exam may have been graded since the request.
    await this.assertProgressionStillValid(request.studentId, request.sectionId);

    const exam = await this.prisma.$transaction(async (tx) => {
      const created = await tx.exam.create({
        data: {
          requestId,
          studentId: request.studentId,
          sectionId: request.sectionId,
          examinerId: dto.examinerId || null,
          scheduledAt,
          location: dto.location,
          notes: dto.notes,
        },
        include: EXAM_INCLUDE,
      });
      await tx.examRequest.update({
        where: { id: requestId },
        data: {
          status: ExamRequestStatus.SCHEDULED,
          reviewedById: actor.id,
          reviewedAt: new Date(),
        },
      });
      return created;
    });

    const when = scheduledAt.toLocaleString('ar-EG', { dateStyle: 'full', timeStyle: 'short' });

    await this.notifications.notify({
      userId: request.teacher.user.id,
      type: NotificationType.EXAM_SCHEDULED,
      title: 'تم تحديد موعد اختبار',
      body: `اختبار ${request.student.fullName} في "${request.section.name}" بتاريخ ${when}`,
      link: `/exams/${exam.id}`,
    });

    if (request.student.parentProfile?.userId) {
      await this.notifications.notify({
        userId: request.student.parentProfile.userId,
        type: NotificationType.EXAM_SCHEDULED,
        title: 'موعد اختبار قادم',
        body: `اختبار ${request.student.fullName} في "${request.section.name}" بتاريخ ${when}`,
        link: `/parent/children/${request.studentId}`,
      });
    }

    if (dto.examinerId) {
      await this.notifications.notify({
        userId: dto.examinerId,
        type: NotificationType.EXAM_SCHEDULED,
        title: 'تم إسنادك كممتحن',
        body: `اختبار ${request.student.fullName} في "${request.section.name}" بتاريخ ${when}`,
        link: `/exams/${exam.id}`,
      });
    }

    await this.activity.log({
      userId: actor.id,
      action: 'EXAM_SCHEDULE',
      summary: `جدولة اختبار ${request.student.fullName} في ${request.section.name}`,
      entityType: 'Exam',
      entityId: exam.id,
    });

    return exam;
  }

  async updateExam(actor: AuthUser, id: string, dto: UpdateExamDto) {
    const exam = await this.prisma.exam.findUnique({ where: { id }, include: EXAM_INCLUDE });
    if (!exam) throw new NotFoundException('الاختبار غير موجود');
    if (exam.status === ExamStatus.COMPLETED) {
      throw new BadRequestException('لا يمكن تعديل اختبار مكتمل');
    }
    if (dto.examinerId) await this.assertExaminer(dto.examinerId);

    const updated = await this.prisma.exam.update({
      where: { id },
      data: {
        scheduledAt: dto.scheduledAt ? new Date(dto.scheduledAt) : undefined,
        examinerId: dto.examinerId,
        location: dto.location,
        status: dto.status,
        notes: dto.notes,
      },
      include: EXAM_INCLUDE,
    });

    if (dto.status === ExamStatus.CANCELLED && exam.requestId) {
      await this.prisma.examRequest.update({
        where: { id: exam.requestId },
        data: { status: ExamRequestStatus.CANCELLED },
      });
    }

    return updated;
  }

  // --- results -------------------------------------------------------------

  async recordResult(actor: AuthUser, id: string, dto: RecordResultDto) {
    const exam = await this.prisma.exam.findUnique({ where: { id }, include: EXAM_INCLUDE });
    if (!exam) throw new NotFoundException('الاختبار غير موجود');
    if (exam.status === ExamStatus.COMPLETED) {
      throw new BadRequestException('تم رصد نتيجة هذا الاختبار مسبقاً');
    }
    if (exam.status === ExamStatus.CANCELLED) {
      throw new BadRequestException('هذا الاختبار ملغى');
    }

    const passed = dto.score >= exam.section.minScore;
    // The evaluation always follows the score, so the examiner enters a mark and
    // notes only — there is no wording to pick and nothing to disagree about.
    const evaluation = evaluationFromScore(dto.score);

    const updated = await this.prisma.$transaction(async (tx) => {
      const result = await tx.exam.update({
        where: { id },
        data: {
          score: dto.score,
          evaluation,
          mistakes: dto.mistakes ?? null,
          result: passed ? ExamResult.PASSED : ExamResult.FAILED,
          status: ExamStatus.COMPLETED,
          notes: dto.notes,
          gradedById: actor.id,
          gradedAt: new Date(),
        },
        include: EXAM_INCLUDE,
      });

      if (exam.requestId) {
        await tx.examRequest.update({
          where: { id: exam.requestId },
          data: { status: ExamRequestStatus.COMPLETED },
        });
      }

      // Passing a juz' advances the student's recorded memorization total.
      if (passed) {
        const passedCount = await tx.exam.count({
          where: { studentId: exam.studentId, status: ExamStatus.COMPLETED, result: ExamResult.PASSED },
        });
        await tx.student.update({
          where: { id: exam.studentId },
          data: { memorizedParts: Math.min(30, passedCount) },
        });
      }

      return result;
    });

    const title = passed ? 'نتيجة اختبار: ناجح' : 'نتيجة اختبار: لم يجتز';
    const body = `${exam.student.fullName} — "${exam.section.name}" بدرجة ${dto.score} من 100 (${EVALUATION_LABELS[evaluation]})`;

    const recipients: string[] = [];
    if (exam.request?.teacher?.user?.id) recipients.push(exam.request.teacher.user.id);
    if (exam.student.parentProfile?.userId) recipients.push(exam.student.parentProfile.userId);

    for (const userId of [...new Set(recipients)]) {
      await this.notifications.notify({
        userId,
        type: NotificationType.EXAM_RESULT,
        title,
        body,
        link: `/exams/${id}`,
        data: { examId: id, passed, score: dto.score },
      });
    }

    await this.activity.log({
      userId: actor.id,
      action: 'EXAM_RESULT',
      summary: `رصد نتيجة اختبار ${exam.student.fullName} في ${exam.section.name}: ${dto.score} (${EVALUATION_LABELS[evaluation]})`,
      entityType: 'Exam',
      entityId: id,
    });

    return updated;
  }

  async markAbsent(actor: AuthUser, id: string) {
    const exam = await this.prisma.exam.findUnique({ where: { id } });
    if (!exam) throw new NotFoundException('الاختبار غير موجود');
    if (exam.status !== ExamStatus.SCHEDULED) {
      throw new BadRequestException('يمكن تسجيل الغياب للاختبارات المجدولة فقط');
    }

    const updated = await this.prisma.exam.update({
      where: { id },
      data: { status: ExamStatus.ABSENT, gradedById: actor.id, gradedAt: new Date() },
      include: EXAM_INCLUDE,
    });

    if (exam.requestId) {
      await this.prisma.examRequest.update({
        where: { id: exam.requestId },
        data: { status: ExamRequestStatus.COMPLETED },
      });
    }

    return updated;
  }

  // --- reads ---------------------------------------------------------------

  async findExams(user: AuthUser, query: QueryExamsDto) {
    const scope = await this.acl.studentScope(user);

    const where: Prisma.ExamWhereInput = {
      student: { ...scope, deletedAt: null },
      ...(query.status ? { status: query.status } : {}),
      ...(query.studentId ? { studentId: query.studentId } : {}),
      ...(query.sectionId ? { sectionId: query.sectionId } : {}),
      ...(query.examinerId ? { examinerId: query.examinerId } : {}),
      ...(query.from || query.to
        ? {
            scheduledAt: {
              ...(query.from ? { gte: new Date(query.from) } : {}),
              ...(query.to ? { lte: new Date(query.to) } : {}),
            },
          }
        : {}),
    };

    const [data, total] = await this.prisma.$transaction([
      this.prisma.exam.findMany({
        where,
        include: EXAM_INCLUDE,
        orderBy: { scheduledAt: query.sortOrder || 'desc' },
        skip: query.skip,
        take: query.take,
      }),
      this.prisma.exam.count({ where }),
    ]);

    return paginate(data, total, query.page, query.limit);
  }

  async findExam(user: AuthUser, id: string) {
    const exam = await this.prisma.exam.findUnique({ where: { id }, include: EXAM_INCLUDE });
    if (!exam) throw new NotFoundException('الاختبار غير موجود');
    await this.acl.assertStudentAccess(user, exam.studentId);
    return exam;
  }

  async upcoming(user: AuthUser, days = 30) {
    const scope = await this.acl.studentScope(user);
    const until = new Date();
    until.setDate(until.getDate() + days);

    return this.prisma.exam.findMany({
      where: {
        student: { ...scope, deletedAt: null },
        status: ExamStatus.SCHEDULED,
        scheduledAt: { gte: new Date(), lte: until },
      },
      include: EXAM_INCLUDE,
      orderBy: { scheduledAt: 'asc' },
      take: 50,
    });
  }

  async stats(user: AuthUser) {
    const scope = await this.acl.studentScope(user);
    const studentFilter = { student: { ...scope, deletedAt: null } };

    const [pendingRequests, scheduled, completed, passed, failed] = await Promise.all([
      this.prisma.examRequest.count({
        where: { ...studentFilter, status: ExamRequestStatus.PENDING },
      }),
      this.prisma.exam.count({ where: { ...studentFilter, status: ExamStatus.SCHEDULED } }),
      this.prisma.exam.count({ where: { ...studentFilter, status: ExamStatus.COMPLETED } }),
      this.prisma.exam.count({
        where: { ...studentFilter, status: ExamStatus.COMPLETED, result: ExamResult.PASSED },
      }),
      this.prisma.exam.count({
        where: { ...studentFilter, status: ExamStatus.COMPLETED, result: ExamResult.FAILED },
      }),
    ]);

    return {
      pendingRequests,
      scheduled,
      completed,
      passed,
      failed,
      passRate: completed ? Math.round((passed / completed) * 100) : 0,
    };
  }

  /** Committee members available to be assigned as examiners. */
  examiners() {
    return this.prisma.user.findMany({
      where: {
        role: { in: [Role.EXAM_COMMITTEE, Role.ADMIN] },
        isActive: true,
        deletedAt: null,
      },
      select: { id: true, fullName: true, role: true },
      orderBy: { fullName: 'asc' },
    });
  }

  // -------------------------------------------------------------------------

  private async assertExaminer(userId: string) {
    const examiner = await this.prisma.user.findFirst({
      where: {
        id: userId,
        deletedAt: null,
        isActive: true,
        role: { in: [Role.EXAM_COMMITTEE, Role.ADMIN] },
      },
    });
    if (!examiner) throw new BadRequestException('الممتحن المحدد غير صالح');
  }

  private async assertProgressionStillValid(studentId: string, sectionId: string) {
    const section = await this.prisma.examSection.findUnique({ where: { id: sectionId } });
    if (!section || !section.isRequired) return;

    const priorRequired = await this.prisma.examSection.findMany({
      where: { isActive: true, isRequired: true, order: { lt: section.order } },
      orderBy: { order: 'asc' },
    });
    if (!priorRequired.length) return;

    const passed = await this.prisma.exam.findMany({
      where: {
        studentId,
        sectionId: { in: priorRequired.map((s) => s.id) },
        status: ExamStatus.COMPLETED,
        result: ExamResult.PASSED,
      },
      select: { sectionId: true },
    });
    const passedIds = new Set(passed.map((p) => p.sectionId));
    const missing = priorRequired.find((s) => !passedIds.has(s.id));
    if (missing) {
      throw new BadRequestException(
        `لا يمكن جدولة اختبار "${section.name}" قبل اجتياز "${missing.name}"`,
      );
    }
  }

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
}
