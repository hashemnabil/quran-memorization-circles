import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Role } from '@prisma/client';
import { PUBLIC_KEY, ROLES_KEY } from '../../common/decorators';
import { rolePermitted } from '../founder-policy';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const required = this.reflector.getAllAndOverride<Role[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    const { user } = context.switchToHttp().getRequest();
    const request = context.switchToHttp().getRequest();
    if (user?.mustChangePassword && !/\/auth\/(me|change-password|logout)(?:\?|$)/.test(request.originalUrl || request.url || '')) throw new ForbiddenException('يجب تغيير كلمة المرور المؤقتة أولاً');
    if (!user) throw new ForbiddenException('غير مصرح');
    if (!required || required.length === 0) {
      if (user.role === Role.FOUNDER && !/\/auth(?:\/|$)/.test(request.originalUrl || request.url || '')) {
        request.user = { ...user, role: Role.ADMIN };
      }
      return true;
    }

    if (!rolePermitted(user.role, required)) {
      throw new ForbiddenException('لا تملك الصلاحية للقيام بهذا الإجراء');
    }
    // The founder retains the founder identity on owner-only endpoints. School
    // services receive the administrator view on ordinary management endpoints.
    if (user.role === Role.FOUNDER && !(required.includes(Role.FOUNDER) && !required.includes(Role.ADMIN))) {
      request.user = { ...user, role: Role.ADMIN };
    }
    return true;
  }
}
