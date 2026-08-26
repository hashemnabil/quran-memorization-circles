import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { createHash, randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { ActivityService } from '../common/services/activity.service';
import { UploadsService } from '../uploads/uploads.service';
import { AuthUser } from '../common/decorators';
import { ChangePasswordDto, LoginDto, UpdateProfileDto } from './dto/auth.dto';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly activity: ActivityService,
    private readonly uploads: UploadsService,
  ) {}

  private hashToken(token: string) {
    return createHash('sha256').update(token).digest('hex');
  }

  private async issueTokens(user: { id: string; username: string; role: string }, userAgent?: string) {
    const payload = { sub: user.id, username: user.username, role: user.role };

    const accessToken = await this.jwt.signAsync(payload, {
      secret: this.config.get('JWT_ACCESS_SECRET'),
      expiresIn: this.config.get('JWT_ACCESS_EXPIRES_IN') || '30m',
    });

    // Opaque refresh token: only its hash is stored, so a DB leak cannot mint sessions.
    const refreshToken = randomBytes(48).toString('hex');
    const days = parseInt(String(this.config.get('JWT_REFRESH_EXPIRES_IN') || '7d'), 10) || 7;
    const expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000);

    await this.prisma.refreshToken.create({
      data: {
        userId: user.id,
        tokenHash: this.hashToken(refreshToken),
        expiresAt,
        userAgent: userAgent?.slice(0, 250),
      },
    });

    return { accessToken, refreshToken, expiresAt };
  }

  /** Username + password — nothing else stands between the user and their session. */
  async login(dto: LoginDto, userAgent?: string) {
    const user = await this.prisma.user.findFirst({
      where: { username: dto.username.toLowerCase().trim(), deletedAt: null },
      include: {
        teacher: { select: { id: true } },
        parent: { select: { id: true } },
      },
    });

    // Same message for unknown name and wrong password to avoid enumeration.
    if (!user || !(await bcrypt.compare(dto.password, user.passwordHash))) {
      throw new UnauthorizedException('اسم المستخدم أو كلمة المرور غير صحيحة');
    }
    if (!user.isActive) {
      throw new UnauthorizedException('تم إيقاف هذا الحساب، يرجى مراجعة الإدارة');
    }

    const tokens = await this.issueTokens(user, userAgent);

    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    await this.activity.log({
      userId: user.id,
      action: 'LOGIN',
      summary: `تسجيل دخول: ${user.fullName}`,
      entityType: 'User',
      entityId: user.id,
    });

    return { ...tokens, user: this.publicUser(user) };
  }

  async refresh(refreshToken: string, userAgent?: string) {
    const stored = await this.prisma.refreshToken.findFirst({
      where: { tokenHash: this.hashToken(refreshToken), revokedAt: null },
      include: {
        user: {
          include: { teacher: { select: { id: true } }, parent: { select: { id: true } } },
        },
      },
    });

    if (!stored || stored.expiresAt < new Date()) {
      throw new UnauthorizedException('الجلسة منتهية، يرجى تسجيل الدخول مجدداً');
    }
    if (!stored.user || stored.user.deletedAt || !stored.user.isActive) {
      throw new UnauthorizedException('الحساب غير متاح');
    }

    // Rotate: the presented token is burned and a fresh pair is issued.
    await this.prisma.refreshToken.update({
      where: { id: stored.id },
      data: { revokedAt: new Date() },
    });

    const tokens = await this.issueTokens(stored.user, userAgent);
    return { ...tokens, user: this.publicUser(stored.user) };
  }

  async logout(refreshToken?: string, userId?: string) {
    if (refreshToken) {
      await this.prisma.refreshToken.updateMany({
        where: { tokenHash: this.hashToken(refreshToken), revokedAt: null },
        data: { revokedAt: new Date() },
      });
    } else if (userId) {
      await this.prisma.refreshToken.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    }
    return { message: 'تم تسجيل الخروج بنجاح' };
  }

  async me(user: AuthUser) {
    const found = await this.prisma.user.findUnique({
      where: { id: user.id },
      include: {
        teacher: true,
        parent: true,
      },
    });
    if (!found) throw new UnauthorizedException();

    const supervisedCircles =
      found.role === 'SUPERVISOR'
        ? await this.prisma.circle.count({ where: { supervisorId: found.id, deletedAt: null } })
        : 0;

    return {
      ...this.publicUser(found),
      phone: found.phone,
      avatarUrl: found.avatarUrl,
      jobTitle: found.jobTitle,
      specialization: found.specialization,
      lastLoginAt: found.lastLoginAt,
      teacherProfile: found.teacher,
      parentProfile: found.parent,
      supervisedCircles,
    };
  }

  /**
   * Self-service profile edit. The username is deliberately not editable here:
   * it is the login identity and only the administration may reassign it.
   */
  async updateProfile(user: AuthUser, dto: UpdateProfileDto) {
    const current = await this.prisma.user.findUnique({
      where: { id: user.id },
      select: { avatarUrl: true },
    });

    if (dto.email) {
      const taken = await this.prisma.user.findFirst({
        where: { email: dto.email, id: { not: user.id }, deletedAt: null },
        select: { id: true },
      });
      if (taken) throw new BadRequestException('البريد الإلكتروني مستخدم مسبقاً');
    }

    const updated = await this.prisma.user.update({
      where: { id: user.id },
      data: {
        ...(dto.fullName !== undefined ? { fullName: dto.fullName } : {}),
        ...(dto.email !== undefined ? { email: dto.email || null } : {}),
        ...(dto.phone !== undefined ? { phone: dto.phone || null } : {}),
        ...(dto.avatarUrl !== undefined ? { avatarUrl: dto.avatarUrl || null } : {}),
      },
      include: { teacher: { select: { id: true } }, parent: { select: { id: true } } },
    });

    // The old picture is now unreferenced — replaced or cleared — so it is
    // removed from storage rather than left behind as an orphan.
    if (dto.avatarUrl !== undefined) {
      await this.uploads.removeIfReplaced(current?.avatarUrl, updated.avatarUrl);
    }

    await this.activity.log({
      userId: user.id,
      action: 'PROFILE_UPDATE',
      summary: `تحديث الملف الشخصي: ${updated.fullName}`,
      entityType: 'User',
      entityId: user.id,
    });

    return this.publicUser(updated);
  }

  async changePassword(user: AuthUser, dto: ChangePasswordDto) {
    const found = await this.prisma.user.findUnique({ where: { id: user.id } });
    if (!found) throw new UnauthorizedException();

    if (!(await bcrypt.compare(dto.currentPassword, found.passwordHash))) {
      throw new BadRequestException('كلمة المرور الحالية غير صحيحة');
    }
    if (dto.currentPassword === dto.newPassword) {
      throw new BadRequestException('كلمة المرور الجديدة يجب أن تختلف عن الحالية');
    }

    const rounds = parseInt(this.config.get('BCRYPT_ROUNDS') || '10', 10);
    await this.prisma.user.update({
      where: { id: user.id },
      data: { passwordHash: await bcrypt.hash(dto.newPassword, rounds) },
    });

    // Force every other session to re-authenticate with the new password.
    await this.prisma.refreshToken.updateMany({
      where: { userId: user.id, revokedAt: null },
      data: { revokedAt: new Date() },
    });

    await this.activity.log({
      userId: user.id,
      action: 'CHANGE_PASSWORD',
      summary: `تغيير كلمة المرور: ${found.fullName}`,
      entityType: 'User',
      entityId: user.id,
    });

    return { message: 'تم تغيير كلمة المرور بنجاح، يرجى تسجيل الدخول مجدداً' };
  }

  private publicUser(user: any) {
    return {
      id: user.id,
      username: user.username,
      email: user.email ?? null,
      fullName: user.fullName,
      role: user.role,
      avatarUrl: user.avatarUrl ?? null,
      phone: user.phone ?? null,
      isActive: user.isActive,
      teacherId: user.teacher?.id ?? null,
      parentId: user.parent?.id ?? null,
    };
  }
}
