import { test } from 'node:test';
import assert from 'node:assert/strict';
import { canManageAccount, rolePermitted } from './founder-policy';

test('administrator bypass cannot grant access to founder-only endpoints', () => {
  for (const role of ['ADMIN', 'SUPERVISOR', 'TEACHER', 'STUDENT', 'PARENT', 'SUPPORT', 'EXAM_COMMITTEE']) {
    assert.equal(rolePermitted(role, ['FOUNDER']), false);
  }
  assert.equal(rolePermitted('FOUNDER', ['FOUNDER']), true);
  assert.equal(rolePermitted('ADMIN', ['TEACHER']), true);
  assert.equal(rolePermitted('FOUNDER', ['TEACHER']), false);
});

test('normal account APIs cannot create, promote, demote or modify founders', () => {
  assert.equal(canManageAccount(undefined, 'FOUNDER'), false);
  assert.equal(canManageAccount('ADMIN', 'FOUNDER'), false);
  assert.equal(canManageAccount('FOUNDER', 'ADMIN'), false);
  assert.equal(canManageAccount('FOUNDER'), false);
  assert.equal(canManageAccount('TEACHER', 'SUPERVISOR'), true);
});
