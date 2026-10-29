import 'reflect-metadata';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BadRequestException } from '@nestjs/common';
import { SyncController } from './sync.controller';

const user = { id: 'account-1' } as any;

test('changes accepts normal and full precision bigint cursors', () => {
  const calls: Array<{ since: bigint; limit: number }> = [];
  const service = { syncChanges: (_user: unknown, since: bigint, limit: number) => {
    calls.push({ since, limit });
    return { nextSeq: since.toString() };
  } };
  const controller = new SyncController(service as any);
  assert.deepEqual(controller.changes(user, '0', '200'), { nextSeq: '0' });
  assert.deepEqual(controller.changes(user, '9007199254740993', '25'), { nextSeq: '9007199254740993' });
  assert.deepEqual(controller.changes(user, '9223372036854775807', '1'), { nextSeq: '9223372036854775807' });
  assert.deepEqual(calls, [
    { since: 0n, limit: 200 },
    { since: 9007199254740993n, limit: 25 },
    { since: 9223372036854775807n, limit: 1 },
  ]);
});

test('changes rejects malformed, negative and out-of-range cursors', () => {
  const controller = new SyncController({ syncChanges: () => { throw new Error('must not dispatch'); } } as any);
  for (const since of ['-1', '01', '1.0', 'abc', '', ' 1', '9223372036854775808']) {
    assert.throws(() => controller.changes(user, since, '10'), BadRequestException);
  }
  for (const limit of ['0', '201', 'abc', '1.5', '-1']) {
    assert.throws(() => controller.changes(user, '1', limit), BadRequestException);
  }
});
