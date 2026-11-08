import 'reflect-metadata';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DashboardService } from './dashboard.service';

const student = (id: string, points: number, teachers = ['الشيخ أحمد']) => ({ id, fullName: `طالب ${id}`, totalPoints: points, phone: 'private', circle: { name: `حلقة ${id}`, teachers: teachers.map(fullName => ({ teacher: { user: { fullName, phone: 'private' } } })) } });

test('school honor roll gives tied students the same rank and exposes only honor fields', async () => {
  const service = new DashboardService({ student: { findMany: async () => [student('a', 120), student('b', 120), student('c', 99.75, ['الشيخ علي', 'الشيخ علي', 'الشيخ عمر'])] } } as any, {} as any, {} as any);
  const result = await service.honorRoll();
  assert.deepEqual(result.students.map(row => row.rank), [1, 1, 3]);
  assert.equal(result.students[2].teacherName, 'الشيخ علي، الشيخ عمر');
  assert.deepEqual(Object.keys(result.students[0]).sort(), ['circleName', 'fullName', 'id', 'points', 'rank', 'teacherName'].sort());
  assert.equal(result.students[2].points, 99.75);
  assert.ok(Number.isFinite(Date.parse(result.updatedAt)));
});

test('honor roll requests all circles, ten positive totals and current active teachers only', async () => {
  let query: any;
  const service = new DashboardService({ student: { findMany: async (args: any) => { query = args; return []; } } } as any, {} as any, {} as any);
  assert.deepEqual((await service.honorRoll()).students, []);
  assert.equal(query.take, 10);
  assert.equal(query.where.deletedAt, null);
  assert.equal(query.where.status, 'ACTIVE');
  assert.deepEqual(query.where.totalPoints, { gt: 0 });
  assert.deepEqual(query.where.circle, { is: { deletedAt: null, isActive: true } });
  assert.equal(query.where.circleId, undefined);
  assert.deepEqual(query.orderBy[0], { totalPoints: 'desc' });
  assert.equal(query.select.circle.select.teachers.where.endedAt, null);
  assert.equal(query.select.circle.select.teachers.where.teacher.is.isActive, true);
  assert.equal(query.select.circle.select.teachers.where.teacher.is.user.is.deletedAt, null);
});

test('a new read reflects changed points without retaining the previous winner', async () => {
  let rows = [student('a', 100), student('b', 90, [])];
  const service = new DashboardService({ student: { findMany: async () => rows } } as any, {} as any, {} as any);
  assert.equal((await service.honorRoll()).students[0].id, 'a');
  rows = [student('b', 110, []), student('a', 100)];
  const next = await service.honorRoll();
  assert.equal(next.students[0].id, 'b');
  assert.equal(next.students[0].rank, 1);
  assert.equal(next.students[0].teacherName, null);
});
