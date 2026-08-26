import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma, Role } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import { ActivityService } from '../common/services/activity.service';
import { AccessControlService } from '../common/services/access-control.service';
import { AuthUser } from '../common/decorators';
import { paginate } from '../common/dto/pagination.dto';
import { CreateTeacherDto, QueryTeachersDto, UpdateTeacherDto } from './dto/teacher.dto';

const TEACHER_INCLUDE = {
  user: {
    select: {
      id: true,
      username: true,
      fullName: true,
      email: true,
      phone: true,
      avatarUrl: true,
      jobTitle: true,
      specialization: true,
      isActive: true,
      lastLoginAt: true,
      // Courses this teacher lectures — the courses track alongside their circles.
      coursesInstructed: {
        where: { deletedAt: null },
        select: {
          id: true,
          name: true,
          code: true,
          type: true,
          startDate: true,
          endDate: true,
          isActive: true,
          _count: { select: { enrollments: true } },
        },
        orderBy: { createdAt: 'desc' },
      },
    },
  },
  circleRoles: {
    where: { endedAt: null },
    select: {
      id: true,
      role: true,
      startedAt: true,
      circle: { select: { id: true, name: true, code: true, isActive: true } },
    },
  },
} satisfies Prisma.TeacherProfileInclude;

@Injectable()
export class TeachersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly activity: ActivityService,
    private readonly acl: AccessControlService,
  ) {}

  async findAll(user: AuthUser, query: QueryTeachersDto) {
    // Supervisors only see teachers working in the circles they supervise.
    let circleFilter: Prisma.TeacherProfileWhereInput = {};
    if (user.role === Role.SUPERVISOR) {
      const ids = await this.acl.supervisorCircleIds(user);
      circleFilter = { circleRoles: { some: { endedAt: null, circleId: { in: ids } } } };
    } else if (query.circleId) {
      circleFilter = { circleRoles: { some: { endedAt: null, circleId: query.circleId } } };
    }

    const where: Prisma.TeacherProfileWhereInput = {
      deletedAt: null,
      ...circleFilter,
      ...(query.isActive !== undefined ? { isActive: query.isActive } : {}),
      ...(query.employmentType ? { employmentType: query.employmentType } : {}),
      ...(query.unassigned ? { circleRoles: { none: { endedAt: null } } } : {}),
      ...(query.search
        ? {
            OR: [
              { user: { fullName: { contains: query.search, mode: 'insensitive' } } },
              { user: { email: { contains: query.search, mode: 'insensitive' } } },
              { user: { phone: { contains: query.search } } },
              { nationalId: { contains: query.search } },
            ],
          }
        : {}),
    };

    const orderBy: Prisma.TeacherProfileOrderByWithRelationInput =
      query.sortBy === 'fullName'
        ? { user: { fullName: query.sortOrder } }
        : { createdAt: query.sortOrder || 'desc' };

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.teacherProfile.findMany({
        where,
        include: TEACHER_INCLUDE,
        orderBy,
        skip: query.skip,
        take: query.take,
      }),
      this.prisma.teacherProfile.count({ where }),
    ]);

    const data = await Promise.all(rows.map((r) => this.withCounts(r)));
    return paginate(data, total, query.page, query.limit);
  }

  async findOne(user: AuthUser, id: string) {
    const teacher = await this.prisma.teacherProfile.findFirst({
      where: { id, deletedAt: null },
      include: {
        ...TEACHER_INCLUDE,
        circleRoles: {
          select: {
            id: true,
            role: true,
            startedAt: true,
            endedAt: true,
            note: true,
            circle: { select: { id: true, name: true, code: true, isActive: true } },
          },
          orderBy: { startedAt: 'desc' },
        },
      },
    });
    if (!teacher) throw new NotFoundException('المعلم غير موجود');

    // Teachers may only open their own file; supervisors only teachers in their circles.
    if (user.role === Role.TEACHER && user.teacherId !== id) {
      throw new ForbiddenException('لا تملك صلاحية الوصول إلى بيانات هذا المعلم');
    }
    if (user.role === Role.SUPERVISOR) {
      const supervised = await this.acl.supervisorCircleIds(user);
      const shares = teacher.circleRoles.some((r) => !r.endedAt && supervised.includes(r.circle.id));
      if (!shares) throw new ForbiddenException('لا تملك صلاحية الوصول إلى بيانات هذا المعلم');
    }
    if (user.role === Role.PARENT) throw new ForbiddenException('لا تملك صلاحية الوصول');

    return this.withCounts(teacher);
  }

  async create(actor: AuthUser, dto: CreateTeacherDto) {
    const nameTaken = await this.prisma.user.findUnique({ where: { username: dto.username } });
    if (nameTaken) throw new ConflictException('اسم المستخدم مستخدم مسبقاً');
    if (dto.email) {
      const emailTaken = await this.prisma.user.findFirst({
        where: { email: dto.email, deletedAt: null },
        select: { id: true },
      });
      if (emailTaken) throw new ConflictException('البريد الإلكتروني مستخدم مسبقاً');
    }

    if (dto.nationalId) {
      const dup = await this.prisma.teacherProfile.findUnique({ where: { nationalId: dto.nationalId } });
      if (dup) throw new ConflictException('رقم الهوية مسجل مسبقاً لمعلم آخر');
    }

    const rounds = parseInt(this.config.get('BCRYPT_ROUNDS') || '10', 10);
    const teacher = await this.prisma.teacherProfile.create({
      data: {
        nationalId: dto.nationalId || null,
        birthDate: dto.birthDate ? new Date(dto.birthDate) : null,
        gender: dto.gender,
        address: dto.address,
        qualification: dto.qualification,
        specialization: dto.specialization,
        memorizedParts: dto.memorizedParts ?? 0,
        employmentType: dto.employmentType,
        hireDate: dto.hireDate ? new Date(dto.hireDate) : null,
        salary: dto.salary ?? null,
        notes: dto.notes,
        isActive: dto.isActive ?? true,
        user: {
          create: {
            username: dto.username,
            email: dto.email || null,
            passwordHash: await bcrypt.hash(dto.password, rounds),
            fullName: dto.fullName,
            role: Role.TEACHER,
            // Created by the management, so the password must be replaced on first login.
            phone: dto.phone || null,
            isActive: dto.isActive ?? true,
          },
        },
      },
      include: TEACHER_INCLUDE,
    });

    await this.activity.log({
      userId: actor.id,
      action: 'TEACHER_CREATE',
      summary: `إضافة معلم جديد: ${dto.fullName}`,
      entityType: 'Teacher',
      entityId: teacher.id,
    });

    return teacher;
  }

  async update(actor: AuthUser, id: string, dto: UpdateTeacherDto) {
    const teacher = await this.prisma.teacherProfile.findFirst({
      where: { id, deletedAt: null },
      include: { user: true },
    });
    if (!teacher) throw new NotFoundException('المعلم غير موجود');

    // A teacher may only edit their own contact details, never employment data.
    if (actor.role === Role.TEACHER) {
      if (actor.teacherId !== id) throw new ForbiddenException('لا تملك صلاحية التعديل');
      const allowed = ['phone', 'email', 'address', 'qualification', 'specialization'];
      const attempted = Object.keys(dto).filter((k) => dto[k] !== undefined && !allowed.includes(k));
      if (attempted.length) {
        throw new ForbiddenException('لا تملك صلاحية تعديل البيانات الإدارية');
      }
    }

    if (dto.nationalId && dto.nationalId !== teacher.nationalId) {
      const dup = await this.prisma.teacherProfile.findUnique({ where: { nationalId: dto.nationalId } });
      if (dup) throw new ConflictException('رقم الهوية مسجل مسبقاً لمعلم آخر');
    }

    const updated = await this.prisma.teacherProfile.update({
      where: { id },
      data: {
        nationalId: dto.nationalId === '' ? null : dto.nationalId,
        birthDate: dto.birthDate ? new Date(dto.birthDate) : undefined,
        gender: dto.gender,
        address: dto.address,
        qualification: dto.qualification,
        specialization: dto.specialization,
        memorizedParts: dto.memorizedParts,
        employmentType: dto.employmentType,
        hireDate: dto.hireDate ? new Date(dto.hireDate) : undefined,
        salary: dto.salary,
        notes: dto.notes,
        isActive: dto.isActive,
        user: {
          update: {
            fullName: dto.fullName,
            ...(dto.username ? { username: dto.username } : {}),
            email: dto.email === '' ? null : dto.email,
            phone: dto.phone === '' ? null : dto.phone,
            ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
            ...(dto.password
              ? { passwordHash: await bcrypt.hash(dto.password, parseInt(this.config.get('BCRYPT_ROUNDS') || '10', 10)) }
              : {}),
          },
        },
      },
      include: TEACHER_INCLUDE,
    });

    await this.activity.log({
      userId: actor.id,
      action: 'TEACHER_UPDATE',
      summary: `تعديل بيانات المعلم: ${updated.user.fullName}`,
      entityType: 'Teacher',
      entityId: id,
    });

    return updated;
  }

  async remove(actor: AuthUser, id: string) {
    const teacher = await this.prisma.teacherProfile.findFirst({
      where: { id, deletedAt: null },
      include: { user: true, circleRoles: { where: { endedAt: null } } },
    });
    if (!teacher) throw new NotFoundException('المعلم غير موجود');

    const now = new Date();
    await this.prisma.$transaction([
      // Close open circle assignments so circles do not keep a deleted teacher.
      this.prisma.circleTeacher.updateMany({
        where: { teacherId: id, endedAt: null },
        data: { endedAt: now, note: 'حذف المعلم من النظام' },
      }),
      this.prisma.teacherProfile.update({
        where: { id },
        data: { deletedAt: now, isActive: false },
      }),
      this.prisma.user.update({
        where: { id: teacher.userId },
        data: { deletedAt: now, isActive: false },
      }),
      this.prisma.refreshToken.updateMany({
        where: { userId: teacher.userId, revokedAt: null },
        data: { revokedAt: now },
      }),
    ]);

    await this.activity.log({
      userId: actor.id,
      action: 'TEACHER_DELETE',
      summary: `حذف المعلم: ${teacher.user.fullName}`,
      entityType: 'Teacher',
      entityId: id,
    });

    return { message: 'تم حذف المعلم' };
  }

  /** Aggregate view a teacher sees on their own dashboard. */
  async myOverview(user: AuthUser) {
    if (!user.teacherId) throw new ForbiddenException('هذا الحساب غير مرتبط بملف معلم');
    const circleIds = await this.acl.teacherCircleIds(user);

    const [circles, studentsCount, todayAttendance, pendingExamRequests, recentRecitations] =
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
            isActive: true,
            _count: { select: { students: { where: { deletedAt: null, status: 'ACTIVE' } } } },
          },
        }),
        this.prisma.student.count({
          where: { circleId: { in: circleIds }, deletedAt: null, status: 'ACTIVE' },
        }),
        this.prisma.attendance.count({
          where: { circleId: { in: circleIds }, date: this.today() },
        }),
        this.prisma.examRequest.count({
          where: { teacherId: user.teacherId, status: 'PENDING' },
        }),
        this.prisma.recitation.count({
          where: { teacherId: user.teacherId, date: { gte: this.daysAgo(7) }, deletedAt: null },
        }),
      ]);

    return {
      circles,
      studentsCount,
      todayAttendanceRecorded: todayAttendance,
      pendingExamRequests,
      recitationsLast7Days: recentRecitations,
    };
  }

  private async withCounts(teacher: any) {
    const activeCircleIds = (teacher.circleRoles || [])
      .filter((r: any) => !r.endedAt)
      .map((r: any) => r.circle.id);

    const studentsCount = activeCircleIds.length
      ? await this.prisma.student.count({
          where: { circleId: { in: activeCircleIds }, deletedAt: null, status: 'ACTIVE' },
        })
      : 0;

    return { ...teacher, studentsCount };
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
}
