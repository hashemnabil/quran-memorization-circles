import { test } from 'node:test';
import assert from 'node:assert/strict';
import { backAction, parentRoute } from './back-navigation';
test('deep links return to their parent and login is never a signed-in back destination', () => {
  assert.equal(parentRoute('/profile/settings'), '/profile');
  assert.equal(parentRoute('/chat/one'), '/chat');
  assert.equal(parentRoute('/circles/one'), '/circles');
  assert.equal(parentRoute('/prayer-times/reminders'), '/prayer-times');
  assert.deepEqual(backAction('/profile', 1, '/login', 10000, 0), { kind: 'parent', to: '/' });
  assert.equal(backAction('/profile', 2, '/chat', 10000, 0).kind, 'history');
});
test('root requires a second press within two seconds and otherwise renews the hint', () => {
  assert.equal(backAction('/', 0, undefined, 10000, 0).kind, 'hint');
  assert.equal(backAction('/', 0, undefined, 11000, 10000).kind, 'exit');
  assert.equal(backAction('/', 0, undefined, 12001, 10000).kind, 'hint');
});
