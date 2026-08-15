import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma, Role } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import { ActivityService } from '../common/services/activity.service';
import { AuthUser } from '../common/decorators';
import { buildOrderBy, paginate } from '../common/dto/pagination.dto';
import { CreateUserDto, QueryUsersDto, ResetPasswordDto, UpdateUserDto } from './dto/user.dto';

const USER_SELECT = {
  id: true,
  fullName: true,
  role: true,
  email: true,
  phone: true,
  avatarUrl: true,
  isActive: true,
  mustChangePassword: true,
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
  ) {}

  private hash(password: string) {
    return bcrypt.hash(password, parseInt(this.config.get('BCRYPT_ROUNDS') || '10', 10));
  }

  async findAll(query: QueryUsersDto) {
    const where: Prisma.UserWhereInput = {
      deletedAt: null,
      ...(query.role ? { role: query.role } : {}),
      ...(query.isActive !== undefined ? { isActive: query.isActive } : {}),
      // Name, e-mail, phone, or the national id held on the teacher/parent profile.
      ...(query.search
        ? {
            OR: [
              { fullName: { contains: query.search, mode: 'insensitive' } },
              { email: { contains: query.search, mode: 'insensitive' } },
              { phone: { contains: query.search } },
              { teacher: { nationalId: { contains: query.search } } },
              { parent: { nationalId: { contains: query.search } } },
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
        parent: { include: { students: { where: { deletedAt: null }, select: { id: true, fullName: true } } } },
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
    const exists = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (exists) throw new ConflictException('البريد الإلكتروني مستخدم مسبقاً');

    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        passwordHash: await this.hash(dto.password),
        fullName: dto.fullName,
        role: dto.role,
        phone: dto.phone || null,
        isActive: dto.isActive ?? true,
        // The admin chose this password, so the user has to replace it.
        mustChangePassword: true,
        // Teachers and parents need a profile row to be attachable to circles / children.
        ...(dto.role === Role.TEACHER ? { teacher: { create: {} } } : {}),
        ...(dto.role === Role.PARENT ? { parent: { create: { phone: dto.phone || null } } } : {}),
      },
      select: USER_SELECT,
    });

    await this.activity.log({
      userId: actor.id,
      action: 'USER_CREATE',
      summary: `إنشاء مستخدم جديد: ${user.fullName} (${this.roleLabel(user.role)})`,
      entityType: 'User',
      entityId: user.id,
    });

    return user;
  }

  async update(actor: AuthUser, id: string, dto: UpdateUserDto) {
    const current = await this.prisma.user.findFirst({ where: { id, deletedAt: null } });
    if (!current) throw new NotFoundException('المستخدم غير موجود');

    if (dto.email && dto.email !== current.email) {
      const taken = await this.prisma.user.findUnique({ where: { email: dto.email } });
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
      if (dto.role === Role.PARENT) {
        await this.prisma.parentProfile.upsert({
          where: { userId: id },
          create: { userId: id },
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
        avatarUrl: dto.avatarUrl,
        isActive: dto.isActive,
        ...(dto.email && dto.email !== current.email ? { email: dto.email } : {}),
        // An admin-set password always has to be replaced by the user.
        ...(dto.password
          ? { passwordHash: await this.hash(dto.password), mustChangePassword: true }
          : {}),
      },
      select: USER_SELECT,
    });

    await this.activity.log({
      userId: actor.id,
      action: 'USER_UPDATE',
      summary: `تعديل بيانات المستخدم: ${user.fullName}`,
      entityType: 'User',
      entityId: user.id,
    });

    return user;
  }

  async resetPassword(actor: AuthUser, id: string, dto: ResetPasswordDto) {
    const user = await this.prisma.user.findFirst({ where: { id, deletedAt: null } });
    if (!user) throw new NotFoundException('المستخدم غير موجود');

    await this.prisma.user.update({
      where: { id },
      data: {
        passwordHash: await this.hash(dto.newPassword),
        mustChangePassword: dto.mustChangePassword ?? true,
      },
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
      this.prisma.parentProfile.updateMany({ where: { userId: id }, data: { deletedAt: now } }),
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

  /** Directory used by the chat "new conversation" picker. */
  async directory(user: AuthUser, search?: string) {
    const users = await this.prisma.user.findMany({
      where: {
        deletedAt: null,
        isActive: true,
        id: { not: user.id },
        ...(search
          ? {
              OR: [
                { fullName: { contains: search, mode: 'insensitive' } },
                { email: { contains: search, mode: 'insensitive' } },
              ],
            }
          : {}),
      },
      select: { id: true, fullName: true, role: true, avatarUrl: true },
      orderBy: { fullName: 'asc' },
      take: 50,
    });
    return users;
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
