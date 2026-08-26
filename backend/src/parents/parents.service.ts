import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma, Role } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import { AccessControlService } from '../common/services/access-control.service';
import { ActivityService } from '../common/services/activity.service';
import { AuthUser } from '../common/decorators';
import { paginate } from '../common/dto/pagination.dto';
import { CreateParentDto, LinkStudentDto, QueryParentsDto, UpdateParentDto } from './dto/parent.dto';

const PARENT_INCLUDE = {
  user: {
    select: {
      id: true,
      fullName: true,
      username: true,
      email: true,
      phone: true,
      avatarUrl: true,
      isActive: true,
      lastLoginAt: true,
    },
  },
  students: {
    where: { deletedAt: null },
    select: {
      id: true,
      code: true,
      fullName: true,
      photoUrl: true,
      status: true,
      evaluation: true,
      circle: { select: { id: true, name: true } },
    },
  },
} satisfies Prisma.ParentProfileInclude;

@Injectable()
export class ParentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly acl: AccessControlService,
    private readonly activity: ActivityService,
  ) {}

  async findAll(query: QueryParentsDto) {
    const where: Prisma.ParentProfileWhereInput = {
      deletedAt: null,
      ...(query.search
        ? {
            OR: [
              { user: { fullName: { contains: query.search, mode: 'insensitive' } } },
              { user: { email: { contains: query.search, mode: 'insensitive' } } },
              { phone: { contains: query.search } },
              { nationalId: { contains: query.search } },
            ],
          }
        : {}),
    };

    const [data, total] = await this.prisma.$transaction([
      this.prisma.parentProfile.findMany({
        where,
        include: PARENT_INCLUDE,
        orderBy: { createdAt: 'desc' },
        skip: query.skip,
        take: query.take,
      }),
      this.prisma.parentProfile.count({ where }),
    ]);

    return paginate(data, total, query.page, query.limit);
  }

  async findOne(id: string) {
    const parent = await this.prisma.parentProfile.findFirst({
      where: { id, deletedAt: null },
      include: PARENT_INCLUDE,
    });
    if (!parent) throw new NotFoundException('ولي الأمر غير موجود');
    return parent;
  }

  /** Options for the "link a parent" picker on the student form. */
  options(search?: string) {
    return this.prisma.parentProfile.findMany({
      where: {
        deletedAt: null,
        ...(search ? { user: { fullName: { contains: search, mode: 'insensitive' } } } : {}),
      },
      select: { id: true, phone: true, user: { select: { id: true, fullName: true } } },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }

  async create(actor: AuthUser, dto: CreateParentDto) {
    const nameTaken = await this.prisma.user.findUnique({ where: { username: dto.username } });
    if (nameTaken) throw new ConflictException('اسم المستخدم مستخدم مسبقاً');
    if (dto.email) {
      const emailTaken = await this.prisma.user.findFirst({
        where: { email: dto.email, deletedAt: null },
        select: { id: true },
      });
      if (emailTaken) throw new ConflictException('البريد الإلكتروني مستخدم مسبقاً');
    }

    const rounds = parseInt(this.config.get('BCRYPT_ROUNDS') || '10', 10);
    const parent = await this.prisma.parentProfile.create({
      data: {
        nationalId: dto.nationalId || null,
        phone: dto.phone,
        altPhone: dto.altPhone,
        address: dto.address,
        occupation: dto.occupation,
        user: {
          create: {
            username: dto.username,
            email: dto.email || null,
            passwordHash: await bcrypt.hash(dto.password, rounds),
            fullName: dto.fullName,
            role: Role.PARENT,
            // Created by the management, so the password must be replaced on first login.
            phone: dto.phone || null,
          },
        },
      },
      include: PARENT_INCLUDE,
    });

    if (dto.studentIds?.length) {
      await this.prisma.student.updateMany({
        where: { id: { in: dto.studentIds }, deletedAt: null },
        data: { parentId: parent.id },
      });
    }

    await this.activity.log({
      userId: actor.id,
      action: 'PARENT_CREATE',
      summary: `إضافة ولي أمر: ${dto.fullName}`,
      entityType: 'Parent',
      entityId: parent.id,
    });

    return this.findOne(parent.id);
  }

  async update(actor: AuthUser, id: string, dto: UpdateParentDto) {
    const parent = await this.prisma.parentProfile.findFirst({
      where: { id, deletedAt: null },
      include: { user: true },
    });
    if (!parent) throw new NotFoundException('ولي الأمر غير موجود');

    // A parent may maintain their own contact details only.
    if (actor.role === Role.PARENT) {
      if (actor.parentId !== id) throw new ForbiddenException('لا تملك صلاحية التعديل');
      const allowed = ['phone', 'altPhone', 'address', 'occupation', 'email'];
      const attempted = Object.keys(dto).filter((k) => dto[k] !== undefined && !allowed.includes(k));
      if (attempted.length) throw new ForbiddenException('لا تملك صلاحية تعديل هذه البيانات');
    }

    await this.prisma.parentProfile.update({
      where: { id },
      data: {
        nationalId: dto.nationalId === '' ? null : dto.nationalId,
        phone: dto.phone,
        altPhone: dto.altPhone,
        address: dto.address,
        occupation: dto.occupation,
        user: {
          update: {
            fullName: dto.fullName,
            ...(dto.username ? { username: dto.username } : {}),
            email: dto.email === '' ? null : dto.email,
            phone: dto.phone === '' ? null : dto.phone,
          },
        },
      },
    });

    return this.findOne(id);
  }

  async linkStudents(actor: AuthUser, id: string, dto: LinkStudentDto) {
    const parent = await this.prisma.parentProfile.findFirst({ where: { id, deletedAt: null } });
    if (!parent) throw new NotFoundException('ولي الأمر غير موجود');

    await this.prisma.$transaction([
      // Detach children that are no longer selected.
      this.prisma.student.updateMany({
        where: { parentId: id, id: { notIn: dto.studentIds }, deletedAt: null },
        data: { parentId: null },
      }),
      this.prisma.student.updateMany({
        where: { id: { in: dto.studentIds }, deletedAt: null },
        data: { parentId: id },
      }),
    ]);

    await this.activity.log({
      userId: actor.id,
      action: 'PARENT_LINK_STUDENTS',
      summary: `تحديث أبناء ولي الأمر (${dto.studentIds.length} طالب)`,
      entityType: 'Parent',
      entityId: id,
    });

    return this.findOne(id);
  }

  async remove(actor: AuthUser, id: string) {
    const parent = await this.prisma.parentProfile.findFirst({
      where: { id, deletedAt: null },
      include: { user: true },
    });
    if (!parent) throw new NotFoundException('ولي الأمر غير موجود');

    const now = new Date();
    await this.prisma.$transaction([
      this.prisma.student.updateMany({ where: { parentId: id }, data: { parentId: null } }),
      this.prisma.parentProfile.update({ where: { id }, data: { deletedAt: now } }),
      this.prisma.user.update({
        where: { id: parent.userId },
        data: { deletedAt: now, isActive: false },
      }),
    ]);

    await this.activity.log({
      userId: actor.id,
      action: 'PARENT_DELETE',
      summary: `حذف ولي الأمر: ${parent.user.fullName}`,
      entityType: 'Parent',
      entityId: id,
    });

    return { message: 'تم حذف ولي الأمر' };
  }

  // --- parent portal -------------------------------------------------------

  /** The children of the logged-in parent, with a compact status summary each. */
  async myChildren(user: AuthUser) {
    if (!user.parentId) throw new ForbiddenException('هذا الحساب غير مرتبط بملف ولي أمر');

    const students = await this.prisma.student.findMany({
      where: { parentId: user.parentId, deletedAt: null },
      select: {
        id: true,
        code: true,
        fullName: true,
        photoUrl: true,
        birthDate: true,
        status: true,
        evaluation: true,
        evaluationNote: true,
        memorizedParts: true,
        currentSurah: true,
        circle: {
          select: {
            id: true,
            name: true,
            code: true,
            startTime: true,
            endTime: true,
            scheduleDays: true,
            location: true,
            supervisor: { select: { fullName: true, phone: true } },
            teachers: {
              where: { endedAt: null },
              select: {
                role: true,
                teacher: { select: { user: { select: { fullName: true, phone: true } } } },
              },
            },
          },
        },
      },
      orderBy: { fullName: 'asc' },
    });

    return Promise.all(
      students.map(async (student) => {
        const [attendance, lastRecitation, upcomingExam, suspension] = await Promise.all([
          this.prisma.attendance.groupBy({
            by: ['status'],
            where: { studentId: student.id },
            _count: { _all: true },
          }),
          this.prisma.recitation.findFirst({
            where: { studentId: student.id, deletedAt: null },
            orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
            select: { date: true, fromSurah: true, fromAyah: true, toSurah: true, toAyah: true, evaluation: true },
          }),
          this.prisma.exam.findFirst({
            where: { studentId: student.id, status: 'SCHEDULED', scheduledAt: { gte: new Date() } },
            orderBy: { scheduledAt: 'asc' },
            select: {
              id: true,
              scheduledAt: true,
              location: true,
              section: { select: { name: true, order: true } },
              sections: { select: { section: { select: { name: true, order: true } } } },
            },
          }),
          this.prisma.suspensionRequest.findFirst({
            where: { studentId: student.id, status: 'APPROVED', returnedAt: null },
            orderBy: { createdAt: 'desc' },
            select: { reason: true, action: true, startDate: true, endDate: true },
          }),
        ]);

        const total = attendance.reduce((s, a) => s + a._count._all, 0);
        const present = attendance.find((a) => a.status === 'PRESENT')?._count._all ?? 0;

        const primary = student.circle?.teachers.find((t) => t.role === 'PRIMARY');

        return {
          ...student,
          teacherName: primary?.teacher.user.fullName ?? null,
          teacherPhone: primary?.teacher.user.phone ?? null,
          lastRecitation,
          upcomingExam,
          activeSuspension: suspension
            ? {
                ...suspension,
                // An activity-programme transfer is open-ended and has no end
                // date, so there is no countdown to show.
                remainingDays: suspension.endDate
                  ? Math.max(0, Math.ceil((suspension.endDate.getTime() - Date.now()) / 86400000))
                  : null,
              }
            : null,
          attendance: {
            total,
            present,
            absent: attendance.find((a) => a.status === 'ABSENT')?._count._all ?? 0,
            excused: attendance.find((a) => a.status === 'EXCUSED')?._count._all ?? 0,
            rate: total ? Math.round((present / total) * 100) : 0,
          },
        };
      }),
    );
  }

  /** Full read-only file for one child, after verifying the parent owns it. */
  async childDetails(user: AuthUser, studentId: string) {
    await this.acl.assertStudentAccess(user, studentId);

    const [attendance, recitations, exams, notes, evaluations] = await Promise.all([
      this.prisma.attendance.findMany({
        where: { studentId },
        orderBy: { date: 'desc' },
        take: 60,
        select: { id: true, date: true, status: true, note: true },
      }),
      this.prisma.recitation.findMany({
        where: { studentId, deletedAt: null },
        orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
        take: 40,
        include: { teacher: { select: { user: { select: { fullName: true } } } } },
      }),
      this.prisma.exam.findMany({
        where: { studentId },
        include: {
          section: { select: { name: true, order: true, minScore: true } },
          sections: { select: { section: { select: { name: true, order: true } } } },
        },
        orderBy: { scheduledAt: 'desc' },
      }),
      this.prisma.studentNote.findMany({
        where: { studentId, deletedAt: null, isPrivate: false },
        include: { author: { select: { fullName: true, role: true } } },
        orderBy: { createdAt: 'desc' },
        take: 20,
      }),
      this.prisma.studentEvaluation.findMany({
        where: { studentId },
        include: { author: { select: { fullName: true } } },
        orderBy: { createdAt: 'desc' },
        take: 10,
      }),
    ]);

    return { attendance, recitations, exams, notes, evaluations };
  }
}
