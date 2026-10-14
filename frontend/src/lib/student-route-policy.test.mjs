import { test } from 'node:test';
import assert from 'node:assert/strict';
import { canVisitStudentRoute } from './student-route-policy.js';
test('students can reach their files/profile while management pages remain closed', () => {
  for (const path of ['/student', '/my-files', '/profile']) assert.equal(canVisitStudentRoute(path), true);
  for (const path of ['/students', '/users', '/settings', '/my-files/other-account']) assert.equal(canVisitStudentRoute(path), false);
  assert.equal(canVisitStudentRoute('/my-files', true), false);
  assert.equal(canVisitStudentRoute('/student', true), true);
});
