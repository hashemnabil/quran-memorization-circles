import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma, Role } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import { ActivityService } from '../common/services/activity.service';
import { AuthUser } from '../common/decorators';
import { buildOrderBy, paginate } from '../common/dto/pagination.dto';
import {
  BulkIdsDto,
  CreateUserDto,
  QueryStaffDto,
  QueryUsersDto,
  ResetPasswordDto,
  UpdateUserDto,
} from './dto/user.dto';
import { isReservedUsername } from '../common/validators/username';
import { AccessControlService } from '../common/services/access-control.service';
import { UploadsService } from '../uploads/uploads.service';

/** Everyone who works at the school, as opposed to students. */
export const STAFF_ROLES: Role[] = [Role.ADMIN, Role.SUPERVISOR, Role.TEACHER, Role.EXAM_COMMITTEE, Role.SUPPORT];

const USER_SELECT = {
  id: true,
  username: true,
  fullName: true,
  role: true,
  email: true,
  phone: true,
  jobTitle: true,
  specialization: true,
  avatarUrl: true,
  isActive: true,
  lastLoginAt: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.UserSelect;

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly activity: ActivityService,
    private readonly access: AccessControlService,
    private readonly uploads: UploadsService,
  ) {}

  private hash(password: string) {
    return bcrypt.hash(password, parseInt(this.config.get('BCRYPT_ROUNDS') || '10', 10));
  }

  async findAll(query: QueryUsersDto) {
    const where: Prisma.UserWhereInput = {
      deletedAt: null,
      ...(query.role ? { role: query.role } : {}),
      ...(query.isActive !== undefined ? { isActive: query.isActive } : {}),
      // Name, e-mail, phone, or the national id held on the teacher/student profile.
      ...(query.search
        ? {
            OR: [
              { fullName: { contains: query.search, mode: 'insensitive' } },
              { username: { contains: query.search, mode: 'insensitive' } },
              { email: { contains: query.search, mode: 'insensitive' } },
              { phone: { contains: query.search } },
              { teacher: { nationalId: { contains: query.search } } },
              { student: { nationalId: { contains: query.search } } },
            ],
          }
        : {}),
    };

    const [data, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({
        where,
        select: USER_SELECT,
        orderBy: buildOrderBy(query.sortBy, query.sortOrder, [
          'fullName',
          'username',
          'email',
          'role',
          'createdAt',
          'lastLoginAt',
        ]),
        skip: query.skip,
        take: query.take,
      }),
      this.prisma.user.count({ where }),
    ]);

    return paginate(data, total, query.page, query.limit);
  }

  async findOne(id: string) {
    const user = await this.prisma.user.findFirst({
      where: { id, deletedAt: null },
      select: {
        ...USER_SELECT,
        teacher: true,
        student: true,
        supervisedCircles: {
          where: { deletedAt: null },
          select: { id: true, name: true, code: true, isActive: true },
        },
      },
    });
    if (!user) throw new NotFoundException('المستخدم غير موجود');
    return user;
  }

  async create(actor: AuthUser, dto: CreateUserDto) {
    await this.assertUsernameFree(dto.username);
    if (dto.email) {
      const emailTaken = await this.prisma.user.findFirst({
        where: { email: dto.email, deletedAt: null },
        select: { id: true },
      });
      if (emailTaken) throw new ConflictException('البريد الإلكتروني مستخدم مسبقاً');
    }

    // Generate a student code if creating a student account.
    const genStudentCode = () => `ST-${String(Date.now()).slice(-8)}-${Math.floor(Math.random() * 1000)
      .toString()
      .padStart(3, '0')}`;

    const user = await this.prisma.user.create({
      data: {
        username: dto.username,
        email: dto.email || null,
        passwordHash: await this.hash(dto.password),
        fullName: dto.fullName,
        role: dto.role,
        phone: dto.phone || null,
        jobTitle: dto.jobTitle || null,
        specialization: dto.specialization || null,
        avatarUrl: dto.avatarUrl || null,
        isActive: dto.isActive ?? true,
        // Teachers need a profile row to be attachable to circles.
        ...(dto.role === Role.TEACHER ? { teacher: { create: {} } } : {}),
        // Students get a student row linked to the user so their account maps to their profile.
        ...(dto.role === Role.STUDENT
          ? { student: { create: { code: genStudentCode(), fullName: dto.fullName } } }
          : {}),
      },
      select: USER_SELECT,
    });

    await this.activity.log({
      userId: actor.id,
      action: 'USER_CREATE',
      summary: `إنشاء مستخدم جديد: ${user.fullName} (${this.roleLabel(user.role)}) باسم الدخول ${user.username}`,
      entityType: 'User',
      entityId: user.id,
    });

    return user;
  }

  async update(actor: AuthUser, id: string, dto: UpdateUserDto) {
    const current = await this.prisma.user.findFirst({ where: { id, deletedAt: null } });
    if (!current) throw new NotFoundException('المستخدم غير موجود');

    if (dto.username && dto.username !== current.username) {
      await this.assertUsernameFree(dto.username);
    }
    if (dto.email && dto.email !== current.email) {
      const taken = await this.prisma.user.findFirst({
        where: { email: dto.email, deletedAt: null },
        select: { id: true },
      });
      if (taken) throw new ConflictException('البريد الإلكتروني مستخدم مسبقاً');
    }

    if (dto.role && dto.role !== current.role) {
      if (current.role === Role.ADMIN) {
        await this.assertNotLastAdmin(id);
      }
      // Make sure the profile matching the new role exists.
      if (dto.role === Role.TEACHER) {
        await this.prisma.teacherProfile.upsert({
          where: { userId: id },
          create: { userId: id },
          update: { deletedAt: null },
        });
      }
      if (dto.role === Role.STUDENT) {
        const code = genStudentCode();
        await this.prisma.student.upsert({
          where: { userId: id },
          create: { userId: id, code, fullName: dto.fullName },
          update: { deletedAt: null },
        });
      }
    }

    const user = await this.prisma.user.update({
      where: { id },
      data: {
        fullName: dto.fullName,
        role: dto.role,
        phone: dto.phone === '' ? null : dto.phone,
        jobTitle: dto.jobTitle === '' ? null : dto.jobTitle,
        specialization: dto.specialization === '' ? null : dto.specialization,
        avatarUrl: dto.avatarUrl,
        isActive: dto.isActive,
        ...(dto.username && dto.username !== current.username ? { username: dto.username } : {}),
        ...(dto.email !== undefined ? { email: dto.email || null } : {}),
        ...(dto.password ? { passwordHash: await this.hash(dto.password) } : {}),
      },
      select: USER_SELECT,
    });

    if (dto.avatarUrl !== undefined) {
      await this.uploads.removeIfReplaced(current.avatarUrl, user.avatarUrl);
    }

    await this.activity.log({
      userId: actor.id,
      action: 'USER_UPDATE',
      summary: `تعديل بيانات المستخدم: ${user.fullName}`,
      entityType: 'User',
      entityId: user.id,
    });

    return user;

    function genStudentCode() {
      return `ST-${String(Date.now()).slice(-8)}-${Math.floor(Math.random() * 1000)
        .toString()
        .padStart(3, '0')}`;
    }
  }

  async resetPassword(actor: AuthUser, id: string, dto: ResetPasswordDto) {
    const user = await this.prisma.user.findFirst({ where: { id, deletedAt: null } });
    if (!user) throw new NotFoundException('المستخدم غير موجود');

    await this.prisma.user.update({
      where: { id },
      data: { passwordHash: await this.hash(dto.newPassword) },
    });

    // Any session created with the old password is invalidated.
    await this.prisma.refreshToken.updateMany({
      where: { userId: id, revokedAt: null },
      data: { revokedAt: new Date() },
    });

    await this.activity.log({
      userId: actor.id,
      action: 'USER_RESET_PASSWORD',
      summary: `إعادة تعيين كلمة مرور المستخدم: ${user.fullName}`,
      entityType: 'User',
      entityId: id,
    });

    return { message: 'تم إعادة تعيين كلمة المرور بنجاح' };
  }

  async setActive(actor: AuthUser, id: string, isActive: boolean) {
    const user = await this.prisma.user.findFirst({ where: { id, deletedAt: null } });
    if (!user) throw new NotFoundException('المستخدم غير موجود');
    if (id === actor.id && !isActive) throw new BadRequestException('لا يمكنك إيقاف حسابك الشخصي');
    if (!isActive && user.role === Role.ADMIN) await this.assertNotLastAdmin(id);

    const updated = await this.prisma.user.update({
      where: { id },
      data: { isActive },
      select: USER_SELECT,
    });

    if (!isActive) {
      await this.prisma.refreshToken.updateMany({
        where: { userId: id, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    }

    await this.activity.log({
      userId: actor.id,
      action: isActive ? 'USER_ACTIVATE' : 'USER_DEACTIVATE',
      summary: `${isActive ? 'تفعيل' : 'إيقاف'} حساب المستخدم: ${user.fullName}`,
      entityType: 'User',
      entityId: id,
    });

    return updated;
  }

  async remove(actor: AuthUser, id: string) {
    const user = await this.prisma.user.findFirst({ where: { id, deletedAt: null } });
    if (!user) throw new NotFoundException('المستخدم غير موجود');
    if (id === actor.id) throw new BadRequestException('لا يمكنك حذف حسابك الشخصي');
    if (user.role === Role.ADMIN) await this.assertNotLastAdmin(id);

    const now = new Date();
    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id },
        data: { deletedAt: now, isActive: false },
      }),
      this.prisma.teacherProfile.updateMany({ where: { userId: id }, data: { deletedAt: now, isActive: false } }),
      this.prisma.student.updateMany({ where: { userId: id }, data: { deletedAt: now } }),
      this.prisma.refreshToken.updateMany({ where: { userId: id, revokedAt: null }, data: { revokedAt: now } }),
    ]);

    await this.activity.log({
      userId: actor.id,
      action: 'USER_DELETE',
      summary: `حذف المستخدم: ${user.fullName}`,
      entityType: 'User',
      entityId: id,
    });

    return { message: 'تم حذف المستخدم' };
  }

  /**
   * Directory used by the chat "new conversation" picker. Restricted by role —
   * see `AccessControlService.contactableUserFilter` for the rules.
   */
  async directory(user: AuthUser, search?: string) {
    const allowed = await this.access.contactableUserFilter(user);
    if (allowed === null) return [];

    return this.prisma.user.findMany({
      where: {
        AND: [
          {
            deletedAt: null,
            isActive: true,
            id: { not: user.id },
            ...(search
              ? {
                  OR: [
                    { fullName: { contains: search, mode: 'insensitive' } },
                    { username: { contains: search, mode: 'insensitive' } },
                  ],
                }
              : {}),
          },
          allowed,
        ],
      },
      select: { id: true, fullName: true, role: true, avatarUrl: true, jobTitle: true },
      orderBy: { fullName: 'asc' },
      take: 50,
    });
  }

  /**
   * Unified staff directory — teachers, supervisors, administrators, support
   * and exam-committee members in one list instead of one page per category.
   */
  async staff(query: QueryStaffDto) {
    const where: Prisma.UserWhereInput = {
      deletedAt: null,
      role: query.role ? query.role : { in: STAFF_ROLES },
      ...(query.isActive !== undefined ? { isActive: query.isActive } : {}),
      ...(query.search
        ? {
            OR: [
              { fullName: { contains: query.search, mode: 'insensitive' } },
              { username: { contains: query.search, mode: 'insensitive' } },
              { phone: { contains: query.search } },
              { jobTitle: { contains: query.search, mode: 'insensitive' } },
              { specialization: { contains: query.search, mode: 'insensitive' } },
              { teacher: { nationalId: { contains: query.search } } },
            ],
          }
        : {}),
    };

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({
        where,
        select: {
          ...USER_SELECT,
          teacher: {
            select: {
              id: true,
              nationalId: true,
              qualification: true,
              specialization: true,
              employmentType: true,
              hireDate: true,
              memorizedParts: true,
              circleRoles: {
                where: { endedAt: null, circle: { deletedAt: null } },
                select: { role: true, circle: { select: { id: true, name: true, code: true } } },
              },
            },
          },
          supervisedCircles: {
            where: { deletedAt: null },
            select: { id: true, name: true, code: true },
          },
          coursesInstructed: {
            where: { deletedAt: null, isActive: true },
            select: { id: true, name: true, type: true },
          },
        },
        orderBy: buildOrderBy(query.sortBy, query.sortOrder, ['fullName', 'role', 'createdAt']),
        skip: query.skip,
        take: query.take,
      }),
      this.prisma.user.count({ where }),
    ]);

    // Flatten the two ways a person can be attached to a circle (as its teacher
    // or as its supervisor) into one column — a supervisor who also teaches
    // shows both, which is exactly the case the directory exists to make visible.
    const data = rows.map((u) => ({
      ...u,
      circles: [
        ...(u.teacher?.circleRoles ?? []).map((r) => ({ ...r.circle, relation: r.role as string })),
        ...u.supervisedCircles.map((c) => ({ ...c, relation: 'SUPERVISOR' })),
      ],
    }));

    return paginate(data, total, query.page, query.limit);
  }

  /**
   * Bulk soft-delete. Every id runs the same guards as the single delete, so a
   * "select all" click cannot remove the last administrator or the operator's
   * own account. Blocked rows are reported back rather than silently dropped.
   */
  async removeMany(actor: AuthUser, dto: BulkIdsDto) {
    const ids = [...new Set(dto.ids)];
    const users = await this.prisma.user.findMany({
      where: { id: { in: ids }, deletedAt: null },
      select: { id: true, fullName: true, role: true },
    });

    const skipped: { fullName: string; reason: string }[] = [];
    const deletable: typeof users = [];

    // Counted once and decremented locally: deleting several admins in one
    // batch must not slip past a check that only ever looks at the database.
    let remainingAdmins = await this.prisma.user.count({
      where: { role: Role.ADMIN, deletedAt: null, isActive: true },
    });

    for (const u of users) {
      if (u.id === actor.id) {
        skipped.push({ fullName: u.fullName, reason: 'لا يمكنك حذف حسابك الشخصي' });
        continue;
      }
      if (u.role === Role.ADMIN) {
        if (remainingAdmins <= 1) {
          skipped.push({ fullName: u.fullName, reason: 'يجب أن يبقى مدير عام واحد على الأقل' });
          continue;
        }
        remainingAdmins -= 1;
      }
      deletable.push(u);
    }

    const targetIds = deletable.map((u) => u.id);
    if (targetIds.length) {
      const now = new Date();
      await this.prisma.$transaction([
        this.prisma.user.updateMany({
          where: { id: { in: targetIds } },
          data: { deletedAt: now, isActive: false },
        }),
        this.prisma.teacherProfile.updateMany({
          where: { userId: { in: targetIds } },
          data: { deletedAt: now, isActive: false },
        }),
        this.prisma.student.updateMany({ where: { userId: { in: targetIds } }, data: { deletedAt: now } }),
        this.prisma.refreshToken.updateMany({
          where: { userId: { in: targetIds }, revokedAt: null },
          data: { revokedAt: now },
        }),
      ]);

      await this.activity.log({
        userId: actor.id,
        action: 'USER_BULK_DELETE',
        summary: `حذف ${targetIds.length} مستخدم`,
        entityType: 'User',
        metadata: { ids: targetIds },
      });
    }

    return {
      deleted: targetIds.length,
      skipped,
      message: skipped.length
        ? `تم حذف ${targetIds.length} مستخدم، وتم تخطي ${skipped.length}`
        : `تم حذف ${targetIds.length} مستخدم`,
    };
  }

  private async assertUsernameFree(username: string) {
    if (isReservedUsername(username)) {
      throw new ConflictException('اسم المستخدم محجوز، يرجى اختيار اسم آخر');
    }
    const taken = await this.prisma.user.findUnique({
      where: { username },
      select: { id: true },
    });
    if (taken) throw new ConflictException('اسم المستخدم مستخدم مسبقاً');
  }

  async stats() {
    const grouped = await this.prisma.user.groupBy({
      by: ['role'],
      where: { deletedAt: null },
      _count: { _all: true },
    });
    const active = await this.prisma.user.count({ where: { deletedAt: null, isActive: true } });
    const total = await this.prisma.user.count({ where: { deletedAt: null } });
    return {
      total,
      active,
      inactive: total - active,
      byRole: grouped.map((g) => ({ role: g.role, count: g._count._all })),
    };
  }

  private async assertNotLastAdmin(excludeId: string) {
    const remaining = await this.prisma.user.count({
      where: { role: Role.ADMIN, deletedAt: null, isActive: true, id: { not: excludeId } },
    });
    if (remaining === 0) {
      throw new BadRequestException('لا يمكن تنفيذ العملية: يجب أن يبقى مدير عام واحد على الأقل');
    }
  }

  private roleLabel(role: Role) {
    const labels: Record<Role, string> = {
      ADMIN: 'مدير عام',
      SUPERVISOR: 'مشرف',
      TEACHER: 'معلم',
      EXAM_COMMITTEE: 'لجنة اختبارات',
      PARENT: 'ولي أمر',
      SUPPORT: 'دعم فني',
    };
    return labels[role];
  }
}
