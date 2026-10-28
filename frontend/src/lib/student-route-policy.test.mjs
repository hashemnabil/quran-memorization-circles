import { test } from 'node:test';
import assert from 'node:assert/strict';
import { canVisitStudentRoute } from './student-route-policy.js';
test('students can reach their files/profile while management pages remain closed', () => {
  for (const path of ['/prayer-times', '/prayer-times/reminders', '/profile/settings/notifications/sound', '/profile/settings', '/community/users/me', '/community/posts', '/community/users/00000000-0000-4000-8000-000000000001']) {
    assert.equal(canVisitStudentRoute(path), true, path);
    assert.equal(canVisitStudentRoute(path, true), false, path);
  }
  for (const path of ['/student', '/my-files', '/profile', '/notifications', '/verify-profile', '/chat', '/support', '/about', '/donations', '/settings/offline', '/chat/00000000-0000-4000-8000-000000000001', '/support/00000000-0000-4000-8000-000000000001']) assert.equal(canVisitStudentRoute(path), true, path);
  for (const path of ['/students', '/users', '/settings', '/my-files/other-account', '/profile-reviews/students', '/chat/../users', '/support/one/extra']) assert.equal(canVisitStudentRoute(path), false, path);
  for (const path of ['/notifications', '/chat', '/verify-profile', '/support']) assert.equal(canVisitStudentRoute(path, true), false);
  assert.equal(canVisitStudentRoute('/my-files', true), false);
  assert.equal(canVisitStudentRoute('/student', true), true);
});
