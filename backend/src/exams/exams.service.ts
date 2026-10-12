import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  Logger,
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
  UpdateExamMilestoneDto,
} from './dto/exam.dto';

// ============================================================================
// أنواع مساعدة
// ============================================================================

interface SectionWithStatus extends Omit<Prisma.ExamSectionGetPayload<{}>, 'createdAt' | 'updatedAt'> {
  isPassed: boolean;
  hasOpenRequest: boolean;
  eligible: boolean;
  reason: string | null;
  score: number | null;
}

interface EligibilityResult {
  passedCount: number;
  totalSections: number;
  hizbPassed: number;
  hizbTotal: number;
  juzEquivalent: number;
  juzTotal: number;
  requiredPassed: number;
  requiredTotal: number;
  direction: null;
  chains: Array<{
    direction: null;
    label: string;
    sections: Array<{
      id: string;
      name: string;
      code: string;
      order: number;
      kind: string;
    }>;
  }>;
  nextSection: { id: string; name: string; code: string; order: number; kind: string } | null;
  selectableSections: Array<{
    id: string;
    name: string;
    code: string;
    order: number;
    kind: string;
  }>;
  pendingSection: { id: string; name: string; order: number } | null;
  isComplete: boolean;
  progression: SectionWithStatus[];
}

// ============================================================================
// تضمينات Prisma
// ============================================================================

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

// ============================================================================
// الخدمة الرئيسية
// ============================================================================

@Injectable()
export class ExamsService {
  private readonly logger = new Logger(ExamsService.name);
  private sectionsCache: any[] | null = null;
  private sectionsCacheTime: number = 0;
  private readonly CACHE_TTL = 60000; // 1 دقيقة

  constructor(
    private readonly prisma: PrismaService,
    private readonly acl: AccessControlService,
    private readonly activity: ActivityService,
    private readonly notifications: NotificationsService,
  ) {}

  // ==========================================================================
  // مساعدات عامة
  // ==========================================================================

  private parseDate(dateStr: string): Date {
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) {
      throw new BadRequestException('تاريخ غير صالح');
    }
    return date;
  }

  private formatDateArabic(date: Date): string {
    return date.toLocaleString('ar-EG', {
      dateStyle: 'full',
      timeStyle: 'short',
    });
  }

  private getDuplicateFields(existing: any, dto: CreateSectionDto): string[] {
    const fields = [];
    if (existing.name === dto.name) fields.push('الاسم');
    if (existing.code === dto.code) fields.push('الرمز');
    if (existing.order === dto.order) fields.push('الترتيب');
    return fields;
  }

  // ==========================================================================
  // Cache للمقررات
  // ==========================================================================

  private async getCachedSections() {
    const now = Date.now();
    if (this.sectionsCache && now - this.sectionsCacheTime < this.CACHE_TTL) {
      return this.sectionsCache;
    }

    this.sectionsCache = await this.prisma.examSection.findMany({
      where: { isActive: true },
      orderBy: { order: 'asc' },
    });
    this.sectionsCacheTime = now;
    return this.sectionsCache;
  }

  private clearCache() {
    this.sectionsCache = null;
    this.sectionsCacheTime = 0;
  }

  // ==========================================================================
  // المقررات (Sections)
  // ==========================================================================

  async sections() {
    return this.getCachedSections();
  }

  async createSection(actor: AuthUser, dto: CreateSectionDto) {
    const existing = await this.prisma.examSection.findFirst({
      where: {
        OR: [{ code: dto.code }, { order: dto.order }, { name: dto.name }],
      },
      select: { id: true, name: true, code: true, order: true },
    });

    if (existing) {
      const duplicateFields = this.getDuplicateFields(existing, dto);
      throw new ConflictException(`يوجد تعارض في: ${duplicateFields.join('، ')}`);
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

    this.clearCache();

    await this.activity.log({
      userId: actor.id,
      action: 'EXAM_SECTION_CREATE',
      summary: `إضافة مقرر اختبار: ${section.name}`,
      entityType: 'ExamSection',
      entityId: section.id,
    });

    return section;
  }

  // ==========================================================================
  // أهلية الطالب للاختبار - المكان الرئيسي للتعديل
  // ==========================================================================

  /**
   * يحدد المقررات التي يستطيع الطالب طلب اختبارها.
   * يتحقق من التسلسل الإلزامي للأحزاب والأجزاء.
   * المقرر متاح فقط بعد اجتياز جميع المقررات الإلزامية السابقة، وبشرط:
   * 1. أن يكون المقرر فعالاً.
   * 2. ألا يكون الطالب قد اجتازه مسبقاً.
   * 3. ألا يكون عليه طلب اختبار قائم.
   */
  async milestoneRecords(user: AuthUser, studentId: string) {
    await this.acl.assertStudentAccess(user, studentId);
    return this.prisma.examMilestoneRecord.findMany({
      where: { studentId },
      include: { section: { select: { id: true, name: true, code: true, order: true, kind: true, minScore: true } } },
      orderBy: { section: { order: 'asc' } },
    });
  }

  async updateMilestoneRecord(actor: AuthUser, studentId: string, sectionId: string, dto: UpdateExamMilestoneDto) {
    if (actor.role !== Role.ADMIN) {
      throw new ForbiddenException('تعديل السجل اليدوي للمقررات متاح للإدارة فقط');
    }
    const student = await this.prisma.student.findFirst({ where: { id: studentId, deletedAt: null }, select: { id: true } });
    if (!student) throw new NotFoundException('الطالب غير موجود');
    const section = await this.prisma.examSection.findFirst({ where: { id: sectionId, isActive: true } });
    if (!section) throw new NotFoundException('مقرر الاختبار غير موجود');

    // A manual "completed" milestone must be reflected in the official exam
    // history as well as the progression/profile aggregates.
    const completedScore = dto.status === 'COMPLETED' ? (dto.score ?? section.minScore) : null;
    const completedResult = completedScore === null
      ? null
      : completedScore >= section.minScore ? ExamResult.PASSED : ExamResult.FAILED;
    const examDate = dto.examDate ? this.parseDate(dto.examDate) : new Date();

    const saved = await this.prisma.$transaction(async (tx) => {
      const milestone = await tx.examMilestoneRecord.upsert({
        where: { studentId_sectionId: { studentId, sectionId } },
        create: {
          studentId, sectionId, status: dto.status, result: completedResult, score: completedScore,
          requestedAt: dto.requestedAt ? this.parseDate(dto.requestedAt) : null,
          examDate: dto.examDate ? this.parseDate(dto.examDate) : null,
          examinerName: dto.examinerName ?? null, note: dto.note ?? null, updatedById: actor.id,
        },
        update: {
          status: dto.status, result: completedResult, score: completedScore,
          requestedAt: dto.requestedAt ? this.parseDate(dto.requestedAt) : null,
          examDate: dto.examDate ? this.parseDate(dto.examDate) : null,
          examinerName: dto.examinerName ?? null, note: dto.note ?? null, updatedById: actor.id,
        },
        include: { section: true },
      });

      if (dto.status === 'COMPLETED' && completedScore !== null && completedResult !== null) {
        const existingManualExam = await tx.exam.findFirst({
          where: { studentId, sectionId, requestId: null },
          orderBy: { scheduledAt: 'desc' },
        });
        const examData = {
          scheduledAt: examDate,
          status: ExamStatus.COMPLETED,
          score: completedScore,
          evaluation: evaluationFromScore(completedScore),
          result: completedResult,
          notes: dto.note ?? null,
          gradedById: actor.id,
          gradedAt: new Date(),
        };
        if (existingManualExam) {
          await tx.exam.update({ where: { id: existingManualExam.id }, data: examData });
        } else {
          await tx.exam.create({
            data: { studentId, sectionId, ...examData },
          });
        }
      }

      await this.updateStudentMemorization(tx, studentId);
      return milestone;
    });

    this.clearCache();
    await this.activity.log({
      userId: actor.id, action: 'EXAM_MILESTONE_OVERRIDE',
      summary: `تعديل سجل اختبار ${saved.section.name} للطالب ${studentId}: ${dto.status}`,
      entityType: 'ExamMilestoneRecord', entityId: saved.id,
    });
    return saved;
  }

  async eligibility(user: AuthUser, studentId: string): Promise<EligibilityResult> {
    await this.acl.assertStudentAccess(user, studentId);

    // ✅ تشخيص المشكلة - سجل البيانات
    this.logger.log(`🔍 جاري التحقق من أهلية الطالب: ${studentId}`);

    const [sections, passed, openWork] = await Promise.all([
      this.prisma.examSection.findMany({
        where: { isActive: true },
        orderBy: { order: 'asc' },
        select: {
          id: true,
          name: true,
          code: true,
          order: true,
          kind: true,
          isRequired: true,
          minScore: true,
          pagesCount: true,
          description: true,
          isActive: true,
        },
      }),
      
      // ✅ تأكد من أن الطالب قد اجتاز الاختبار بالفعل (مكتمل وناجح)
      this.prisma.exam.findMany({
        where: {
          studentId,
          status: ExamStatus.COMPLETED,
          result: ExamResult.PASSED,
          // ✅ تأكد من وجود درجة
          score: {
            not: null,
          },
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
      
      // ✅ الطلبات القائمة فقط (ليست مكتملة)
      this.prisma.examRequest.findMany({
        where: {
          studentId,
          status: {
            in: [ExamRequestStatus.PENDING, ExamRequestStatus.SCHEDULED],
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

    // ✅ تشخيص المشكلة - سجل النتائج
    this.logger.log(`📊 عدد المقررات الكلي: ${sections.length}`);
    this.logger.log(`📊 عدد الاختبارات المجتازة: ${passed.length}`);
    this.logger.log(`📊 عدد الطلبات المفتوحة: ${openWork.length}`);

    // ✅ تأكد من أن passedIds تحتوي على المعرفات الصحيحة فقط
    const manualRecords = await this.prisma.examMilestoneRecord.findMany({
      where: { studentId },
      select: { sectionId: true, status: true, result: true, score: true },
    });
    const manualOpenIds = new Set(manualRecords.filter((record) => record.status === 'REQUESTED' || record.status === 'SCHEDULED').map((record) => record.sectionId));

    const passedIds = new Set(
      passed.flatMap((p) => {
        const ids = [p.sectionId];
        if (p.sections && p.sections.length > 0) {
          ids.push(...p.sections.map((x) => x.sectionId));
        }
        return ids;
      }),
    );
    for (const record of manualRecords) {
      if (record.status === 'COMPLETED' && record.result !== ExamResult.FAILED) {
        // A manually completed milestone counts as passed, even if it has no
        // linked Exam row (the admin's manual status is the source of truth).
        passedIds.add(record.sectionId);
      } else if (record.status === 'COMPLETED' && record.result === ExamResult.FAILED) {
        // Only an explicit recorded failure overrides an actual exam pass.
        // NOT_REQUESTED / REQUESTED / SCHEDULED records must not erase a pass
        // already recorded by the exam workflow.
        passedIds.delete(record.sectionId);
      }
    }

    // ✅ تأكد من أن openIds تحتوي على المعرفات الصحيحة فقط
    const openIds = new Set(
      openWork.flatMap((o) => {
        const ids = [o.sectionId];
        if (o.sections && o.sections.length > 0) {
          ids.push(...o.sections.map((x) => x.sectionId));
        }
        return ids;
      }),
    );
    manualOpenIds.forEach((id) => openIds.add(id));

    // ✅ تشخيص المشكلة - سجل المعرفات
    this.logger.log(`🧪 المعرفات المجتازة: ${Array.from(passedIds).join(', ') || 'لا يوجد'}`);
    this.logger.log(`🧪 المعرفات المفتوحة: ${Array.from(openIds).join(', ') || 'لا يوجد'}`);

    // ✅ إذا كان هناك مقررات مجتازة ولكن الطالب لم يقدم أي اختبار، هذا يعني وجود خطأ
    if (passedIds.size > 0 && passed.length === 0) {
      this.logger.warn(`⚠️ تحذير: يوجد ${passedIds.size} مقرر مجتاز ولكن لا يوجد اختبارات للطالب ${studentId}`);
    }

    const progression = sections.map((section) => {
      const isPassed = passedIds.has(section.id);
      const isOpen = openIds.has(section.id);

      const previousRequired = sections.filter((candidate) =>
        candidate.isRequired && candidate.order < section.order,
      );
      const sequenceUnlocked = previousRequired.every((candidate) => passedIds.has(candidate.id));
      let eligible = sequenceUnlocked && !isPassed && !isOpen;
      let reason: string | null = null;

      if (isPassed) {
        reason = 'تم اجتياز هذا المقرر مسبقاً';
      } else if (isOpen) {
        reason = 'يوجد طلب اختبار قائم لهذا المقرر';
      } else if (!sequenceUnlocked) {
        reason = 'هذا المقرر مقفل حتى اجتياز المقررات السابقة في التسلسل';
      }

      return {
        ...section,
        isPassed,
        hasOpenRequest: isOpen,
        eligible,
        reason,
        score:
          manualRecords.find((record) => record.sectionId === section.id)?.score ??
          passed.find(
            (p) =>
              p.sectionId === section.id ||
              (p.sections && p.sections.some((x) => x.sectionId === section.id)),
          )?.score ?? null,
      };
    });

    const pendingSection = progression.find((p) => p.hasOpenRequest) ?? null;

    const hizbSections = sections.filter((section) => section.kind === 'HIZB');
    const juzSections = sections.filter((section) => section.kind === 'JUZ');
    const hizbPassed = hizbSections.filter((section) => passedIds.has(section.id)).length;

    // كل المقررات التي يستطيع الطالب اختيارها
    const selectableSections = progression
      .filter((p) => p.eligible)
      .map((p) => ({
        id: p.id,
        name: p.name,
        code: p.code,
        order: p.order,
        kind: p.kind,
      }));

    // ✅ تشخيص المشكلة - سجل المقررات القابلة للاختيار
    this.logger.log(`✅ المقررات المتاحة للاختيار: ${selectableSections.length}`);

    return {
      passedCount: passedIds.size,
      totalSections: sections.length,
      hizbPassed,
      hizbTotal: hizbSections.length,
      juzEquivalent: juzFromHizb(hizbPassed),
      juzTotal: juzSections.length,
      requiredPassed: passedIds.size,
      requiredTotal: sections.length,
      direction: null,
      chains: [
        {
          direction: null,
          label: 'جميع المقررات المتاحة للاختيار',
          sections: selectableSections,
        },
      ],
      nextSection: selectableSections[0] ?? null,
      selectableSections,
      pendingSection: pendingSection
        ? {
            id: pendingSection.id,
            name: pendingSection.name,
            order: pendingSection.order,
          }
        : null,
      isComplete: passedIds.size === sections.length,
      progression,
    };
  }

  // ==========================================================================
  // التحقق من أهلية مقرر واحد
  // ==========================================================================

  /**
   * فحص مقرر واحد.
   * يفرض التسلسل على أول مقرر في الطلب الجماعي.
   * ويمنع:
   * - مقرر غير موجود.
   * - مقرر اجتازه الطالب.
   * - مقرر عليه طلب اختبار قائم.
   */
  private async assertEligible(studentId: string, sectionId: string, enforceSequence = true) {
    const section = await this.prisma.examSection.findFirst({
      where: {
        id: sectionId,
        isActive: true,
      },
    });

    if (!section) {
      throw new BadRequestException('المقرر المحدد غير موجود');
    }

    // ✅ تأكد من أن الطالب اجتاز الاختبار بنجاح مع درجة
    const alreadyPassed = await this.prisma.exam.findFirst({
      where: {
        studentId,
        status: ExamStatus.COMPLETED,
        result: ExamResult.PASSED,
        // ✅ تأكد من وجود درجة وأنها أعلى من الحد الأدنى
        score: {
          gte: section.minScore,
          not: null,
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
    });

    const manualRecord = await this.prisma.examMilestoneRecord.findUnique({
      where: { studentId_sectionId: { studentId, sectionId } },
      select: { status: true, result: true },
    });
    // A stale REQUESTED/SCHEDULED/NOT_REQUESTED manual row must not erase a
    // real passing exam. Only an explicit manual completion overrides it.
    const effectivelyPassed = manualRecord?.status === 'COMPLETED'
      ? manualRecord.result !== ExamResult.FAILED
      : Boolean(alreadyPassed);
    if (effectivelyPassed) {
      throw new ConflictException(`الطالب اجتاز "${section.name}" مسبقاً`);
    }

    // Enforce the required order on the server, not just in the UI.
    const earlierRequired = enforceSequence ? await this.prisma.examSection.findMany({
      where: { isActive: true, isRequired: true, order: { lt: section.order } },
      select: { id: true, name: true },
    }) : [];
    if (earlierRequired.length) {
      const passedEarlier = await this.prisma.exam.findMany({
        where: {
          studentId,
          status: ExamStatus.COMPLETED,
          result: ExamResult.PASSED,
          score: { not: null },
          OR: [
            { sectionId: { in: earlierRequired.map((item) => item.id) } },
            { sections: { some: { sectionId: { in: earlierRequired.map((item) => item.id) } } } },
          ],
        },
        select: { sectionId: true, sections: { select: { sectionId: true } } },
      });
      const passedEarlierIds = new Set(passedEarlier.flatMap((exam) =>
        [exam.sectionId, ...exam.sections.map((entry) => entry.sectionId)].filter(Boolean) as string[],
      ));
      const manualEarlier = await this.prisma.examMilestoneRecord.findMany({
        where: { studentId, sectionId: { in: earlierRequired.map((item) => item.id) } },
        select: { sectionId: true, status: true, result: true },
      });
      manualEarlier.forEach((record) => {
        if (record.status === 'COMPLETED' && record.result !== ExamResult.FAILED) {
          passedEarlierIds.add(record.sectionId);
        } else if (record.status === 'COMPLETED' && record.result === ExamResult.FAILED) {
          // Do not let a non-completed manual row erase a pass from an exam.
          passedEarlierIds.delete(record.sectionId);
        }
      });
      const missing = earlierRequired.find((item) => !passedEarlierIds.has(item.id));
      if (missing) {
        throw new ConflictException(`لا يمكن طلب اختبار هذا المقرر قبل اجتياز ${missing.name}`);
      }
    }

    const manualOpen = await this.prisma.examMilestoneRecord.findFirst({
      where: { studentId, sectionId, status: { in: ['REQUESTED', 'SCHEDULED'] } },
      select: { id: true },
    });
    if (manualOpen) {
      throw new ConflictException('يوجد طلب اختبار قائم لهذا المقرر');
    }

    const open = await this.prisma.examRequest.findFirst({
      where: {
        studentId,
        status: {
          in: [ExamRequestStatus.PENDING, ExamRequestStatus.SCHEDULED],
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
    });

    if (open) {
      throw new ConflictException('يوجد طلب اختبار قائم لهذا المقرر');
    }

    return section;
  }

  private async fetchActiveSections(sectionIds: string[]) {
    const sections = await this.prisma.examSection.findMany({
      where: {
        id: { in: sectionIds },
        isActive: true,
      },
      orderBy: { order: 'asc' },
    });

    if (sections.length !== sectionIds.length) {
      throw new BadRequestException('أحد المقررات المحددة غير موجود');
    }
    return sections;
  }

  private async validateAllSectionsEligibility(studentId: string, sections: any[]) {
    try {
      // Combined requests represent one consecutive block in the progression.
      for (let index = 1; index < sections.length; index++) {
        if (sections[index].order !== sections[index - 1].order + 1) {
          throw new BadRequestException('التسميع المجتمعة يجب أن تتبع التسلسل دون تخطي مقررات');
        }
      }
      // Enforce progression on the first section, while still checking
      // duplicates/open requests for every selected section.
      await Promise.all(sections.map((section, index) =>
        this.assertEligible(studentId, section.id, index === 0),
      ));
    } catch (error) {
      this.logger.error(
        `خطأ في التحقق من أهلية الطالب ${studentId}: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  private validateStudentStatus(student: any) {
    if (!student.circleId) {
      throw new BadRequestException('الطالب غير مسجل في حلقة');
    }
    if (student.status === 'SUSPENDED') {
      throw new BadRequestException('لا يمكن تقديم طلب اختبار لطالب موقوف');
    }
    if (student.status === 'ACTIVITY') {
      throw new BadRequestException('لا يمكن تقديم طلب اختبار لطالب في برنامج النشاط');
    }
  }

  // ==========================================================================
  // طلبات الاختبار
  // ==========================================================================

  async requestExam(actor: AuthUser, dto: CreateExamRequestDto) {
    const student = await this.acl.assertStudentWriteAccess(actor, dto.studentId);
    this.validateStudentStatus(student);

    const sectionIds = [...new Set(dto.sectionIds ?? [])];
    if (sectionIds.length === 0) {
      throw new BadRequestException('يجب تحديد حزب أو جزء أو مجتمعة واحد على الأقل من القائمة');
    }

    const sections = await this.fetchActiveSections(sectionIds);
    await this.validateAllSectionsEligibility(dto.studentId, sections);
    const label = this.sectionsLabel(sections);

    const primary = sections[0];
    const teacherId = await this.resolveTeacherId(actor, student.circleId);

    const request = await this.prisma.examRequest.create({
      data: {
        studentId: dto.studentId,
        sectionId: primary.id,
        teacherId,
        note: dto.note,
        sections: {
          create: sections.map((section) => ({ sectionId: section.id })),
        },
      },
      include: REQUEST_INCLUDE,
    });

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

  // ==========================================================================
  // التسميات (Labels)
  // ==========================================================================

  private sectionsLabel(sections: { name: string; order: number }[]) {
    return `"${describeSections(sections)}"`;
  }

  private examLabel(exam: {
    section: { name: string; order: number };
    sections?: { section: { name: string; order: number } }[];
  }) {
    const all = exam.sections?.length
      ? exam.sections.map((x) => x.section)
      : [exam.section];
    return describeSections(all);
  }

  private requestLabel(request: any) {
    const manual: string[] = [];
    if (request.requestedHizb != null) manual.push(`حزب ${request.requestedHizb}`);
    if (request.requestedJuz != null) manual.push(`جزء ${request.requestedJuz}`);
    if (request.requestedCombined != null) manual.push(`مجتمعة ${request.requestedCombined}`);
    if (manual.length) return manual.join(' + ');

    const all = request.sections?.length
      ? request.sections.map((x: any) => x.section)
      : [request.section];
    return describeSections(all);
  }

  // ==========================================================================
  // قراءة الطلبات
  // ==========================================================================

  async findRequests(user: AuthUser, query: QueryExamRequestsDto) {
    const scope = await this.acl.studentScope(user);

    const where: Prisma.ExamRequestWhereInput = {
      student: {
        ...scope,
        deletedAt: null,
      },
      ...(query.status ? { status: query.status } : {}),
      ...(query.studentId ? { studentId: query.studentId } : {}),
      ...(query.sectionId ? { sectionId: query.sectionId } : {}),
      ...((query as { kind?: string }).kind
        ? {
            section: {
              kind: (query as { kind?: any }).kind,
            },
          }
        : {}),
      ...(query.search
        ? {
            student: {
              ...scope,
              deletedAt: null,
              fullName: {
                contains: query.search,
                mode: 'insensitive',
              },
            },
          }
        : {}),
    };

    const [data, total] = await this.prisma.$transaction([
      this.prisma.examRequest.findMany({
        where,
        include: REQUEST_INCLUDE,
        orderBy: {
          createdAt: query.sortOrder || 'asc',
        },
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

    if (!request) {
      throw new NotFoundException('طلب الاختبار غير موجود');
    }

    await this.acl.assertStudentAccess(user, request.studentId);

    return request;
  }

  // ==========================================================================
  // رفض / إلغاء الطلب
  // ==========================================================================

  async rejectRequest(actor: AuthUser, id: string, dto: ReviewExamRequestDto) {
    const request = await this.prisma.examRequest.findUnique({
      where: { id },
      include: REQUEST_INCLUDE,
    });

    if (!request) {
      throw new NotFoundException('طلب الاختبار غير موجود');
    }

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
      include: {
        teacher: true,
      },
    });

    if (!request) {
      throw new NotFoundException('طلب الاختبار غير موجود');
    }

    if (request.status !== ExamRequestStatus.PENDING) {
      throw new BadRequestException('لا يمكن إلغاء طلب تمت جدولته أو البت فيه');
    }

    const isAuthorized =
      actor.role === Role.ADMIN ||
      actor.role === Role.EXAM_COMMITTEE ||
      actor.teacherId === request.teacherId;

    if (!isAuthorized) {
      throw new ForbiddenException('يمكن إلغاء الطلب من قبل المعلم صاحب الطلب أو اللجنة');
    }

    return this.prisma.examRequest.update({
      where: { id },
      data: {
        status: ExamRequestStatus.CANCELLED,
        reviewedAt: new Date(),
        reviewedById: actor.id,
      },
      include: REQUEST_INCLUDE,
    });
  }

  // ==========================================================================
  // جدولة الاختبار
  // ==========================================================================

  private async sendExamScheduledNotifications(
    request: any,
    exam: any,
    scheduledAt: Date,
    examinerId?: string,
  ) {
    const when = this.formatDateArabic(scheduledAt);
    const notificationPromises: Promise<any>[] = [];

    if (request.teacher?.user?.id) {
      notificationPromises.push(
        this.notifications.notify({
          userId: request.teacher.user.id,
          type: NotificationType.EXAM_SCHEDULED,
          title: 'تم تحديد موعد اختبار',
          body: `اختبار ${request.student.fullName} في "${this.requestLabel(request)}" بتاريخ ${when}`,
          link: `/exams/${exam.id}`,
        }),
      );
    }

    if (request.student.parentProfile?.userId) {
      notificationPromises.push(
        this.notifications.notify({
          userId: request.student.parentProfile.userId,
          type: NotificationType.EXAM_SCHEDULED,
          title: 'موعد اختبار قادم',
          body: `اختبار ${request.student.fullName} في "${this.requestLabel(request)}" بتاريخ ${when}`,
          link: `/parent/children/${request.studentId}`,
        }),
      );
    }

    if (examinerId) {
      notificationPromises.push(
        this.notifications.notify({
          userId: examinerId,
          type: NotificationType.EXAM_SCHEDULED,
          title: 'تم إسنادك كممتحن',
          body: `اختبار ${request.student.fullName} في "${this.requestLabel(request)}" بتاريخ ${when}`,
          link: `/exams/${exam.id}`,
        }),
      );
    }

    await Promise.all(notificationPromises);
  }

  async scheduleExam(actor: AuthUser, requestId: string, dto: ScheduleExamDto) {
    const request = await this.prisma.examRequest.findUnique({
      where: { id: requestId },
      include: REQUEST_INCLUDE,
    });

    if (!request) {
      throw new NotFoundException('طلب الاختبار غير موجود');
    }

    if (request.status !== ExamRequestStatus.PENDING) {
      throw new BadRequestException('هذا الطلب ليس في قائمة الانتظار');
    }

    const scheduledAt = this.parseDate(dto.scheduledAt);

    if (scheduledAt.getTime() < Date.now() - 60 * 60 * 1000) {
      throw new BadRequestException('لا يمكن جدولة اختبار في الماضي');
    }

    if (dto.examinerId) {
      await this.assertExaminer(dto.examinerId);
    }

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
          sections: {
            create: (request.sections.length
              ? request.sections.map((s) => s.section.id)
              : [request.sectionId]
            ).map((sectionId) => ({
              sectionId,
            })),
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

    await this.sendExamScheduledNotifications(request, exam, scheduledAt, dto.examinerId);

    await this.activity.log({
      userId: actor.id,
      action: 'EXAM_SCHEDULE',
      summary: `جدولة اختبار ${request.student.fullName} في ${this.requestLabel(request)}`,
      entityType: 'Exam',
      entityId: exam.id,
    });

    return exam;
  }

  // ==========================================================================
  // تحديث الاختبار
  // ==========================================================================

  async updateExam(actor: AuthUser, id: string, dto: UpdateExamDto) {
    const exam = await this.prisma.exam.findUnique({
      where: { id },
      include: EXAM_INCLUDE,
    });

    if (!exam) {
      throw new NotFoundException('الاختبار غير موجود');
    }

    if (exam.status === ExamStatus.COMPLETED) {
      throw new BadRequestException('لا يمكن تعديل اختبار مكتمل');
    }

    if (dto.examinerId) {
      await this.assertExaminer(dto.examinerId);
    }

    const updated = await this.prisma.exam.update({
      where: { id },
      data: {
        scheduledAt: dto.scheduledAt ? this.parseDate(dto.scheduledAt) : undefined,
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
        data: {
          status: ExamRequestStatus.CANCELLED,
        },
      });
    }

    return updated;
  }

  // ==========================================================================
  // رصد النتائج
  // ==========================================================================

  private validateExamForResult(exam: any) {
    if (exam.status === ExamStatus.COMPLETED) {
      throw new BadRequestException('تم رصد نتيجة هذا الاختبار مسبقاً');
    }
    if (exam.status === ExamStatus.CANCELLED) {
      throw new BadRequestException('هذا الاختبار ملغى');
    }
  }

  private async updateExamResult(
    tx: any,
    examId: string,
    dto: RecordResultDto,
    passed: boolean,
    evaluation: string,
    actor: AuthUser,
  ) {
    return tx.exam.update({
      where: { id: examId },
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
  }

  private async updateRequestStatus(tx: any, requestId: string) {
    return tx.examRequest.update({
      where: { id: requestId },
      data: {
        status: ExamRequestStatus.COMPLETED,
      },
    });
  }

  private async updateStudentMemorization(tx: any, studentId: string) {
    const passedExams = await tx.exam.findMany({
      where: {
        studentId,
        status: ExamStatus.COMPLETED,
        result: ExamResult.PASSED,
      },
      select: {
        sectionId: true,
        sections: {
          select: {
            sectionId: true,
          },
        },
      },
    });

    const active = await tx.examSection.findMany({
      where: { isActive: true },
      select: { id: true, kind: true },
    });

    const activeIds = new Set(active.map((x: any) => x.id));
    const activeHizbIds = new Set(active.filter((x: any) => x.kind === 'HIZB').map((x: any) => x.id));

    const passedSections = new Set<string>(
      passedExams
        .flatMap((e: any) => [
          e.sectionId,
          ...e.sections.map((x: any) => x.sectionId),
        ])
        .filter((id: string) => activeIds.has(id)),
    );
    const manualRecords = await tx.examMilestoneRecord.findMany({
      where: { studentId },
      select: { sectionId: true, status: true, result: true },
    });
    manualRecords.forEach((record: any) => {
      if (!activeIds.has(record.sectionId)) return;
      if (record.status === 'COMPLETED' && record.result !== ExamResult.FAILED) {
        passedSections.add(record.sectionId);
      } else {
        passedSections.delete(record.sectionId);
      }
    });

    await tx.student.update({
      where: { id: studentId },
      data: {
        memorizedParts: Math.min(
          30,
          exactJuzFromHizb([...passedSections].filter((id) => activeHizbIds.has(id)).length),
        ),
      },
    });
  }

  private async sendResultNotifications(
    exam: any,
    updated: any,
    passed: boolean,
    score: number,
  ) {
    const title = passed ? 'نتيجة اختبار: ناجح' : 'نتيجة اختبار: لم يجتز';
    const evaluation = evaluationFromScore(score);
    const body = `${exam.student.fullName} — "${this.examLabel(exam)}" بدرجة ${score} من 100 (${EVALUATION_LABELS[evaluation]})`;

    const recipients: { userId: string; link: string }[] = [];

    if (exam.request?.teacher?.user?.id) {
      recipients.push({
        userId: exam.request.teacher.user.id,
        link: `/exams/${exam.id}`,
      });
    }

    if (exam.student.parentProfile?.userId) {
      recipients.push({
        userId: exam.student.parentProfile.userId,
        link: `/parent/children/${exam.studentId}`,
      });
    }

    const seen = new Set<string>();
    const notificationPromises: Promise<any>[] = [];

    for (const recipient of recipients) {
      if (seen.has(recipient.userId)) continue;
      seen.add(recipient.userId);

      notificationPromises.push(
        this.notifications.notify({
          userId: recipient.userId,
          type: NotificationType.EXAM_RESULT,
          title,
          body,
          link: recipient.link,
          data: {
            examId: exam.id,
            passed,
            score,
          },
        }),
      );
    }

    await Promise.all(notificationPromises);
  }

  async recordResult(actor: AuthUser, id: string, dto: RecordResultDto) {
    const exam = await this.prisma.exam.findUnique({
      where: { id },
      include: EXAM_INCLUDE,
    });

    if (!exam) {
      throw new NotFoundException('الاختبار غير موجود');
    }

    this.validateExamForResult(exam);

    const examSections = exam.sections.length
      ? exam.sections.map((entry) => entry.section)
      : [exam.section];
    if (examSections.length > 1) {
      if (!dto.sectionScores || dto.sectionScores.length !== examSections.length) {
        throw new BadRequestException('يجب إدخال علامة مستقلة لكل حزب وجزء في الاختبار المجمع');
      }
      const submittedIds = new Set(dto.sectionScores.map((entry) => entry.sectionId));
      if (examSections.some((section) => !submittedIds.has(section.id))) {
        throw new BadRequestException('يجب إدخال علامة لكل مقرر في هذا الاختبار دون تكرار أو حذف');
      }
    }

    const scoreBySection = new Map((dto.sectionScores ?? []).map((entry) => [entry.sectionId, entry.score]));
    const sectionScores = examSections.map((section) => ({
      section,
      score: scoreBySection.get(section.id) ?? dto.score,
    }));
    const overallScore = sectionScores.length > 1
      ? Math.round(sectionScores.reduce((sum, entry) => sum + entry.score, 0) / sectionScores.length)
      : dto.score;
    const resultDto = { ...dto, score: overallScore };
    const passed = overallScore >= exam.section.minScore;
    const evaluation = evaluationFromScore(overallScore);

    const updated = await this.prisma.$transaction(async (tx) => {
      const result = await this.updateExamResult(
        tx,
        id,
        resultDto,
        passed,
        evaluation,
        actor,
      );

      for (const entry of sectionScores) {
        const sectionPassed = entry.score >= entry.section.minScore;
        await tx.examMilestoneRecord.upsert({
          where: { studentId_sectionId: { studentId: exam.studentId, sectionId: entry.section.id } },
          create: {
            studentId: exam.studentId,
            sectionId: entry.section.id,
            status: 'COMPLETED',
            result: sectionPassed ? ExamResult.PASSED : ExamResult.FAILED,
            score: entry.score,
            examDate: exam.scheduledAt,
            examinerName: exam.examiner?.fullName ?? null,
            updatedById: actor.id,
          },
          update: {
            status: 'COMPLETED',
            result: sectionPassed ? ExamResult.PASSED : ExamResult.FAILED,
            score: entry.score,
            examDate: exam.scheduledAt,
            examinerName: exam.examiner?.fullName ?? null,
            updatedById: actor.id,
          },
        });
      }

      if (exam.requestId) {
        await this.updateRequestStatus(tx, exam.requestId);
      }

      await this.updateStudentMemorization(tx, exam.studentId);

      return result;
    });

    await this.sendResultNotifications(exam, updated, passed, overallScore);

    await this.activity.log({
      userId: actor.id,
      action: 'EXAM_RESULT',
      summary: `رصد نتيجة اختبار ${exam.student.fullName} في ${this.examLabel(exam)}: ${overallScore} (${EVALUATION_LABELS[evaluation]})`,
      entityType: 'Exam',
      entityId: id,
    });

    return updated;
  }

  // ==========================================================================
  // تسجيل الغياب
  // ==========================================================================

  async markAbsent(actor: AuthUser, id: string) {
    const exam = await this.prisma.exam.findUnique({
      where: { id },
    });

    if (!exam) {
      throw new NotFoundException('الاختبار غير موجود');
    }

    if (exam.status !== ExamStatus.SCHEDULED) {
      throw new BadRequestException('يمكن تسجيل الغياب للاختبارات المجدولة فقط');
    }

    const updated = await this.prisma.exam.update({
      where: { id },
      data: {
        status: ExamStatus.ABSENT,
        gradedById: actor.id,
        gradedAt: new Date(),
      },
      include: EXAM_INCLUDE,
    });

    if (exam.requestId) {
      await this.prisma.examRequest.update({
        where: { id: exam.requestId },
        data: {
          status: ExamRequestStatus.COMPLETED,
        },
      });
    }

    return updated;
  }

  // ==========================================================================
  // قراءة الاختبارات
  // ==========================================================================

  async findExams(user: AuthUser, query: QueryExamsDto) {
    const scope = await this.acl.studentScope(user);

    const where: Prisma.ExamWhereInput = {
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
                    contains: query.search,
                    mode: 'insensitive',
                  },
                },
              },
              {
                student: {
                  ...scope,
                  deletedAt: null,
                  code: {
                    contains: query.search,
                    mode: 'insensitive',
                  },
                },
              },
              {
                section: {
                  name: {
                    contains: query.search,
                    mode: 'insensitive',
                  },
                },
              },
              {
                sections: {
                  some: {
                    section: {
                      name: {
                        contains: query.search,
                        mode: 'insensitive',
                      },
                    },
                  },
                },
              },
              {
                examiner: {
                  fullName: {
                    contains: query.search,
                    mode: 'insensitive',
                  },
                },
              },
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
              ...(query.from ? { gte: this.parseDate(query.from) } : {}),
              ...(query.to ? { lte: this.parseDate(query.to) } : {}),
            },
          }
        : {}),
    };

    const [data, total] = await this.prisma.$transaction([
      this.prisma.exam.findMany({
        where,
        include: EXAM_INCLUDE,
        orderBy: {
          scheduledAt: query.sortOrder || 'desc',
        },
        skip: query.skip,
        take: query.take,
      }),
      this.prisma.exam.count({ where }),
    ]);

    return paginate(data, total, query.page, query.limit);
  }

  async findExam(user: AuthUser, id: string) {
    const exam = await this.prisma.exam.findUnique({
      where: { id },
      include: EXAM_INCLUDE,
    });

    if (!exam) {
      throw new NotFoundException('الاختبار غير موجود');
    }

    await this.acl.assertStudentAccess(user, exam.studentId);

    return exam;
  }

  async upcoming(user: AuthUser, days = 30) {
    const scope = await this.acl.studentScope(user);

    const until = new Date();
    until.setDate(until.getDate() + days);

    return this.prisma.exam.findMany({
      where: {
        student: {
          ...scope,
          deletedAt: null,
        },
        status: ExamStatus.SCHEDULED,
        scheduledAt: {
          gte: new Date(),
          lte: until,
        },
      },
      include: EXAM_INCLUDE,
      orderBy: {
        scheduledAt: 'asc',
      },
      take: 50,
    });
  }

  async stats(user: AuthUser) {
    const scope = await this.acl.studentScope(user);

    const studentFilter = {
      student: {
        ...scope,
        deletedAt: null,
      },
    };

    const [pendingRequests, scheduled, completed, passed, failed] = await Promise.all([
      this.prisma.examRequest.count({
        where: {
          ...studentFilter,
          status: ExamRequestStatus.PENDING,
        },
      }),
      this.prisma.exam.count({
        where: {
          ...studentFilter,
          status: ExamStatus.SCHEDULED,
        },
      }),
      this.prisma.exam.count({
        where: {
          ...studentFilter,
          status: ExamStatus.COMPLETED,
        },
      }),
      this.prisma.exam.count({
        where: {
          ...studentFilter,
          status: ExamStatus.COMPLETED,
          result: ExamResult.PASSED,
        },
      }),
      this.prisma.exam.count({
        where: {
          ...studentFilter,
          status: ExamStatus.COMPLETED,
          result: ExamResult.FAILED,
        },
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

  // ==========================================================================
  // الممتحنين
  // ==========================================================================

  examiners() {
    return this.prisma.user.findMany({
      where: {
        role: {
          in: [Role.EXAM_COMMITTEE, Role.ADMIN],
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

  // ==========================================================================
  // المساعدين (Helpers)
  // ==========================================================================

  private async assertExaminer(userId: string) {
    const examiner = await this.prisma.user.findFirst({
      where: {
        id: userId,
        deletedAt: null,
        isActive: true,
        role: {
          in: [Role.EXAM_COMMITTEE, Role.ADMIN],
        },
      },
    });

    if (!examiner) {
      throw new BadRequestException('الممتحن المحدد غير صالح');
    }
  }

  private async resolveTeacherId(actor: AuthUser, circleId: string) {
    if (actor.role === Role.TEACHER && actor.teacherId) {
      return actor.teacherId;
    }

    const primary = await this.prisma.circleTeacher.findFirst({
      where: {
        circleId,
        role: 'PRIMARY',
        endedAt: null,
      },
      select: {
        teacherId: true,
      },
    });

    if (primary) {
      return primary.teacherId;
    }

    const any = await this.prisma.circleTeacher.findFirst({
      where: {
        circleId,
        endedAt: null,
      },
      select: {
        teacherId: true,
      },
    });

    if (!any) {
      throw new BadRequestException('لا يوجد معلم مسند لهذه الحلقة');
    }

    return any.teacherId;
  }
}
