import 'reflect-metadata';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BadRequestException } from '@nestjs/common';
import { AttendanceStatus, Role } from '@prisma/client';
import { AttendanceService } from './attendance.service';

const actor = { id: 'teacher-1', role: Role.TEACHER } as any;
const dto = {
  circleId: 'circle-1',
  date: '2026-08-14',
  entries: [
    { studentId: 'student-1', status: AttendanceStatus.PRESENT },
    { studentId: 'student-2', status: AttendanceStatus.EXCUSED, note: 'مرض' },
  ],
} as any;

function makeService(existing: any[]) {
  let notificationCalls = 0;
  let activityCalls = 0;
  const prisma = { attendance: { findMany: async () => existing } };
  const acl = { assertCircleWriteAccess: async () => undefined };
  const activity = { log: async () => { activityCalls += 1; } };
  const notifications = { notify: async () => { notificationCalls += 1; } };
  return {
    service: new AttendanceService(prisma as any, acl as any, activity as any, notifications as any),
    getSideEffectCounts: () => ({ notificationCalls, activityCalls }),
  };
}

test('record treats an identical retry as success without repeating side effects', async () => {
  const { service, getSideEffectCounts } = makeService([
    { studentId: 'student-1', status: AttendanceStatus.PRESENT, note: null },
    { studentId: 'student-2', status: AttendanceStatus.EXCUSED, note: 'مرض' },
  ]);
  const result = await service.record(actor, dto);
  assert.equal(result.idempotentReplay, true);
  assert.equal(result.count, 2);
  assert.deepEqual(getSideEffectCounts(), { notificationCalls: 0, activityCalls: 0 });
});

test('record rejects a retry whose attendance data differs from the saved sheet', async () => {
  const { service } = makeService([
    { studentId: 'student-1', status: AttendanceStatus.ABSENT, note: null },
    { studentId: 'student-2', status: AttendanceStatus.EXCUSED, note: 'مرض' },
  ]);
  await assert.rejects(
    service.record(actor, dto),
    (error: unknown) => error instanceof BadRequestException,
  );
});
