import 'reflect-metadata';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { absencePeriods, createAbsenceAlerts } from './absence-alerts';

test('school weeks start Saturday and end Friday, including year boundaries', () => {
  const p = absencePeriods(new Date('2026-01-02'));
  assert.equal(p.week.toISOString().slice(0, 10), '2025-12-27');
  assert.equal(p.weekEnd.toISOString().slice(0, 10), '2026-01-03');
  assert.equal(p.month.toISOString().slice(0, 10), '2026-01-01');
  assert.equal(p.monthEnd.toISOString().slice(0, 10), '2026-02-01');
});

function fixture(weekly: number, monthly: number) {
  const rows: any[] = []; const journal: any[] = [];
  const tx: any = {
    $queryRaw: async () => [],
    student: { findUnique: async () => ({ id: 's', fullName: 'Student', userId: 'student', parentProfile: { userId: 'parent' } }) },
    user: { findMany: async ({ where }: any) => { assert.deepEqual(where, { role: 'ADMIN', isActive: true, deletedAt: null }); return [{ id: 'admin' }]; } },
    attendance: { count: async ({ where }: any) => { assert.equal(where.status, 'ABSENT'); return where.date.gte.getUTCDate() === 1 ? monthly : weekly; } },
    notification: {
      findFirst: async ({ where }: any) => rows.find(n => n.userId === where.userId && n.data.alertKey === where.data.equals),
      create: async ({ data }: any) => { const row = { ...data, id: `n${rows.length}` }; rows.push(row); return row; },
    },
    syncChange: { create: async ({ data }: any) => { journal.push(data); } },
  };
  return { tx, rows, journal };
}

test('daily warning reaches student and guardian and replays never duplicate it', async () => {
  const { tx, rows, journal } = fixture(1, 1);
  await createAbsenceAlerts(tx, 's', new Date('2026-10-13'));
  await createAbsenceAlerts(tx, 's', new Date('2026-10-13'));
  assert.equal(rows.length, 2); assert.equal(journal.length, 2);
  assert.equal(rows.find(n => n.userId === 'student').link, '/student');
  assert.equal(rows.find(n => n.userId === 'parent').link, '/parent/children/s');
});

test('two weekly and four monthly absences warn, without requesting dismissal', async () => {
  const { tx, rows } = fixture(2, 4);
  await createAbsenceAlerts(tx, 's', new Date('2026-10-13'));
  assert.equal(rows.length, 6);
  assert.equal(rows.some(n => n.data.requiresDecision), false);
});

test('three weekly and five monthly absences request two administrative decisions only once', async () => {
  const { tx, rows } = fixture(3, 5);
  await createAbsenceAlerts(tx, 's', new Date('2026-10-13'));
  await createAbsenceAlerts(tx, 's', new Date('2026-10-14'));
  const decisions = rows.filter(n => n.data.requiresDecision);
  assert.equal(decisions.length, 2);
  assert(decisions.every(n => n.userId === 'admin' && n.link === '/students/s'));
  assert.equal(rows.filter(n => n.data.alertKey.endsWith(':warning')).length, 4);
});
