import assert from 'node:assert/strict';
import { test } from 'node:test';
import { rememberOfflineLogin, unlockOfflineLogin, forgetAccountOfflineLogin } from './offline-login';

test('offline unlock survives a local lock, restores no tokens and explicit device removal clears account aliases', async () => {
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
  assert.equal('accessToken' in session, false);
  assert.equal('refreshToken' in session, false);
  await rememberOfflineLogin('renamed', 'correct-password', user);
  forgetAccountOfflineLogin(user.id, 'renamed');
  await assert.rejects(unlockOfflineLogin('teacher', 'correct-password'));
  await assert.rejects(unlockOfflineLogin('renamed', 'correct-password'));
  const pendingEncryption = rememberOfflineLogin('teacher', 'correct-password', user);
  forgetAccountOfflineLogin(user.id, 'teacher');
  await pendingEncryption;
  await assert.rejects(unlockOfflineLogin('teacher', 'correct-password'));
});

test('an encrypted legacy parent login cannot unlock the retired portal offline', async () => {
  const storage = new Map<string, string>();
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
    removeItem: (key: string) => storage.delete(key),
  } });
  await rememberOfflineLogin('legacy-parent', 'password', { id: 'legacy-parent', username: 'legacy-parent', fullName: 'Legacy', role: 'PARENT', isActive: true } as any);
  await assert.rejects(unlockOfflineLogin('legacy-parent', 'password'));
  assert.ok(storage.has('qc.offlineLogin.v1:legacy-parent'));
});
