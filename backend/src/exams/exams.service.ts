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
import {
  HIZB_PER_JUZ,
  describeSections,
  exactJuzFromHizb,
  juzFromHizb,
} from '../common/quran';
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
      circle: {
        select: {
          id: true,
          name: true,
          code: true,
        },
      },
      parentProfile: {
        select: {
          userId: true,
        },
      },
    },
  },

  section: {
    select: {
      id: true,
      name: true,
      code: true,
      order: true,
      kind: true,
      minScore: true,
    },
  },

  sections: {
    select: {
      section: {
        select: {
          id: true,
          name: true,
          code: true,
          order: true,
          kind: true,
          minScore: true,
        },
      },
    },
    orderBy: {
      section: {
        order: 'asc',
      },
    },
  },

  teacher: {
    select: {
      id: true,
      user: {
        select: {
          id: true,
          fullName: true,
        },
      },
    },
  },

  reviewedBy: {
    select: {
      id: true,
      fullName: true,
    },
  },

  exam: {
    select: {
      id: true,
      scheduledAt: true,
      status: true,
      result: true,
      score: true,
      evaluation: true,
    },
  },
} satisfies Prisma.ExamRequestInclude;

const EXAM_INCLUDE = {
  student: {
    select: {
      id: true,
      code: true,
      fullName: true,
      memorizedParts: true,
      circle: {
        select: {
          id: true,
          name: true,
          code: true,
        },
      },
      parentProfile: {
        select: {
          userId: true,
        },
      },
    },
  },

  section: {
    select: {
      id: true,
      name: true,
      code: true,
      order: true,
      kind: true,
      minScore: true,
    },
  },

  sections: {
    select: {
      section: {
        select: {
          id: true,
          name: true,
          code: true,
          order: true,
          kind: true,
          minScore: true,
        },
      },
    },
    orderBy: {
      section: {
        order: 'asc',
      },
    },
  },

  examiner: {
    select: {
      id: true,
      fullName: true,
    },
  },

  gradedBy: {
    select: {
      id: true,
      fullName: true,
    },
  },

  request: {
    select: {
      id: true,
      teacher: {
        select: {
          user: {
            select: {
              id: true,
              fullName: true,
            },
          },
        },
      },
    },
  },
} satisfies Prisma.ExamInclude;

@Injectable()
export class ExamsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly acl: AccessControlService,
    private readonly activity: ActivityService,
    private readonly notifications: NotificationsService,
  ) {}

  // -------------------------------------------------------------------------
  // sections
  // -------------------------------------------------------------------------

  sections() {
    return this.prisma.examSection.findMany({
      where: {
        isActive: true,
      },
      orderBy: {
        order: 'asc',
      },
    });
  }

  async createSection(
    actor: AuthUser,
    dto: CreateSectionDto,
  ) {
    const clash = await this.prisma.examSection.findFirst({
      where: {
        OR: [
          { code: dto.code },
          { order: dto.order },
          { name: dto.name },
        ],
      },
    });

    if (clash) {
      throw new ConflictException(
        'يوجد مقرر بنفس الاسم أو الرمز أو الترتيب',
      );
    }

    const section = await this.prisma.examSection.create({
      data: {
        name: dto.name,
        code: dto.code,
        order: dto.order,
        kind: dto.kind ?? 'HIZB',
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

  // -------------------------------------------------------------------------
  // eligibility
  // -------------------------------------------------------------------------

  /**
   * يحدد المقررات التي يستطيع الطالب طلب اختبارها.
   *
   * لا يوجد أي شرط للتسلسل.
   *
   * الطالب يستطيع اختيار:
   * - أي حزب
   * - أي جزء
   * - عدة أحزاب
   * - عدة أجزاء
   *
   * بشرط:
   * 1. أن يكون المقرر فعالاً.
   * 2. ألا يكون الطالب قد اجتازه مسبقاً.
   * 3. ألا يكون عليه طلب اختبار قائم.
   */
  async eligibility(
    user: AuthUser,
    studentId: string,
  ) {
    await this.acl.assertStudentAccess(
      user,
      studentId,
    );

    const [
      sections,
      passed,
      openWork,
    ] = await Promise.all([
      this.prisma.examSection.findMany({
        where: {
          isActive: true,
        },
        orderBy: {
          order: 'asc',
        },
      }),

      this.prisma.exam.findMany({
        where: {
          studentId,
          status: ExamStatus.COMPLETED,
          result: ExamResult.PASSED,
        },
        select: {
          sectionId: true,
          score: true,
          gradedAt: true,
          sections: {
            select: {
              sectionId: true,
            },
          },
        },
      }),

      this.prisma.examRequest.findMany({
        where: {
          studentId,
          status: {
            in: [
              ExamRequestStatus.PENDING,
              ExamRequestStatus.SCHEDULED,
            ],
          },
        },
        select: {
          sectionId: true,
          status: true,
          sections: {
            select: {
              sectionId: true,
            },
          },
        },
      }),
    ]);

    // جميع الأحزاب/الأجزاء التي اجتازها الطالب
    const passedIds = new Set(
      passed.flatMap((p) => [
        p.sectionId,
        ...p.sections.map(
          (x) => x.sectionId,
        ),
      ]),
    );

    // جميع الأحزاب/الأجزاء الموجودة في طلبات قائمة
    const openIds = new Set(
      openWork.flatMap((o) => [
        o.sectionId,
        ...o.sections.map(
          (x) => x.sectionId,
        ),
      ]),
    );

    const progression = sections.map(
      (section) => {
        const isPassed = passedIds.has(
          section.id,
        );

        const isOpen = openIds.has(
          section.id,
        );

        let eligible = true;
        let reason: string | null = null;

        if (isPassed) {
          eligible = false;
          reason =
            'تم اجتياز هذا المقرر مسبقاً';
        } else if (isOpen) {
          eligible = false;
          reason =
            'يوجد طلب اختبار قائم لهذا المقرر';
        }

        return {
          ...section,
          isPassed,
          hasOpenRequest: isOpen,
          eligible,
          reason,

          score:
            passed.find(
              (p) =>
                p.sectionId === section.id ||
                p.sections.some(
                  (x) =>
                    x.sectionId ===
                    section.id,
                ),
            )?.score ?? null,
        };
      },
    );

    const pendingSection =
      progression.find(
        (p) => p.hasOpenRequest,
      ) ?? null;

    const hizbPassed =
      sections.filter(
        (x) => passedIds.has(x.id),
      ).length;

    // كل المقررات التي يستطيع الطالب اختيارها
    const selectableSections =
      progression
        .filter(
          (p) => p.eligible,
        )
        .map((p) => ({
          id: p.id,
          name: p.name,
          code: p.code,
          order: p.order,
          kind: p.kind,
        }));

    return {
      passedCount: passedIds.size,

      totalSections: sections.length,

      hizbPassed,

      hizbTotal: sections.length,

      juzEquivalent:
        juzFromHizb(hizbPassed),

      juzTotal:
        sections.length /
        HIZB_PER_JUZ,

      requiredPassed:
        hizbPassed,

      requiredTotal:
        sections.length,

      // لم نعد نستخدم اتجاه أو تسلسل
      direction: null,

      chains: [
        {
          direction: null,
          label:
            'جميع المقررات المتاحة للاختيار',
          sections:
            selectableSections,
        },
      ],

      nextSection:
        selectableSections[0] ??
        null,

      selectableSections,

      pendingSection:
        pendingSection
          ? {
              id:
                pendingSection.id,
              name:
                pendingSection.name,
              order:
                pendingSection.order,
            }
          : null,

      isComplete:
        hizbPassed ===
        sections.length,

      progression,
    };
  }

  // -------------------------------------------------------------------------
  // section validation
  // -------------------------------------------------------------------------

  /**
   * فحص مقرر واحد.
   *
   * لا يفحص ترتيب الحزب.
   * فقط يمنع:
   * - مقرر غير موجود.
   * - مقرر اجتازه الطالب.
   * - مقرر عليه طلب اختبار قائم.
   */
  private async assertEligible(
    studentId: string,
    sectionId: string,
  ) {
    const section =
      await this.prisma.examSection.findFirst(
        {
          where: {
            id: sectionId,
            isActive: true,
          },
        },
      );

    if (!section) {
      throw new BadRequestException(
        'المقرر المحدد غير موجود',
      );
    }

    const alreadyPassed =
      await this.prisma.exam.findFirst({
        where: {
          studentId,
          status:
            ExamStatus.COMPLETED,
          result:
            ExamResult.PASSED,
          OR: [
            { sectionId },
            {
              sections: {
                some: {
                  sectionId,
                },
              },
            },
          ],
        },
      });

    if (alreadyPassed) {
      throw new ConflictException(
        `الطالب اجتاز "${section.name}" مسبقاً`,
      );
    }

    const open =
      await this.prisma.examRequest.findFirst(
        {
          where: {
            studentId,
            status: {
              in: [
                ExamRequestStatus.PENDING,
                ExamRequestStatus.SCHEDULED,
              ],
            },
            OR: [
              { sectionId },
              {
                sections: {
                  some: {
                    sectionId,
                  },
                },
              },
            ],
          },
        },
      );

    if (open) {
      throw new ConflictException(
        'يوجد طلب اختبار قائم لهذا المقرر',
      );
    }

    return section;
  }

  // -------------------------------------------------------------------------
  // requests
  // -------------------------------------------------------------------------

  async requestExam(
    actor: AuthUser,
    dto: CreateExamRequestDto,
  ) {
    const student =
      await this.acl.assertStudentWriteAccess(
        actor,
        dto.studentId,
      );

    if (!student.circleId) {
      throw new BadRequestException(
        'الطالب غير مسجل في حلقة',
      );
    }

    if (student.status === 'SUSPENDED') {
      throw new BadRequestException(
        'لا يمكن تقديم طلب اختبار لطالب موقوف',
      );
    }

    if (student.status === 'ACTIVITY') {
      throw new BadRequestException(
        'لا يمكن تقديم طلب اختبار لطالب في برنامج النشاط',
      );
    }

    // إزالة التكرار
    const sectionIds = [
      ...new Set(dto.sectionIds),
    ];

    if (sectionIds.length === 0) {
      throw new BadRequestException(
        'يجب اختيار مقرر اختبار واحد على الأقل',
      );
    }

    const sections =
      await this.prisma.examSection.findMany({
        where: {
          id: {
            in: sectionIds,
          },
          isActive: true,
        },
        orderBy: {
          order: 'asc',
        },
      });

    if (
      sections.length !==
      sectionIds.length
    ) {
      throw new BadRequestException(
        'أحد المقررات المحددة غير موجود',
      );
    }

    /**
     * لا يوجد أي شرط تسلسلي هنا.
     *
     * يستطيع الطالب اختيار:
     *
     * حزب 5 + حزب 20 + حزب 45
     *
     * أو:
     *
     * جزء 3 + جزء 15 + جزء 27
     *
     * أو أي مجموعة أخرى.
     */
    for (const section of sections) {
      await this.assertEligible(
        dto.studentId,
        section.id,
      );
    }

    // أول مقرر حسب الترتيب يصبح primary section
    const primary = sections[0];

    const teacherId =
      await this.resolveTeacherId(
        actor,
        student.circleId,
      );

    const request =
      await this.prisma.examRequest.create(
        {
          data: {
            studentId:
              dto.studentId,

            sectionId:
              primary.id,

            teacherId,

            note: dto.note,

            sections: {
              create: sections.map(
                (section) => ({
                  sectionId:
                    section.id,
                }),
              ),
            },
          },

          include: REQUEST_INCLUDE,
        },
      );

    const label =
      this.sectionsLabel(
        sections,
      );

    await this.notifications.notifyRoles(
      [
        Role.EXAM_COMMITTEE,
        Role.ADMIN,
      ],
      {
        type:
          NotificationType.EXAM_REQUEST,

        title:
          'طلب اختبار جديد',

        body:
          `طلب اختبار الطالب ${student.fullName} في ${label}`,

        link:
          `/exams/requests/${request.id}`,
      },
    );

    await this.activity.log({
      userId: actor.id,

      action:
        'EXAM_REQUEST',

      summary:
        `طلب اختبار الطالب ${student.fullName} في ${label}`,

      entityType:
        'ExamRequest',

      entityId:
        request.id,
    });

    return request;
  }

  // -------------------------------------------------------------------------
  // labels
  // -------------------------------------------------------------------------

  private sectionsLabel(
    sections: {
      name: string;
      order: number;
    }[],
  ) {
    return `"${describeSections(
      sections,
    )}"`;
  }

  private examLabel(exam: {
    section: {
      name: string;
      order: number;
    };

    sections?: {
      section: {
        name: string;
        order: number;
      };
    }[];
  }) {
    const all =
      exam.sections?.length
        ? exam.sections.map(
            (x) => x.section,
          )
        : [exam.section];

    return describeSections(all);
  }

  private requestLabel(request: {
    section: {
      name: string;
      order: number;
    };

    sections?: {
      section: {
        name: string;
        order: number;
      };
    }[];
  }) {
    const all =
      request.sections?.length
        ? request.sections.map(
            (x) => x.section,
          )
        : [request.section];

    return describeSections(all);
  }

  // -------------------------------------------------------------------------
  // request reads
  // -------------------------------------------------------------------------

  async findRequests(
    user: AuthUser,
    query: QueryExamRequestsDto,
  ) {
    const scope =
      await this.acl.studentScope(user);

    const where: Prisma.ExamRequestWhereInput =
      {
        student: {
          ...scope,
          deletedAt: null,
        },

        ...(query.status
          ? {
              status:
                query.status,
            }
          : {}),

        ...(query.studentId
          ? {
              studentId:
                query.studentId,
            }
          : {}),

        ...(query.sectionId
          ? {
              sectionId:
                query.sectionId,
            }
          : {}),

        ...((query as {
          kind?: string;
        }).kind
          ? {
              section: {
                kind: (
                  query as {
                    kind?: any;
                  }
                ).kind,
              },
            }
          : {}),

        ...(query.search
          ? {
              student: {
                ...scope,
                deletedAt: null,
                fullName: {
                  contains:
                    query.search,
                  mode: 'insensitive',
                },
              },
            }
          : {}),
      };

    const [
      data,
      total,
    ] =
      await this.prisma.$transaction([
        this.prisma.examRequest.findMany(
          {
            where,

            include:
              REQUEST_INCLUDE,

            orderBy: {
              createdAt:
                query.sortOrder ||
                'asc',
            },

            skip: query.skip,

            take: query.take,
          },
        ),

        this.prisma.examRequest.count(
          {
            where,
          },
        ),
      ]);

    return paginate(
      data,
      total,
      query.page,
      query.limit,
    );
  }

  async findRequest(
    user: AuthUser,
    id: string,
  ) {
    const request =
      await this.prisma.examRequest.findUnique(
        {
          where: {
            id,
          },
          include:
            REQUEST_INCLUDE,
        },
      );

    if (!request) {
      throw new NotFoundException(
        'طلب الاختبار غير موجود',
      );
    }

    await this.acl.assertStudentAccess(
      user,
      request.studentId,
    );

    return request;
  }

  // -------------------------------------------------------------------------
  // reject / cancel
  // -------------------------------------------------------------------------

  async rejectRequest(
    actor: AuthUser,
    id: string,
    dto: ReviewExamRequestDto,
  ) {
    const request =
      await this.prisma.examRequest.findUnique(
        {
          where: {
            id,
          },
          include:
            REQUEST_INCLUDE,
        },
      );

    if (!request) {
      throw new NotFoundException(
        'طلب الاختبار غير موجود',
      );
    }

    if (
      request.status !==
      ExamRequestStatus.PENDING
    ) {
      throw new BadRequestException(
        'تم البت في هذا الطلب مسبقاً',
      );
    }

    const updated =
      await this.prisma.examRequest.update(
        {
          where: {
            id,
          },

          data: {
            status:
              ExamRequestStatus.REJECTED,

            reviewedById:
              actor.id,

            reviewedAt:
              new Date(),

            reviewNote:
              dto.reviewNote,
          },

          include:
            REQUEST_INCLUDE,
        },
      );

    await this.notifications.notify({
      userId:
        request.teacher.user.id,

      type:
        NotificationType.EXAM_REQUEST,

      title:
        'تم رفض طلب الاختبار',

      body:
        `طلب اختبار ${request.student.fullName} في "${this.requestLabel(request)}"${
          dto.reviewNote
            ? ` — ${dto.reviewNote}`
            : ''
        }`,

      link:
        `/exams/requests/${id}`,
    });

    return updated;
  }

  async cancelRequest(
    actor: AuthUser,
    id: string,
  ) {
    const request =
      await this.prisma.examRequest.findUnique(
        {
          where: {
            id,
          },

          include: {
            teacher: true,
          },
        },
      );

    if (!request) {
      throw new NotFoundException(
        'طلب الاختبار غير موجود',
      );
    }

    if (
      request.status !==
      ExamRequestStatus.PENDING
    ) {
      throw new BadRequestException(
        'لا يمكن إلغاء طلب تمت جدولته أو البت فيه',
      );
    }

    if (
      actor.role !== Role.ADMIN &&
      actor.role !==
        Role.EXAM_COMMITTEE &&
      actor.teacherId !==
        request.teacherId
    ) {
      throw new ForbiddenException(
        'يمكن إلغاء الطلب من قبل المعلم صاحب الطلب أو اللجنة',
      );
    }

    return this.prisma.examRequest.update(
      {
        where: {
          id,
        },

        data: {
          status:
            ExamRequestStatus.CANCELLED,

          reviewedAt:
            new Date(),

          reviewedById:
            actor.id,
        },

        include:
          REQUEST_INCLUDE,
      },
    );
  }

  // -------------------------------------------------------------------------
  // scheduling
  // -------------------------------------------------------------------------

  async scheduleExam(
    actor: AuthUser,
    requestId: string,
    dto: ScheduleExamDto,
  ) {
    const request =
      await this.prisma.examRequest.findUnique(
        {
          where: {
            id: requestId,
          },

          include:
            REQUEST_INCLUDE,
        },
      );

    if (!request) {
      throw new NotFoundException(
        'طلب الاختبار غير موجود',
      );
    }

    if (
      request.status !==
      ExamRequestStatus.PENDING
    ) {
      throw new BadRequestException(
        'هذا الطلب ليس في قائمة الانتظار',
      );
    }

    const scheduledAt =
      new Date(dto.scheduledAt);

    if (
      Number.isNaN(
        scheduledAt.getTime(),
      )
    ) {
      throw new BadRequestException(
        'موعد الاختبار غير صالح',
      );
    }

    if (
      scheduledAt.getTime() <
      Date.now() -
        60 * 60 * 1000
    ) {
      throw new BadRequestException(
        'لا يمكن جدولة اختبار في الماضي',
      );
    }

    if (dto.examinerId) {
      await this.assertExaminer(
        dto.examinerId,
      );
    }

    const exam =
      await this.prisma.$transaction(
        async (tx) => {
          const created =
            await tx.exam.create({
              data: {
                requestId,

                studentId:
                  request.studentId,

                sectionId:
                  request.sectionId,

                examinerId:
                  dto.examinerId ||
                  null,

                scheduledAt,

                location:
                  dto.location,

                notes:
                  dto.notes,

                sections: {
                  create: (
                    request.sections
                      .length
                      ? request.sections.map(
                          (s) =>
                            s.section.id,
                        )
                      : [
                          request.sectionId,
                        ]
                  ).map(
                    (sectionId) => ({
                      sectionId,
                    }),
                  ),
                },
              },

              include:
                EXAM_INCLUDE,
            });

          await tx.examRequest.update(
            {
              where: {
                id: requestId,
              },

              data: {
                status:
                  ExamRequestStatus.SCHEDULED,

                reviewedById:
                  actor.id,

                reviewedAt:
                  new Date(),
              },
            },
          );

          return created;
        },
      );

    const when =
      scheduledAt.toLocaleString(
        'ar-EG',
        {
          dateStyle: 'full',
          timeStyle: 'short',
        },
      );

    await this.notifications.notify({
      userId:
        request.teacher.user.id,

      type:
        NotificationType.EXAM_SCHEDULED,

      title:
        'تم تحديد موعد اختبار',

      body:
        `اختبار ${request.student.fullName} في "${this.requestLabel(request)}" بتاريخ ${when}`,

      link:
        `/exams/${exam.id}`,
    });

    if (
      request.student.parentProfile
        ?.userId
    ) {
      await this.notifications.notify({
        userId:
          request.student
            .parentProfile
            .userId,

        type:
          NotificationType.EXAM_SCHEDULED,

        title:
          'موعد اختبار قادم',

        body:
          `اختبار ${request.student.fullName} في "${this.requestLabel(request)}" بتاريخ ${when}`,

        link:
          `/parent/children/${request.studentId}`,
      });
    }

    if (dto.examinerId) {
      await this.notifications.notify({
        userId:
          dto.examinerId,

        type:
          NotificationType.EXAM_SCHEDULED,

        title:
          'تم إسنادك كممتحن',

        body:
          `اختبار ${request.student.fullName} في "${this.requestLabel(request)}" بتاريخ ${when}`,

        link:
          `/exams/${exam.id}`,
      });
    }

    await this.activity.log({
      userId: actor.id,

      action:
        'EXAM_SCHEDULE',

      summary:
        `جدولة اختبار ${request.student.fullName} في ${this.requestLabel(request)}`,

      entityType:
        'Exam',

      entityId:
        exam.id,
    });

    return exam;
  }

  // -------------------------------------------------------------------------
  // update exam
  // -------------------------------------------------------------------------

  async updateExam(
    actor: AuthUser,
    id: string,
    dto: UpdateExamDto,
  ) {
    const exam =
      await this.prisma.exam.findUnique(
        {
          where: {
            id,
          },
          include:
            EXAM_INCLUDE,
        },
      );

    if (!exam) {
      throw new NotFoundException(
        'الاختبار غير موجود',
      );
    }

    if (
      exam.status ===
      ExamStatus.COMPLETED
    ) {
      throw new BadRequestException(
        'لا يمكن تعديل اختبار مكتمل',
      );
    }

    if (dto.examinerId) {
      await this.assertExaminer(
        dto.examinerId,
      );
    }

    const updated =
      await this.prisma.exam.update({
        where: {
          id,
        },

        data: {
          scheduledAt:
            dto.scheduledAt
              ? new Date(
                  dto.scheduledAt,
                )
              : undefined,

          examinerId:
            dto.examinerId,

          location:
            dto.location,

          status:
            dto.status,

          notes:
            dto.notes,
        },

        include:
          EXAM_INCLUDE,
      });

    if (
      dto.status ===
        ExamStatus.CANCELLED &&
      exam.requestId
    ) {
      await this.prisma.examRequest.update(
        {
          where: {
            id: exam.requestId,
          },

          data: {
            status:
              ExamRequestStatus.CANCELLED,
          },
        },
      );
    }

    return updated;
  }

  // -------------------------------------------------------------------------
  // results
  // -------------------------------------------------------------------------

  async recordResult(
    actor: AuthUser,
    id: string,
    dto: RecordResultDto,
  ) {
    const exam =
      await this.prisma.exam.findUnique(
        {
          where: {
            id,
          },
          include:
            EXAM_INCLUDE,
        },
      );

    if (!exam) {
      throw new NotFoundException(
        'الاختبار غير موجود',
      );
    }

    if (
      exam.status ===
      ExamStatus.COMPLETED
    ) {
      throw new BadRequestException(
        'تم رصد نتيجة هذا الاختبار مسبقاً',
      );
    }

    if (
      exam.status ===
      ExamStatus.CANCELLED
    ) {
      throw new BadRequestException(
        'هذا الاختبار ملغى',
      );
    }

    const passed =
      dto.score >=
      exam.section.minScore;

    const evaluation =
      evaluationFromScore(
        dto.score,
      );

    const updated =
      await this.prisma.$transaction(
        async (tx) => {
          const result =
            await tx.exam.update({
              where: {
                id,
              },

              data: {
                score:
                  dto.score,

                evaluation,

                mistakes:
                  dto.mistakes ??
                  null,

                result: passed
                  ? ExamResult.PASSED
                  : ExamResult.FAILED,

                status:
                  ExamStatus.COMPLETED,

                notes:
                  dto.notes,

                gradedById:
                  actor.id,

                gradedAt:
                  new Date(),
              },

              include:
                EXAM_INCLUDE,
            });

          if (exam.requestId) {
            await tx.examRequest.update(
              {
                where: {
                  id: exam.requestId,
                },

                data: {
                  status:
                    ExamRequestStatus.COMPLETED,
                },
              },
            );
          }

          if (passed) {
            const passedExams =
              await tx.exam.findMany(
                {
                  where: {
                    studentId:
                      exam.studentId,

                    status:
                      ExamStatus.COMPLETED,

                    result:
                      ExamResult.PASSED,
                  },

                  select: {
                    sectionId: true,

                    sections: {
                      select: {
                        sectionId: true,
                      },
                    },
                  },
                },
              );

            const active =
              await tx.examSection.findMany(
                {
                  where: {
                    isActive: true,
                  },

                  select: {
                    id: true,
                  },
                },
              );

            const activeIds =
              new Set(
                active.map(
                  (x) => x.id,
                ),
              );

            const passedSections =
              new Set(
                passedExams
                  .flatMap(
                    (e) => [
                      e.sectionId,
                      ...e.sections.map(
                        (x) =>
                          x.sectionId,
                      ),
                    ],
                  )
                  .filter((id) =>
                    activeIds.has(id),
                  ),
              );

            await tx.student.update({
              where: {
                id: exam.studentId,
              },

              data: {
                memorizedParts:
                  Math.min(
                    30,
                    exactJuzFromHizb(
                      passedSections.size,
                    ),
                  ),
              },
            });
          }

          return result;
        },
      );

    const title = passed
      ? 'نتيجة اختبار: ناجح'
      : 'نتيجة اختبار: لم يجتز';

    const body =
      `${exam.student.fullName} — "${this.examLabel(exam)}" بدرجة ${dto.score} من 100 (${EVALUATION_LABELS[evaluation]})`;

    const recipients: {
      userId: string;
      link: string;
    }[] = [];

    if (
      exam.request?.teacher?.user?.id
    ) {
      recipients.push({
        userId:
          exam.request.teacher.user.id,

        link:
          `/exams/${id}`,
      });
    }

    if (
      exam.student.parentProfile
        ?.userId
    ) {
      recipients.push({
        userId:
          exam.student.parentProfile
            .userId,

        link:
          `/parent/children/${exam.studentId}`,
      });
    }

    const seen =
      new Set<string>();

    for (
      const recipient of recipients
    ) {
      if (
        seen.has(
          recipient.userId,
        )
      ) {
        continue;
      }

      seen.add(
        recipient.userId,
      );

      await this.notifications.notify({
        userId:
          recipient.userId,

        type:
          NotificationType.EXAM_RESULT,

        title,

        body,

        link:
          recipient.link,

        data: {
          examId: id,
          passed,
          score: dto.score,
        },
      });
    }

    await this.activity.log({
      userId: actor.id,

      action:
        'EXAM_RESULT',

      summary:
        `رصد نتيجة اختبار ${exam.student.fullName} في ${this.examLabel(exam)}: ${dto.score} (${EVALUATION_LABELS[evaluation]})`,

      entityType:
        'Exam',

      entityId:
        id,
    });

    return updated;
  }

  // -------------------------------------------------------------------------
  // absent
  // -------------------------------------------------------------------------

  async markAbsent(
    actor: AuthUser,
    id: string,
  ) {
    const exam =
      await this.prisma.exam.findUnique(
        {
          where: {
            id,
          },
        },
      );

    if (!exam) {
      throw new NotFoundException(
        'الاختبار غير موجود',
      );
    }

    if (
      exam.status !==
      ExamStatus.SCHEDULED
    ) {
      throw new BadRequestException(
        'يمكن تسجيل الغياب للاختبارات المجدولة فقط',
      );
    }

    const updated =
      await this.prisma.exam.update({
        where: {
          id,
        },

        data: {
          status:
            ExamStatus.ABSENT,

          gradedById:
            actor.id,

          gradedAt:
            new Date(),
        },

        include:
          EXAM_INCLUDE,
      });

    if (exam.requestId) {
      await this.prisma.examRequest.update(
        {
          where: {
            id: exam.requestId,
          },

          data: {
            status:
              ExamRequestStatus.COMPLETED,
          },
        },
      );
    }

    return updated;
  }

  // -------------------------------------------------------------------------
  // reads
  // -------------------------------------------------------------------------

  async findExams(
    user: AuthUser,
    query: QueryExamsDto,
  ) {
    const scope =
      await this.acl.studentScope(user);

    const where: Prisma.ExamWhereInput =
      {
        student: {
          ...scope,
          deletedAt: null,
        },

        ...(query.search
          ? {
              OR: [
                {
                  student: {
                    ...scope,
                    deletedAt: null,
                    fullName: {
                      contains:
                        query.search,
                      mode: 'insensitive',
                    },
                  },
                },

                {
                  student: {
                    ...scope,
                    deletedAt: null,
                    code: {
                      contains:
                        query.search,
                      mode: 'insensitive',
                    },
                  },
                },

                {
                  section: {
                    name: {
                      contains:
                        query.search,
                      mode: 'insensitive',
                    },
                  },
                },

                {
                  sections: {
                    some: {
                      section: {
                        name: {
                          contains:
                            query.search,
                          mode: 'insensitive',
                        },
                      },
                    },
                  },
                },

                {
                  examiner: {
                    fullName: {
                      contains:
                        query.search,
                      mode: 'insensitive',
                    },
                  },
                },
              ],
            }
          : {}),

        ...(query.status
          ? {
              status:
                query.status,
            }
          : {}),

        ...(query.studentId
          ? {
              studentId:
                query.studentId,
            }
          : {}),

        ...(query.sectionId
          ? {
              sectionId:
                query.sectionId,
            }
          : {}),

        ...(query.examinerId
          ? {
              examinerId:
                query.examinerId,
            }
          }
          : {}),

        ...(query.from ||
        query.to
          ? {
              scheduledAt: {
                ...(query.from
                  ? {
                      gte: new Date(
                        query.from,
                      ),
                    }
                  : {}),

                ...(query.to
                  ? {
                      lte: new Date(
                        query.to,
                      ),
                    }
                  : {}),
              },
            }
          : {}),
      };

    const [
      data,
      total,
    ] =
      await this.prisma.$transaction([
        this.prisma.exam.findMany({
          where,

          include:
            EXAM_INCLUDE,

          orderBy: {
            scheduledAt:
              query.sortOrder ||
              'desc',
          },

          skip: query.skip,

          take: query.take,
        }),

        this.prisma.exam.count({
          where,
        }),
      ]);

    return paginate(
      data,
      total,
      query.page,
      query.limit,
    );
  }

  async findExam(
    user: AuthUser,
    id: string,
  ) {
    const exam =
      await this.prisma.exam.findUnique(
        {
          where: {
            id,
          },

          include:
            EXAM_INCLUDE,
        },
      );

    if (!exam) {
      throw new NotFoundException(
        'الاختبار غير موجود',
      );
    }

    await this.acl.assertStudentAccess(
      user,
      exam.studentId,
    );

    return exam;
  }

  async upcoming(
    user: AuthUser,
    days = 30,
  ) {
    const scope =
      await this.acl.studentScope(user);

    const until = new Date();

    until.setDate(
      until.getDate() + days,
    );

    return this.prisma.exam.findMany({
      where: {
        student: {
          ...scope,
          deletedAt: null,
        },

        status:
          ExamStatus.SCHEDULED,

        scheduledAt: {
          gte: new Date(),
          lte: until,
        },
      },

      include:
        EXAM_INCLUDE,

      orderBy: {
        scheduledAt: 'asc',
      },

      take: 50,
    });
  }

  async stats(user: AuthUser) {
    const scope =
      await this.acl.studentScope(user);

    const studentFilter = {
      student: {
        ...scope,
        deletedAt: null,
      },
    };

    const [
      pendingRequests,
      scheduled,
      completed,
      passed,
      failed,
    ] =
      await Promise.all([
        this.prisma.examRequest.count(
          {
            where: {
              ...studentFilter,
              status:
                ExamRequestStatus.PENDING,
            },
          },
        ),

        this.prisma.exam.count({
          where: {
            ...studentFilter,
            status:
              ExamStatus.SCHEDULED,
          },
        }),

        this.prisma.exam.count({
          where: {
            ...studentFilter,
            status:
              ExamStatus.COMPLETED,
          },
        }),

        this.prisma.exam.count({
          where: {
            ...studentFilter,
            status:
              ExamStatus.COMPLETED,
            result:
              ExamResult.PASSED,
          },
        }),

        this.prisma.exam.count({
          where: {
            ...studentFilter,
            status:
              ExamStatus.COMPLETED,
            result:
              ExamResult.FAILED,
          },
        }),
      ]);

    return {
      pendingRequests,

      scheduled,

      completed,

      passed,

      failed,

      passRate: completed
        ? Math.round(
            (passed /
              completed) *
              100,
          )
        : 0,
    };
  }

  // -------------------------------------------------------------------------
  // examiners
  // -------------------------------------------------------------------------

  examiners() {
    return this.prisma.user.findMany({
      where: {
        role: {
          in: [
            Role.EXAM_COMMITTEE,
            Role.ADMIN,
          ],
        },

        isActive: true,

        deletedAt: null,
      },

      select: {
        id: true,
        fullName: true,
        role: true,
      },

      orderBy: {
        fullName: 'asc',
      },
    });
  }

  // -------------------------------------------------------------------------
  // helpers
  // -------------------------------------------------------------------------

  private async assertExaminer(
    userId: string,
  ) {
    const examiner =
      await this.prisma.user.findFirst({
        where: {
          id: userId,

          deletedAt: null,

          isActive: true,

          role: {
            in: [
              Role.EXAM_COMMITTEE,
              Role.ADMIN,
            ],
          },
        },
      });

    if (!examiner) {
      throw new BadRequestException(
        'الممتحن المحدد غير صالح',
      );
    }
  }

  private async resolveTeacherId(
    actor: AuthUser,
    circleId: string,
  ) {
    if (
      actor.role === Role.TEACHER &&
      actor.teacherId
    ) {
      return actor.teacherId;
    }

    const primary =
      await this.prisma.circleTeacher.findFirst(
        {
          where: {
            circleId,

            role: 'PRIMARY',

            endedAt: null,
          },

          select: {
            teacherId: true,
          },
        },
      );

    if (primary) {
      return primary.teacherId;
    }

    const any =
      await this.prisma.circleTeacher.findFirst(
        {
          where: {
            circleId,

            endedAt: null,
          },

          select: {
            teacherId: true,
          },
        },
      );

    if (!any) {
      throw new BadRequestException(
        'لا يوجد معلم مسند لهذه الحلقة',
      );
    }

    return any.teacherId;
  }
}
