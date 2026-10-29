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
    if (!required || required.length === 0) return true;

    const { user } = context.switchToHttp().getRequest();
    if (!user) throw new ForbiddenException('غير مصرح');

    // Preserve school administrator access without granting founder ownership.
    if (!rolePermitted(user.role, required)) {
      throw new ForbiddenException('لا تملك الصلاحية للقيام بهذا الإجراء');
    }
    return true;
  }
}
