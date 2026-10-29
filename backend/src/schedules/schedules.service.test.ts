import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SchedulesService } from './schedules.service';
import { FullSyncService } from '../offline-sync/sync-all.service';
import { Role } from '@prisma/client';

test('schedule sync mutations require administrator role', async () => {
  const service = new FullSyncService({} as any, {} as any);
  for (const role of [Role.SUPERVISOR, Role.TEACHER, Role.STUDENT]) for (const table of ['mediaPlans', 'teacherDuties']) {
    await assert.rejects((service as any).apply({}, { id: 'actor', role }, { table, action: 'create', entityId: 'id', data: {} }));
  }
});
test('assignment reminder persists once and links to the actual duty page', async () => {
  let claimed = false; const messages: any[] = [];
  const tx = { teacherDutyAssignment: { updateMany: async () => { if (claimed) return { count: 0 }; claimed = true; return { count: 1 }; } }, notification: { create: async ({ data }: any) => { messages.push(data); } } };
  const service = new SchedulesService({ $transaction: async (run: any) => run(tx) } as any, {} as any);
  await (service as any).notifyAssigned('duty', ['teacher'], new Date('2026-10-15'));
  await (service as any).notifyAssigned('duty', ['teacher'], new Date('2026-10-15'));
  assert.equal(messages.length, 1); assert.equal(messages[0].userId, 'teacher'); assert.equal(messages[0].link, '/teacher-duties');
});
test('notification insertion and reminder claim share a transaction', async () => {
  let inTransaction = false;
  const service = new SchedulesService({ $transaction: async (run: any) => {
    inTransaction = true;
    try { return await run({ teacherDutyAssignment: { updateMany: async () => { assert.equal(inTransaction, true); return { count: 1 }; } }, notification: { create: async () => { assert.equal(inTransaction, true); throw new Error('insertion failed'); } } }); }
    finally { inTransaction = false; }
  } } as any, {} as any);
  await assert.rejects((service as any).notifyAssigned('duty', ['teacher'], new Date('2026-10-15')), /insertion failed/);
});
test('invalid dates and duplicate teachers fail validation before database writes', async () => {
  const service = new SchedulesService({} as any, {} as any);
  assert.throws(() => service.createMedia({ id: 'admin' } as any, { date: '2026-02-30', day: 'يوم', activity: 'عمل', idea: 'فكرة', content: 'محتوى' }));
  await assert.rejects(service.createDuty({ id: 'admin' } as any, { date: '2026-10-15', day: 'الخميس', teacherUserIds: ['teacher', 'teacher'] }));
});
