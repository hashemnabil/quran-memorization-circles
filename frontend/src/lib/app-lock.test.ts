import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createAppLock, needsLocalLock } from './app-lock';

test('the lock boundary is exactly 60 seconds, including clock rollback and cold launch', () => {
  for (const elapsed of [30000, 59000, 59999]) assert.equal(needsLocalLock(100000, 100000 + elapsed), false);
  for (const elapsed of [60000, 120000]) assert.equal(needsLocalLock(100000, 100000 + elapsed), true);
  assert.equal(needsLocalLock(null, 100000), true);
  assert.equal(needsLocalLock(100001, 100000), true);
});
test('PIN survives restart, never stores plaintext, and isolates accounts without touching queued data', async () => {
  const values = new Map<string, string>([['pending-operations', 'keep-me']]);
  const storage = { get: async (key: string) => values.get(key) || null, set: async (key: string, value: string) => { values.set(key, value); }, remove: async (key: string) => { values.delete(key); } };
  const first = createAppLock(storage, () => 100000);
  await first.setup('a', '936285');
  assert(!JSON.stringify([...values]).includes('936285'));
  await first.depart('a', 100000);
  const restarted = createAppLock(storage, () => 160000);
  assert(needsLocalLock((await restarted.read('a'))!.departedAt, 160000));
  assert.equal(await restarted.read('b'), null);
  await assert.rejects(restarted.verify('b', '936285'));
  await restarted.verify('a', '936285');
  assert.equal((await restarted.read('a'))!.departedAt, null);
  assert.equal(values.get('pending-operations'), 'keep-me');
  await assert.rejects(restarted.setup('a', '975318'));
  await assert.rejects(restarted.deviceVerified('a'));
});
test('failed attempts and cooldown persist across restarts; correct PIN cannot bypass cooldown', async () => {
  const values = new Map<string, string>(); let time = 100000;
  const storage = { get: async (key: string) => values.get(key) || null, set: async (key: string, value: string) => { values.set(key, value); }, remove: async () => undefined };
  const lock = createAppLock(storage, () => time); await lock.setup('a', '936285');
  for (let attempt = 0; attempt < 5; attempt++) await assert.rejects(lock.verify('a', '123456'));
  const restarted = createAppLock(storage, () => time);
  await assert.rejects(restarted.verify('a', '936285'), /حاول بعد/);
  time += 30000; await restarted.verify('a', '936285');
  assert.equal((await restarted.read('a'))!.failures, 0);
});
