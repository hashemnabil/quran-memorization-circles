import 'reflect-metadata';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BadRequestException } from '@nestjs/common';
import { Role } from '@prisma/client';
import { OfflineSyncService } from './offline-sync.service';

const user = { id: 'account-1', role: Role.TEACHER } as any;
const service = new OfflineSyncService({} as any, {} as any);

test('push rejects malformed envelopes', async () => {
  await assert.rejects(
    service.pushOperations(user, { operations: 'not-an-array' }),
    (error: unknown) => error instanceof BadRequestException,
  );
});

test('push bounds batch size before rejecting unsupported mutations', async () => {
  await assert.rejects(
    service.pushOperations(user, { operations: Array.from({ length: 101 }, (_, i) => ({ opId: String(i) })) }),
    (error: unknown) => error instanceof BadRequestException && error.message.includes('100'),
  );
});

test('push fails closed for validly shaped but unsupported operations', async () => {
  await assert.rejects(
    service.pushOperations(user, { operations: [{ opId: 'op-1', entity: 'student', data: {} }] }),
    (error: unknown) => error instanceof BadRequestException && error.message.includes('غير مفعّلة'),
  );
});
