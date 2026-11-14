import 'reflect-metadata';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { UnauthorizedException } from '@nestjs/common';
import { Role } from '@prisma/client';
import { JwtStrategy } from './jwt.strategy';
const base = { id: 'user', username: 'test', fullName: 'Test', email: null, role: Role.STUDENT, isActive: true, teacher: null, parent: null };
const validate = (changes: any, sessionActive = true, sid: string | undefined = 'session') => new JwtStrategy({ get: () => 'test-only-secret-for-unit-tests-123456789' } as any,
  { user: { findFirst: async () => ({ ...base, ...changes }) }, refreshToken: { findFirst: async () => sessionActive ? { id: 'session' } : null } } as any).validate({ sub: 'user', username: 'test', role: Role.STUDENT, sid });
test('access tokens require a current unrevoked refresh session', async () => {
  assert.equal((await validate({})).id, base.id);
  await assert.rejects(validate({}, false), UnauthorizedException);
  await assert.rejects(new JwtStrategy({ get: () => 'test-only-secret-for-unit-tests-123456789' } as any, { user: { findFirst: async () => base } } as any).validate({ sub: 'user', username: 'test', role: Role.STUDENT }), UnauthorizedException);
});
test('disabled parent portal, inactive accounts and inactive teacher profiles reject existing tokens', async () => {
  for (const changes of [{ role: Role.PARENT }, { isActive: false }, { role: Role.TEACHER, teacher: { id: 'teacher', isActive: false, deletedAt: null } }, { role: Role.TEACHER, teacher: null }]) {
    await assert.rejects(validate(changes), UnauthorizedException);
  }
});
