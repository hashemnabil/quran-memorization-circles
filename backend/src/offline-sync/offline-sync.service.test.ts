import 'reflect-metadata';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BadRequestException } from '@nestjs/common';
import { Role } from '@prisma/client';
import { OfflineSyncService } from './offline-sync.service';

const user = { id: 'account-1', role: Role.TEACHER } as any;
const students = [
  { id: 's1' }, { id: 's2' }, { id: 's3' },
];

function makeService(overrides: {
  studentRows?: any[];
  cursorLookup?: any;
  studentScope?: any;
  accessibleCircleIds?: string[] | null;
  role?: Role;
} = {}) {
  const prisma = {
    student: {
      findMany: async (args: any) => {
        if (overrides.studentRows) return overrides.studentRows;
        const cursor = args.cursor?.id;
        const start = cursor ? students.findIndex((row) => row.id === cursor) + 1 : 0;
        return students.slice(start, start + args.take);
      },
      findFirst: async () => overrides.cursorLookup ?? null,
    },
    circle: { findMany: async () => [] },
  };
  const acl = {
    studentScope: async () => overrides.studentScope ?? {},
    accessibleCircleIds: async () => overrides.accessibleCircleIds ?? ['circle-1'],
  };
  return {
    service: new OfflineSyncService(prisma as any, acl as any),
    prisma,
    acl,
  };
}

test('bootstrap clamps page size and returns a stable next cursor', async () => {
  const { service } = makeService();
  const result = await service.bootstrap(user, undefined, 2);
  assert.deepEqual(result.students.map((student) => student.id), ['s1', 's2']);
  assert.equal(result.nextCursor, 's2');
  assert.equal(result.complete, false);
  assert.equal(result.pageSize, 2);
});

test('bootstrap rejects a blank cursor before querying data', async () => {
  const { service } = makeService();
  await assert.rejects(
    service.bootstrap(user, '   ', 50),
    (error: unknown) => error instanceof BadRequestException,
  );
});

test('bootstrap rejects a cursor outside the authorized student scope', async () => {
  const { service } = makeService({
    studentRows: [],
    cursorLookup: null,
    studentScope: { id: 'student-in-scope-only' },
  });
  await assert.rejects(
    service.bootstrap(user, 'student-outside-scope', 50),
    (error: unknown) => error instanceof BadRequestException,
  );
});

test('bootstrap does not query student or circle data for roles without browse access', async () => {
  let studentQueries = 0;
  let circleQueries = 0;
  let aclQueries = 0;
  const prisma = {
    student: { findMany: async () => { studentQueries++; return []; }, findFirst: async () => null },
    circle: { findMany: async () => { circleQueries++; return []; } },
  };
  const acl = {
    studentScope: async () => { aclQueries++; return {}; },
    accessibleCircleIds: async () => { aclQueries++; return []; },
  };
  const service = new OfflineSyncService(prisma as any, acl as any);
  const result = await service.bootstrap({ id: 'support-1', role: Role.SUPPORT } as any);
  assert.deepEqual(result.students, []);
  assert.deepEqual(result.circles, []);
  assert.equal(studentQueries, 0);
  assert.equal(circleQueries, 0);
  assert.equal(aclQueries, 0);
});
