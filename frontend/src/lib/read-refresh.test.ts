import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createReadRefresh } from './read-refresh';
const settle = () => new Promise(resolve => setTimeout(resolve, 0));

test('cached reads schedule work without waiting and coalesce by account and parameters', async () => {
  let time = 0, calls = 0;
  const refresh = createReadRefresh(() => time);
  let release!: () => void;
  const work = () => { calls++; return new Promise<void>(resolve => { release = resolve; }); };
  refresh('account:a?page=1', work);
  refresh('account:a?page=1', work);
  await settle(); assert.equal(calls, 1);
  time = 3000; refresh('account:a?page=1', work);
  assert.equal(calls, 1); // In-flight reads do not duplicate even after cooldown.
  release(); await settle();
  refresh('account:a?page=1', work); await settle(); assert.equal(calls, 1);
  refresh('account:b?page=1', async () => { calls++; });
  refresh('account:a?page=2', async () => { calls++; });
  await settle(); assert.equal(calls, 3);
  time = 5000; refresh('account:a?page=1', async () => { calls++; });
  await settle(); assert.equal(calls, 4);
});

test('background failures are contained and retried after cooldown', async () => {
  let time = 0, calls = 0;
  const refresh = createReadRefresh(() => time);
  const work = async () => { calls++; throw new Error('offline'); };
  refresh('account:path', work); await settle();
  refresh('account:path', work); await settle(); assert.equal(calls, 1);
  time = 2000; refresh('account:path', work); await settle(); assert.equal(calls, 2);
});
