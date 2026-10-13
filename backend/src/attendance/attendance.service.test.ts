import 'reflect-metadata';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AttendanceStatus, Role } from '@prisma/client';
import { AttendanceService } from './attendance.service';

const actor = { id: 'teacher-1', role: Role.TEACHER } as any;
const secondActor = { id: 'teacher-2', role: Role.TEACHER } as any;
const circleId = 'circle-1';
const date = '2026-08-14';

function payload(status: AttendanceStatus, studentId = 'student-1') {
  return { circleId, date, entries: [{ studentId, status }] } as any;
}

function makeService(initial: any[] = []) {
  const rows = initial.map((row) => ({ ...row }));
  let notificationCalls = 0;
  let activityCalls = 0;
  const attendance = {
    findMany: async ({ where }: any) => rows.filter((row) =>
      (!where?.circleId || row.circleId === where.circleId) &&
      (!where?.date || row.date.getTime?.() === where.date.getTime?.() || String(row.date).slice(0, 10) === date),
    ).map(({ studentId, status, note }) => ({ studentId, status, note })),
    create: async ({ data }: any) => {
      const row = { ...data, id: `attendance-${rows.length + 1}` };
      rows.push(row);
      return row;
    },
    update: async ({ where, data }: any) => {
      const row = rows.find((item) => item.studentId === where.studentId_date.studentId);
      Object.assign(row, data);
      return row;
    },
  };
  const prisma: any = {
    attendance,
    student: {
      findMany: async ({ where }: any) => where.id.in.map((id: string) => ({
        id, fullName: id, parentId: null, parentProfile: null,
      })),
    },
    $transaction: async (callback: any) => callback({
      $queryRaw: async () => [],
      attendance,
    }),
  };
  const acl = { assertCircleWriteAccess: async () => undefined };
  const activity = { log: async () => { activityCalls += 1; } };
  const notifications = { notify: async () => { notificationCalls += 1; } };
  return {
    service: new AttendanceService(prisma, acl as any, activity as any, notifications as any),
    rows,
    getSideEffectCounts: () => ({ notificationCalls, activityCalls }),
  };
}

test('PRESENT upgrades a previously saved ABSENT report', async () => {
  const { service, rows } = makeService([{
    studentId: 'student-1', circleId, date: new Date(date), status: AttendanceStatus.ABSENT,
    note: null, recordedById: 'teacher-1',
  }]);
  await service.record(secondActor, payload(AttendanceStatus.PRESENT));
  assert.equal(rows[0].status, AttendanceStatus.PRESENT);
  assert.equal(rows[0].recordedById, secondActor.id);
});

test('a later ABSENT report cannot downgrade a saved PRESENT report', async () => {
  const { service, rows, getSideEffectCounts } = makeService([{
    studentId: 'student-1', circleId, date: new Date(date), status: AttendanceStatus.PRESENT,
    note: null, recordedById: 'teacher-1',
  }]);
  await service.record(secondActor, payload(AttendanceStatus.ABSENT));
  assert.equal(rows[0].status, AttendanceStatus.PRESENT);
  assert.deepEqual(getSideEffectCounts(), { notificationCalls: 0, activityCalls: 0 });
});

test('identical ABSENT retry does not duplicate notifications or activity logs', async () => {
  const { service, getSideEffectCounts } = makeService([{
    studentId: 'student-1', circleId, date: new Date(date), status: AttendanceStatus.ABSENT,
    note: null, recordedById: 'teacher-1',
  }]);
  await service.record(secondActor, payload(AttendanceStatus.ABSENT));
  assert.deepEqual(getSideEffectCounts(), { notificationCalls: 0, activityCalls: 0 });
});

test('duplicate student IDs in one sheet are rejected', async () => {
  const { service } = makeService();
  await assert.rejects(service.record(actor, {
    circleId, date, entries: [
      { studentId: 'student-1', status: AttendanceStatus.PRESENT },
      { studentId: 'student-1', status: AttendanceStatus.ABSENT },
    ],
  } as any));
});
