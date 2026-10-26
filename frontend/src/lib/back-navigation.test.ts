import assert from 'node:assert/strict';
import { test } from 'node:test';
import { backDestination } from './back-navigation';

test('deep links return to their parent rather than exiting or opening login', () => {
  for (const [path, parent] of [
    ['/profile/settings/notifications/sound', '/profile/settings'],
    ['/profile/settings', '/profile'], ['/profile', '/'],
    ['/chat/42', '/chat'], ['/circles/42', '/circles'],
    ['/courses/42', '/courses'], ['/students/42', '/students'], ['/support/42', '/support'],
  ]) assert.equal(backDestination(path), parent);
  for (const path of ['/', '/student', '/login']) assert.equal(backDestination(path), null);
});
