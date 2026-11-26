import { test } from 'node:test';
import assert from 'node:assert/strict';
import { canManageAccount, rolePermitted } from './founder-policy';
import { RolesGuard } from './guards/roles.guard';
import { Role } from '@prisma/client';

test('administrator bypass cannot grant access to founder-only endpoints', () => {
  for (const role of ['ADMIN', 'SUPERVISOR', 'TEACHER', 'STUDENT', 'PARENT', 'SUPPORT', 'EXAM_COMMITTEE']) {
    assert.equal(rolePermitted(role, ['FOUNDER']), false);
  }
  assert.equal(rolePermitted('FOUNDER', ['FOUNDER']), true);
  assert.equal(rolePermitted('ADMIN', ['TEACHER']), true);
  assert.equal(rolePermitted('FOUNDER', ['TEACHER']), true);
});

test('normal account APIs cannot create, promote, demote or modify founders', () => {
  assert.equal(canManageAccount(undefined, 'FOUNDER'), false);
  assert.equal(canManageAccount('ADMIN', 'FOUNDER'), false);
  assert.equal(canManageAccount('FOUNDER', 'ADMIN'), false);
  assert.equal(canManageAccount('FOUNDER'), false);
  assert.equal(canManageAccount('TEACHER', 'SUPERVISOR'), true);
});

test('founder uses administrator permissions on school routes and keeps founder identity on owner routes', () => {
  let required: Role[] = [Role.ADMIN];
  const guard = new RolesGuard({ getAllAndOverride: (key: string) => key === 'roles' ? required : false } as any);
  const request: any = { user: { id: 'founder', role: Role.FOUNDER }, originalUrl: '/students' };
  const context: any = {
    getHandler: () => undefined,
    getClass: () => undefined,
    switchToHttp: () => ({ getRequest: () => request }),
  };
  assert.equal(guard.canActivate(context), true);
  assert.equal(request.user.role, Role.ADMIN);

  required = [Role.FOUNDER];
  request.user = { id: 'founder', role: Role.FOUNDER };
  request.originalUrl = '/founder/overview';
  assert.equal(guard.canActivate(context), true);
  assert.equal(request.user.role, Role.FOUNDER);

  required = [];
  request.originalUrl = '/community/posts';
  assert.equal(guard.canActivate(context), true);
  assert.equal(request.user.role, Role.ADMIN);

  request.user = { id: 'founder', role: Role.FOUNDER };
  request.originalUrl = '/auth/me';
  assert.equal(guard.canActivate(context), true);
  assert.equal(request.user.role, Role.FOUNDER);
});
