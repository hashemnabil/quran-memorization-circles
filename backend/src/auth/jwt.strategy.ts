import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser } from '../common/decorators';

export interface JwtPayload {
  sub: string;
  email: string;
  role: string;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    config: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.get<string>('JWT_ACCESS_SECRET'),
    });
  }

  /**
   * Re-reads the user on every request so deactivation / soft-deletion / role
   * changes take effect immediately instead of at token expiry.
   */
  async validate(payload: JwtPayload): Promise<AuthUser> {
    const user = await this.prisma.user.findFirst({
      where: { id: payload.sub, deletedAt: null },
      select: {
        id: true,
        email: true,
        fullName: true,
        role: true,
        isActive: true,
        teacher: { select: { id: true, isActive: true, deletedAt: true } },
        parent: { select: { id: true, deletedAt: true } },
      },
    });

    if (!user) throw new UnauthorizedException('المستخدم غير موجود');
    if (!user.isActive) throw new UnauthorizedException('تم إيقاف هذا الحساب، يرجى مراجعة الإدارة');

    return {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      role: user.role,
      teacherId: user.teacher && !user.teacher.deletedAt ? user.teacher.id : null,
      parentId: user.parent && !user.parent.deletedAt ? user.parent.id : null,
    };
  }
}
