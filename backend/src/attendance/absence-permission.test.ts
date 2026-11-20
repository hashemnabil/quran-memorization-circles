import 'reflect-metadata';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { AttendanceService } from './attendance.service';
import { absencePeriod } from './absence-period';

const teacher: any = { id: 'teacher-account', role: 'TEACHER' };
const studentUser: any = { id: 'student-account', role: 'STUDENT' };
const input = { date: '2030-01-03', endDate: '2030-01-05', reason: 'موعد طبي' };
function harness() {
  const saved: any[] = [], attendance: any[] = [], staff: any[] = [];
  let previous: any = null;
  const prisma: any = {
    student: { findFirst: async () => ({ id: 'student-record', circleId: 'circle' }) },
    absencePermissionRequest: {
      findFirst: async () => null,
      findMany: async (args: any) => args.where,
      create: async ({ data }: any) => { const row = { ...data, id: 'request', status: 'PENDING', requester: { fullName: 'صاحب الطلب' } }; saved.push(row); return row; },
      findUnique: async () => previous,
      updateMany: async () => ({ count: previous?.status === 'PENDING' ? 1 : 0 }),
      update: async ({ data }: any) => ({ ...previous, ...data }),
    },
    attendance: { findUnique: async () => null, create: async ({ data }: any) => { attendance.push(data); return data; } },
    staffAttendance: { findUnique: async () => null, create: async ({ data }: any) => { staff.push(data); return data; } },
    $transaction: async (work: any) => work(prisma),
    $queryRaw: async () => [{ locked: 1 }],
  };
  const service = new AttendanceService(prisma, {} as any, { log: async () => {} } as any, { notify: async () => {}, notifyRoles: async () => {}, notifyStudent: async () => {} } as any);
  return { service, saved, attendance, staff, prisma, setPrevious: (value: any) => { previous = value; } };
}
test('teacher requests their own period without a student and with an optional note', async () => {
  const h = harness(); const row = await h.service.createAbsencePermission(teacher, input);
  assert.equal(row.requesterId, teacher.id); assert.equal(row.studentId, null);
  assert.equal(row.durationMinutes, 3); assert.equal(row.note, null);
  assert.equal(h.staff.length, 0); assert.equal(h.attendance.length, 0);
});
test('students are resolved from the authenticated account, and neither role may impersonate someone else', async () => {
  const h = harness();
  const row = await h.service.createAbsencePermission(studentUser, input);
  assert.equal(row.studentId, 'student-record');
  await assert.rejects(h.service.createAbsencePermission(teacher, { ...input, studentId: 'student-record' }));
  await assert.rejects(h.service.createAbsencePermission(studentUser, { ...input, studentId: 'another-student' }));
  await assert.rejects(h.service.createAbsencePermission(teacher, { ...input, requesterId: 'someone-else' }));
  assert.deepEqual(await h.service.absencePermissions(teacher), { requesterId: teacher.id });
});
test('invalid calendars, reverse periods and blank reasons are rejected; days are inclusive', () => {
  assert.equal(absencePeriod({ ...input, endDate: input.date }).durationMinutes, 1);
  assert.equal(absencePeriod({ ...input, date: '2032-02-28', endDate: '2032-03-01' }).durationMinutes, 3);
  for (const patch of [{ date: '2030-02-30' }, { endDate: '2030-01-01' }, { reason: ' ' }, { note: 42 }]) assert.throws(() => absencePeriod({ ...input, ...patch } as any));
});
for (const isStudent of [true, false]) test(`approval records every day for ${isStudent ? 'the student' : 'the staff requester'} only`, async () => {
  const h = harness(); h.setPrevious({ id: 'request', requesterId: isStudent ? studentUser.id : teacher.id, studentId: isStudent ? 'student-record' : null, student: isStudent ? { circleId: 'circle' } : null, ...absencePeriod(input), status: 'PENDING' });
  await h.service.decideAbsencePermission({ id: 'admin', role: 'ADMIN' } as any, 'request', true);
  const records = isStudent ? h.attendance : h.staff;
  assert.deepEqual(records.map(row => row.date.toISOString().slice(0,10)), ['2030-01-03','2030-01-04','2030-01-05']);
  assert.ok(records.every(row => row.status === 'EXCUSED'));
  assert.equal((isStudent ? h.staff : h.attendance).length, 0);
});
test('rejection does not change attendance; teachers cannot approve', async () => {
  const h = harness(); h.setPrevious({ id: 'request', requesterId: teacher.id, student: null, ...absencePeriod(input), status: 'PENDING' });
  await assert.rejects(h.service.decideAbsencePermission(teacher, 'request', true));
  const row = await h.service.decideAbsencePermission({ id: 'admin', role: 'ADMIN' } as any, 'request', false);
  assert.equal(row.status, 'REJECTED'); assert.equal(h.staff.length + h.attendance.length, 0);
});
test('an overlapping request is rejected before creation and a decided request cannot be decided twice', async () => {
  const h = harness();
  h.prisma.absencePermissionRequest.findFirst = async () => ({ id: 'overlap' });
  await assert.rejects(h.service.createAbsencePermission(teacher, input), /يتداخل/);
  assert.equal(h.saved.length, 0);
  h.setPrevious({ id: 'request', requesterId: teacher.id, ...absencePeriod(input), status: 'APPROVED' });
  await assert.rejects(h.service.decideAbsencePermission({ id: 'admin', role: 'ADMIN' } as any, 'request', true));
  assert.equal(h.staff.length, 0);
});
