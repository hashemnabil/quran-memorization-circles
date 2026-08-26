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
  ExamSectionKind,
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
import { HIZB_PER_JUZ, describeSections, exactJuzFromHizb, juzFromHizb } from '../common/quran';
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
  section: { select: { id: true, name: true, code: true, order: true, kind: true, minScore: true } },
  // The full set of juz'/ahzab this request covers. `section` above stays the
  // primary (lowest-ordered) one that the progression rules are keyed on.
  sections: {
    select: { section: { select: { id: true, name: true, code: true, order: true, kind: true, minScore: true } } },
    orderBy: { section: { order: 'asc' } },
  },
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
  section: { select: { id: true, name: true, code: true, order: true, kind: true, minScore: true } },
  sections: {
    select: { section: { select: { id: true, name: true, code: true, order: true, kind: true, minScore: true } } },
    orderBy: { section: { order: 'asc' } },
  },
  examiner: { select: { id: true, fullName: true } },
  gradedBy: { select: { id: true, fullName: true } },
  request: { select: { id: true, teacher: { select: { user: { select: { id: true, fullName: true } } } } } },
} satisfies Prisma.ExamInclude;

/** The shape of an `ExamSection` row, as far as the sequencing rules care. */
type ExamSectionRow = { id: string; name: string; code: string; order: number; kind: ExamSectionKind };

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
        // The programme is the ahzab, so a hand-added section is one unless
        // the administration says otherwise.
        kind: dto.kind ?? ExamSectionKind.HIZB,
        isRequired: dto.isRequired ?? true,
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
   * The route a student is taking through the ahzab.
   *
   * A circle works either upwards (hizb 1 → 60) or downwards (60 → 1), and the
   * direction is settled by whichever end the student started from. Until they
   * have passed anything, both routes are on offer.
   */
  private buildChains(sections: ExamSectionRow[], passedIds: Set<string>) {
    const ascending = [...sections].sort((a, b) => a.order - b.order);
    const descending = [...ascending].reverse();
    const remaining = (list: ExamSectionRow[]) => list.filter((x) => !passedIds.has(x.id));

    const asc = { direction: 'ASC' as const, sections: remaining(ascending) };
    const desc = { direction: 'DESC' as const, sections: remaining(descending) };

    const startedUp = ascending.length > 0 && passedIds.has(ascending[0].id);
    const startedDown = ascending.length > 0 && passedIds.has(ascending[ascending.length - 1].id);

    // Exactly one end touched settles the direction. Neither (nothing passed
    // yet, or older data that started somewhere in the middle) or both leaves
    // both routes open rather than guessing.
    if (startedUp && !startedDown) return { direction: 'ASC' as const, chains: [asc] };
    if (startedDown && !startedUp) return { direction: 'DESC' as const, chains: [desc] };
    return { direction: null, chains: [asc, desc] };
  }

  /**
   * What this student may be examined on right now.
   *
   * Exams are sat by the hizb, in sequence, in the student's own direction: the
   * next one is whatever follows the last hizb they passed. Several may be
   * taken in one exam — 57, 56 and 55 together — as long as they are the *next*
   * ones, so 58, 59 and 60 must already be behind them. Progress is reported in
   * ahzab, with the juz' equivalent alongside for screens that speak in ajza'.
   */
  async eligibility(user: AuthUser, studentId: string) {
    await this.acl.assertStudentAccess(user, studentId);

    const [sections, passed, openWork] = await Promise.all([
      this.prisma.examSection.findMany({ where: { isActive: true }, orderBy: { order: 'asc' } }),
      this.prisma.exam.findMany({
        where: { studentId, status: ExamStatus.COMPLETED, result: ExamResult.PASSED },
        // One exam may cover several ahzab; passing it passes all of them, so
        // the join has to be read as well as the primary `sectionId`. Reading
        // the primary alone credited one hizb out of four.
        select: {
          sectionId: true,
          score: true,
          gradedAt: true,
          sections: { select: { sectionId: true } },
        },
      }),
      this.prisma.examRequest.findMany({
        where: {
          studentId,
          status: { in: [ExamRequestStatus.PENDING, ExamRequestStatus.SCHEDULED] },
        },
        // An exam may cover several ahzab; `sectionId` is only the primary one,
        // so the join carries the rest. Reading the primary alone left the
        // others looking free while they were already on a pending request.
        select: { sectionId: true, status: true, sections: { select: { sectionId: true } } },
      }),
    ]);

    const passedIds = new Set(
      passed.flatMap((p) => [p.sectionId, ...p.sections.map((x) => x.sectionId)]),
    );
    const openIds = new Set(
      openWork.flatMap((o) => [o.sectionId, ...o.sections.map((x) => x.sectionId)]),
    );
    const { direction, chains } = this.buildChains(sections, passedIds);

    // The head of every offered chain is what can be requested next; anything
    // further along waits for the one in front of it.
    const heads = new Map<string, { chain: (typeof chains)[number]; index: number }>();
    for (const chain of chains) {
      chain.sections.forEach((section, index) => {
        const existing = heads.get(section.id);
        if (!existing || index < existing.index) heads.set(section.id, { chain, index });
      });
    }

    const progression = sections.map((section) => {
      const isPassed = passedIds.has(section.id);
      const isOpen = openIds.has(section.id);
      const place = heads.get(section.id);
      const isNext = place?.index === 0;

      let eligible = false;
      let reason: string | null = null;

      if (isPassed) {
        reason = 'تم اجتياز هذا المقرر مسبقاً';
      } else if (isOpen) {
        reason = 'يوجد طلب اختبار قائم لهذا المقرر';
      } else if (isNext) {
        eligible = true;
      } else if (place) {
        reason = `يجب اجتياز "${place.chain.sections[place.index - 1].name}" أولاً`;
      }

      return {
        ...section,
        isPassed,
        hasOpenRequest: isOpen,
        eligible,
        reason,
        score:
          passed.find(
            (p) => p.sectionId === section.id || p.sections.some((x) => x.sectionId === section.id),
          )?.score ?? null,
      };
    });

    const pendingSection = progression.find((p) => p.hasOpenRequest) ?? null;
    const hizbPassed = sections.filter((x) => passedIds.has(x.id)).length;

    const chainRefs = chains.map((chain) => ({
      direction: chain.direction,
      label: chain.direction === 'ASC' ? 'من الحزب 1 تصاعدياً' : 'من الحزب 60 تنازلياً',
      // Only the run that is still requestable: the moment one hizb has an open
      // request, nothing behind it can be asked for either.
      sections: chain.sections
        .slice(0, chain.sections.findIndex((x) => openIds.has(x.id)) + 1 || chain.sections.length)
        .filter((x) => !openIds.has(x.id))
        .map((x) => ({ id: x.id, name: x.name, code: x.code, order: x.order, kind: x.kind })),
    }));

    return {
      passedCount: passedIds.size,
      totalSections: sections.length,
      /**
       * Everything is counted in ahzab, because that is what is examined. The
       * juz' figure is the same number divided by two, carried here so a
       * profile or a report does not have to re-derive it.
       */
      hizbPassed,
      hizbTotal: sections.length,
      juzEquivalent: juzFromHizb(hizbPassed),
      juzTotal: sections.length / HIZB_PER_JUZ,
      // Kept for the screens still phrased around a "required" programme: every
      // hizb is required, so these mirror the hizb counts.
      requiredPassed: hizbPassed,
      requiredTotal: sections.length,
      /** `null` while the student may still start from either end. */
      direction,
      /** The remaining route(s), in order — the request form walks these. */
      chains: chainRefs,
      nextSection: progression.find((p) => p.eligible) ?? null,
      /** Everything the teacher may pick for a multi-section request right now. */
      selectableSections: progression
        .filter((p) => p.eligible)
        .map((p) => ({ id: p.id, name: p.name, code: p.code, order: p.order, kind: p.kind })),
      /** The section the student is already waiting on, if any. */
      pendingSection: pendingSection
        ? { id: pendingSection.id, name: pendingSection.name, order: pendingSection.order }
        : null,
      /** True only once every hizb has been passed. */
      isComplete: hizbPassed === sections.length,
      progression,
    };
  }

  private async assertEligible(studentId: string, sectionId: string) {
    const section = await this.prisma.examSection.findFirst({
      where: { id: sectionId, isActive: true },
    });
    if (!section) throw new BadRequestException('المقرر المحدد غير موجود');

    const alreadyPassed = await this.prisma.exam.findFirst({
      where: {
        studentId,
        status: ExamStatus.COMPLETED,
        result: ExamResult.PASSED,
        OR: [{ sectionId }, { sections: { some: { sectionId } } }],
      },
    });
    if (alreadyPassed) throw new ConflictException(`الطالب اجتاز "${section.name}" مسبقاً`);

    const open = await this.prisma.examRequest.findFirst({
      where: {
        studentId,
        status: { in: [ExamRequestStatus.PENDING, ExamRequestStatus.SCHEDULED] },
        // Either the primary hizb of an open request, or one of the others it covers.
        OR: [{ sectionId }, { sections: { some: { sectionId } } }],
      },
    });
    if (open) throw new ConflictException('يوجد طلب اختبار قائم لهذا المقرر');

    return section;
  }

  /**
   * The sequence rule for a whole request.
   *
   * The direction is the student's own, but within it the ahzab must be taken
   * in order: the set being requested has to be the *next* run on their route.
   * A student working downwards from 60 may ask for 57, 56 and 55 in one exam
   * only once 60, 59 and 58 are behind them.
   *
   * Checked over the set rather than section by section, because "is this the
   * next one" depends on what else is in the same request.
   */
  private async assertSequential(studentId: string, requested: ExamSectionRow[]) {
    const [sections, passed] = await Promise.all([
      this.prisma.examSection.findMany({
        where: { isActive: true },
        orderBy: { order: 'asc' },
        select: { id: true, name: true, code: true, order: true, kind: true },
      }),
      this.prisma.exam.findMany({
        where: { studentId, status: ExamStatus.COMPLETED, result: ExamResult.PASSED },
        select: { sectionId: true, sections: { select: { sectionId: true } } },
      }),
    ]);

    const passedIds = new Set(
      passed.flatMap((x) => [x.sectionId, ...x.sections.map((y) => y.sectionId)]),
    );
    const { chains } = this.buildChains(sections, passedIds);
    const requestedIds = new Set(requested.map((x) => x.id));

    // A valid request is the opening run of one of the routes still available.
    const matched = chains.find((chain) => {
      const head = chain.sections.slice(0, requested.length);
      return head.length === requested.length && head.every((x) => requestedIds.has(x.id));
    });
    if (matched) return;

    if (chains.length > 1) {
      const [asc, desc] = chains;
      throw new BadRequestException(
        `يبدأ مسار الاختبارات من "${asc.sections[0]?.name}" تصاعدياً أو من "${desc.sections[0]?.name}" تنازلياً، ثم بالتسلسل`,
      );
    }

    const chain = chains[0];
    const expected = chain.sections.slice(0, requested.length);
    // The first hizb they asked for that is not where the route currently is.
    const gap = expected.find((x) => !requestedIds.has(x.id));
    throw new BadRequestException(
      gap
        ? `لا يمكن طلب هذه الأحزاب قبل اجتياز "${gap.name}"`
        : `يجب طلب الأحزاب بالتسلسل ابتداءً من "${chain.sections[0]?.name}"`,
    );
  }

  // --- requests (waiting list) --------------------------------------------

  async requestExam(actor: AuthUser, dto: CreateExamRequestDto) {
    const student = await this.acl.assertStudentWriteAccess(actor, dto.studentId);
    if (!student.circleId) throw new BadRequestException('الطالب غير مسجل في حلقة');
    if (student.status === 'SUSPENDED') {
      throw new BadRequestException('لا يمكن تقديم طلب اختبار لطالب موقوف');
    }
    if (student.status === 'ACTIVITY') {
      throw new BadRequestException('لا يمكن تقديم طلب اختبار لطالب في برنامج النشاط');
    }

    const sectionIds = [...new Set(dto.sectionIds)];
    const sections = await this.prisma.examSection.findMany({
      where: { id: { in: sectionIds }, isActive: true },
      orderBy: { order: 'asc' },
    });
    if (sections.length !== sectionIds.length) {
      throw new BadRequestException('أحد المقررات المحددة غير موجود');
    }

    // Every selected section has to be eligible on its own; the lowest-ordered
    // one becomes the request's primary section, which is what the progression
    // ladder and the existing queries are keyed on.
    for (const section of sections) {
      await this.assertEligible(dto.studentId, section.id);
    }
    // ... and the set as a whole has to be the next run on the student's route.
    await this.assertSequential(dto.studentId, sections);
    const primary = sections[0];

    const teacherId = await this.resolveTeacherId(actor, student.circleId);

    const request = await this.prisma.examRequest.create({
      data: {
        studentId: dto.studentId,
        sectionId: primary.id,
        teacherId,
        note: dto.note,
        sections: { create: sections.map((s) => ({ sectionId: s.id })) },
      },
      include: REQUEST_INCLUDE,
    });

    const label = this.sectionsLabel(sections);

    await this.notifications.notifyRoles([Role.EXAM_COMMITTEE, Role.ADMIN], {
      type: NotificationType.EXAM_REQUEST,
      title: 'طلب اختبار جديد',
      body: `طلب اختبار الطالب ${student.fullName} في ${label}`,
      link: `/exams/requests/${request.id}`,
    });

    await this.activity.log({
      userId: actor.id,
      action: 'EXAM_REQUEST',
      summary: `طلب اختبار الطالب ${student.fullName} في ${label}`,
      entityType: 'ExamRequest',
      entityId: request.id,
    });

    return request;
  }

  /**
   * Every hizb the exam covers, for a message a human reads.
   *
   * Naming only the primary section made a five-hizb exam read as "الحزب 1"
   * everywhere it was announced — to the committee, to the teacher and to the
   * parent.
   */
  private sectionsLabel(sections: { name: string; order: number }[]) {
    return `"${describeSections(sections)}"`;
  }

  /** The same, for an exam row: falls back to the primary if the join is empty. */
  private examLabel(exam: {
    section: { name: string; order: number };
    sections?: { section: { name: string; order: number } }[];
  }) {
    const all = exam.sections?.length ? exam.sections.map((x) => x.section) : [exam.section];
    return describeSections(all);
  }

  /** And for a request, which carries the same shape. */
  private requestLabel(request: {
    section: { name: string; order: number };
    sections?: { section: { name: string; order: number } }[];
  }) {
    const all = request.sections?.length ? request.sections.map((x) => x.section) : [request.section];
    return describeSections(all);
  }

  async findRequests(user: AuthUser, query: QueryExamRequestsDto) {
    const scope = await this.acl.studentScope(user);

    const where: Prisma.ExamRequestWhereInput = {
      student: { ...scope, deletedAt: null },
      ...(query.status ? { status: query.status } : {}),
      ...(query.studentId ? { studentId: query.studentId } : {}),
      ...(query.sectionId ? { sectionId: query.sectionId } : {}),
      ...((query as { kind?: string }).kind
        ? { section: { kind: (query as { kind?: any }).kind } }
        : {}),
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
      body: `طلب اختبار ${request.student.fullName} في "${this.requestLabel(request)}"${
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

    // Nothing to re-check: the ahzab have no required order, so a request that
    // was valid when it was raised is still valid now. The only thing that can
    // invalidate it is the student passing that same hizb in the meantime,
    // which `assertEligible` already refuses at request time and which would
    // have closed this request.

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
          // Copy the request's full section list onto the exam, so the record
          // shows everything the student was actually examined on.
          sections: {
            create: (request.sections.length
              ? request.sections.map((s) => s.section.id)
              : [request.sectionId]
            ).map((sectionId) => ({ sectionId })),
          },
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
      body: `اختبار ${request.student.fullName} في "${this.requestLabel(request)}" بتاريخ ${when}`,
      link: `/exams/${exam.id}`,
    });

    if (request.student.parentProfile?.userId) {
      await this.notifications.notify({
        userId: request.student.parentProfile.userId,
        type: NotificationType.EXAM_SCHEDULED,
        title: 'موعد اختبار قادم',
        body: `اختبار ${request.student.fullName} في "${this.requestLabel(request)}" بتاريخ ${when}`,
        link: `/parent/children/${request.studentId}`,
      });
    }

    if (dto.examinerId) {
      await this.notifications.notify({
        userId: dto.examinerId,
        type: NotificationType.EXAM_SCHEDULED,
        title: 'تم إسنادك كممتحن',
        body: `اختبار ${request.student.fullName} في "${this.requestLabel(request)}" بتاريخ ${when}`,
        link: `/exams/${exam.id}`,
      });
    }

    await this.activity.log({
      userId: actor.id,
      action: 'EXAM_SCHEDULE',
      summary: `جدولة اختبار ${request.student.fullName} في ${this.requestLabel(request)}`,
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

      // The memorization total is in ajza', derived from the ahzab actually
      // passed — counted as distinct sections, since one exam may carry four of
      // them, and kept to halves so five ahzab reads as 2.5 rather than 2.
      if (passed) {
        const passedExams = await tx.exam.findMany({
          where: {
            studentId: exam.studentId,
            status: ExamStatus.COMPLETED,
            result: ExamResult.PASSED,
          },
          select: { sectionId: true, sections: { select: { sectionId: true } } },
        });
        // Only sections still in the programme: a student who sat the old juz'
        // exams carries passed rows against retired sections, and counting
        // those as ahzab put their total half a programme ahead of what
        // `eligibility` reports.
        const active = await tx.examSection.findMany({
          where: { isActive: true },
          select: { id: true },
        });
        const activeIds = new Set(active.map((x) => x.id));
        const passedSections = new Set(
          passedExams
            .flatMap((e) => [e.sectionId, ...e.sections.map((x) => x.sectionId)])
            .filter((id) => activeIds.has(id)),
        );
        await tx.student.update({
          where: { id: exam.studentId },
          data: { memorizedParts: Math.min(30, exactJuzFromHizb(passedSections.size)) },
        });
      }

      return result;
    });

    const title = passed ? 'نتيجة اختبار: ناجح' : 'نتيجة اختبار: لم يجتز';
    const body = `${exam.student.fullName} — "${this.examLabel(exam)}" بدرجة ${dto.score} من 100 (${EVALUATION_LABELS[evaluation]})`;

    /**
     * Each recipient gets a link they can actually open.
     *
     * `/exams/:id` is a staff route; sending it to the guardian dropped them on
     * «لا تملك صلاحية الوصول» when they tapped the result of their own son's
     * exam. Their view of the same fact lives in the parent portal.
     */
    const recipients: { userId: string; link: string }[] = [];
    if (exam.request?.teacher?.user?.id) {
      recipients.push({ userId: exam.request.teacher.user.id, link: `/exams/${id}` });
    }
    if (exam.student.parentProfile?.userId) {
      recipients.push({
        userId: exam.student.parentProfile.userId,
        link: `/parent/children/${exam.studentId}`,
      });
    }

    const seen = new Set<string>();
    for (const recipient of recipients) {
      if (seen.has(recipient.userId)) continue;
      seen.add(recipient.userId);
      await this.notifications.notify({
        userId: recipient.userId,
        type: NotificationType.EXAM_RESULT,
        title,
        body,
        link: recipient.link,
        data: { examId: id, passed, score: dto.score },
      });
    }

    await this.activity.log({
      userId: actor.id,
      action: 'EXAM_RESULT',
      summary: `رصد نتيجة اختبار ${exam.student.fullName} في ${this.examLabel(exam)}: ${dto.score} (${EVALUATION_LABELS[evaluation]})`,
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
      // Name, student number, or the name of any hizb on the exam — an exam
      // covering four of them should be findable by any of the four.
      ...(query.search
        ? {
            OR: [
              { student: { ...scope, deletedAt: null, fullName: { contains: query.search, mode: 'insensitive' } } },
              { student: { ...scope, deletedAt: null, code: { contains: query.search, mode: 'insensitive' } } },
              { section: { name: { contains: query.search, mode: 'insensitive' } } },
              { sections: { some: { section: { name: { contains: query.search, mode: 'insensitive' } } } } },
              { examiner: { fullName: { contains: query.search, mode: 'insensitive' } } },
            ],
          }
        : {}),
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
