import assert from 'node:assert/strict';
import { test } from 'node:test';
import { rememberOfflineLogin, unlockOfflineLogin, forgetOfflineLogin } from './offline-login';

test('offline login survives logout, validates credentials and stores no plaintext credentials', async () => {
  const storage = new Map<string, string>();
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
    removeItem: (key: string) => storage.delete(key),
  } });
  const user = { id: 'account', username: 'teacher', fullName: 'Teacher', role: 'TEACHER' as const, isActive: true };
  await rememberOfflineLogin('teacher', 'correct-password', user, { accessToken: 'secret-access', refreshToken: 'secret-refresh' });
  localStorage.removeItem('qc.offlineUser');
  localStorage.removeItem('qc.accessToken');
  const raw = [...storage.values()].join();
  for (const secret of ['correct-password', 'secret-access', 'secret-refresh', 'Teacher']) assert.equal(raw.includes(secret), false);
  await assert.rejects(unlockOfflineLogin('teacher', 'wrong-password'));
  await assert.rejects(unlockOfflineLogin('another', 'correct-password'));
  const session = await unlockOfflineLogin(' Teacher ', 'correct-password');
  assert.equal(session.user.id, user.id);
  assert.equal(session.accessToken, 'secret-access');
  assert.equal(session.refreshToken, 'secret-refresh');
  forgetOfflineLogin('teacher');
  await assert.rejects(unlockOfflineLogin('teacher', 'correct-password'));
});
