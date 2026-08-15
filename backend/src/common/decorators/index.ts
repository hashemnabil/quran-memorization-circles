import { SetMetadata, createParamDecorator, ExecutionContext } from '@nestjs/common';
import { Role } from '@prisma/client';

export const ROLES_KEY = 'roles';
export const PUBLIC_KEY = 'isPublic';

/** Marks a route as accessible without authentication. */
export const Public = () => SetMetadata(PUBLIC_KEY, true);

/** Restricts a route to the given roles. */
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);

export interface AuthUser {
  id: string;
  email: string;
  fullName: string;
  role: Role;
  teacherId?: string | null;
  parentId?: string | null;
}

/** Injects the authenticated user (or one of its properties) into a handler. */
export const CurrentUser = createParamDecorator((data: keyof AuthUser | undefined, ctx: ExecutionContext) => {
  const request = ctx.switchToHttp().getRequest();
  const user: AuthUser = request.user;
  return data ? user?.[data] : user;
});
