import { Body, ConflictException, Controller, ForbiddenException, Post, UnauthorizedException } from '@nestjs/common';
import { PickType } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';
import { Prisma, Role } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { AuthUser, CurrentUser, Roles } from '../common/decorators';
import { CreateUserDto } from '../users/dto/user.dto';
import { isReservedUsername } from '../common/validators/username';
import { PrismaService } from '../prisma/prisma.service';

export class CreateFounderDto extends PickType(CreateUserDto, ['username', 'fullName', 'password'] as const) {
  @MinLength(12, { message: 'كلمة المرور المؤقتة للمؤسس الجديد يجب ألا تقل عن 12 حرفاً' })
  password: string;

  @IsString() @MinLength(1) @MaxLength(128)
  currentPassword: string;
}

@Controller('founder/accounts')
@Roles(Role.FOUNDER)
export class FounderAccountsController {
  constructor(private readonly prisma: PrismaService) {}

  @Post()
  async create(@CurrentUser() actor: AuthUser, @Body() dto: CreateFounderDto) {
    const current = await this.prisma.user.findFirst({ where: { id: actor.id, role: Role.FOUNDER, isActive: true, deletedAt: null }, select: { passwordHash: true, mustChangePassword: true } });
    if (!current || !await bcrypt.compare(dto.currentPassword, current.passwordHash)) throw new ForbiddenException('تعذر تأكيد هوية المؤسس؛ تحقق من كلمة مرور حسابك');
    if (current.mustChangePassword) throw new ForbiddenException('غيّر كلمة المرور المؤقتة لحسابك أولاً');
    if (isReservedUsername(dto.username)) throw new ConflictException('اسم المستخدم محجوز');
    const passwordHash = await bcrypt.hash(dto.password, 12);
    try {
      return await this.prisma.$transaction(async tx => {
        await tx.$queryRaw`SELECT id FROM users WHERE id = ${actor.id} FOR UPDATE`;
        // Recheck identity in the transaction so a revoked role/password cannot
        // complete this sensitive operation using an earlier verification.
        const verified = await tx.user.findFirst({ where: { id: actor.id, role: Role.FOUNDER, passwordHash: current.passwordHash, isActive: true, deletedAt: null, mustChangePassword: false }, select: { id: true } });
        if (!verified) throw new UnauthorizedException('تغيرت الجلسة أو صلاحيات الحساب؛ أعد تسجيل الدخول');
        const account = await tx.user.create({ data: { username: dto.username, fullName: dto.fullName.trim(), passwordHash, role: Role.FOUNDER, isActive: true, mustChangePassword: true }, select: { id: true, username: true, fullName: true, role: true, mustChangePassword: true } });
        await tx.activityLog.create({ data: { userId: actor.id, action: 'FOUNDER_ACCOUNT_CREATE', summary: `إنشاء حساب مؤسس إضافي: ${account.username}`, entityType: 'User', entityId: account.id } });
        return account;
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw new ConflictException('اسم المستخدم موجود بالفعل؛ لا يُعدّل أي حساب قائم من هذا الإجراء');
      throw error;
    }
  }
}
