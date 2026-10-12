import test from 'node:test';
import assert from 'node:assert/strict';
import { validateAttendancePayload } from './attendance-validation.js';

const now = new Date('2026-10-12T12:00:00.000Z');
const circleId = '11111111-1111-4111-8111-111111111111';
const studentId = '22222222-2222-4222-8222-222222222222';
const otherStudentId = '33333333-3333-4333-8333-333333333333';
const valid = () => ({
  circleId,
  date: '2026-10-12',
  entries: [{ studentId, status: 'PRESENT' }],
});

test('accepts a valid attendance sheet', () => {
  assert.equal(validateAttendancePayload(valid(), now), null);
});

test('rejects missing payload and empty entries', () => {
  assert.ok(validateAttendancePayload(null, now));
  assert.ok(validateAttendancePayload({ ...valid(), entries: [] }, now));
});

test('rejects invalid UUIDs', () => {
  assert.ok(validateAttendancePayload({ ...valid(), circleId: 'circle-1' }, now));
  assert.ok(validateAttendancePayload({
    ...valid(), entries: [{ studentId: 'student-1', status: 'PRESENT' }],
  }, now));
});

test('rejects impossible calendar dates and future dates', () => {
  assert.ok(validateAttendancePayload({ ...valid(), date: '2026-02-30' }, now));
  assert.ok(validateAttendancePayload({ ...valid(), date: '2026-10-13' }, now));
});

test('rejects duplicate students and unsupported statuses', () => {
  assert.ok(validateAttendancePayload({
    ...valid(),
    entries: [
      { studentId, status: 'PRESENT' },
      { studentId, status: 'ABSENT' },
    ],
  }, now));
  assert.ok(validateAttendancePayload({
    ...valid(), entries: [{ studentId, status: 'UNKNOWN' }],
  }, now));
});

test('rejects notes that are not strings or exceed server limit', () => {
  assert.ok(validateAttendancePayload({
    ...valid(), entries: [{ studentId, status: 'EXCUSED', note: 42 }],
  }, now));
  assert.ok(validateAttendancePayload({
    ...valid(), entries: [{ studentId, status: 'EXCUSED', note: 'x'.repeat(301) }],
  }, now));
});

test('accepts multiple distinct students', () => {
  assert.equal(validateAttendancePayload({
    ...valid(),
    entries: [
      { studentId, status: 'PRESENT' },
      { studentId: otherStudentId, status: 'EXCUSED', note: 'مرض' },
    ],
  }, now), null);
});
