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


test('changes returns stable independent cursors and includes student tombstones', async () => {
  const timestamp = new Date('2026-10-01T12:00:00.000Z');
  const studentRows = [
    { id: 's1', updatedAt: timestamp, deletedAt: null },
    { id: 's2', updatedAt: timestamp, deletedAt: timestamp },
  ];
  const circleRows = [
    { id: 'c1', updatedAt: timestamp, deletedAt: null },
  ];
  const prisma = {
    student: { findMany: async (args: any) => studentRows.slice(0, args.take) },
    circle: { findMany: async (args: any) => circleRows.slice(0, args.take) },
  };
  const acl = {
    studentScope: async () => ({}),
    accessibleCircleIds: async () => ['c1'],
  };
  const service = new OfflineSyncService(prisma as any, acl as any);
  const first = await service.changes(user, undefined, undefined, 1);
  assert.equal(first.students.length, 1);
  assert.equal(first.circles.length, 1);
  assert.equal(first.hasMoreStudents, true);
  assert.equal(first.hasMoreCircles, false);
  assert.ok(first.nextStudentCursor);
  assert.ok(first.nextCircleCursor);
  const circleDecoded = JSON.parse(Buffer.from(first.nextCircleCursor!, 'base64url').toString('utf8'));
  assert.equal(circleDecoded.id, 'c1');
  const decoded = JSON.parse(Buffer.from(first.nextStudentCursor!, 'base64url').toString('utf8'));
  assert.equal(decoded.id, 's1');
  assert.equal(decoded.updatedAt, timestamp.toISOString());
});

test('changes rejects malformed cursors', async () => {
  const { service } = makeService();
  await assert.rejects(
    service.changes(user, 'not-a-cursor', undefined, 20),
    (error: unknown) => error instanceof BadRequestException,
  );
});


test('changes never queries private roster resources for roles without sync access', async () => {
  let studentQueries = 0;
  let circleQueries = 0;
  const prisma = {
    student: { findMany: async () => { studentQueries += 1; return []; } },
    circle: { findMany: async () => { circleQueries += 1; return []; } },
  };
  const acl = {
    studentScope: async () => { throw new Error('must not resolve scope for unsupported role'); },
    accessibleCircleIds: async () => { throw new Error('must not resolve circles for unsupported role'); },
  };
  const service = new OfflineSyncService(prisma as any, acl as any);
  const result = await service.changes({ id: 'support-1', role: Role.SUPPORT } as any);
  assert.deepEqual(result.students, []);
  assert.deepEqual(result.circles, []);
  assert.equal(studentQueries, 0);
  assert.equal(circleQueries, 0);
});

test('changes applies the decoded (updatedAt,id) cursor and retains tombstones', async () => {
  const timestamp = new Date('2026-10-01T12:00:00.000Z');
  let capturedStudentWhere: any;
  let capturedCircleWhere: any;
  const prisma = {
    student: { findMany: async (args: any) => { capturedStudentWhere = args.where; return [{ id: 's2', updatedAt: timestamp, deletedAt: timestamp }]; } },
    circle: { findMany: async (args: any) => { capturedCircleWhere = args.where; return []; } },
  };
  const acl = {
    studentScope: async () => ({ id: 's2' }),
    accessibleCircleIds: async () => ['c1'],
  };
  const service = new OfflineSyncService(prisma as any, acl as any);
  const cursor = Buffer.from(JSON.stringify({ updatedAt: timestamp.toISOString(), id: 's1' })).toString('base64url');
  const result = await service.changes(user, cursor, undefined, 10);
  assert.equal(result.students.length, 1);
  assert.equal(result.students[0].deletedAt, timestamp);
  assert.ok(JSON.stringify(capturedStudentWhere).includes(timestamp.toISOString()));
  assert.ok(JSON.stringify(capturedStudentWhere).includes('s1'));
  assert.ok(capturedCircleWhere);
});
