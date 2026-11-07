import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ExamRemindersService } from './exam-reminders.service';
import { ExamsService } from './exams.service';
import { NotificationsService } from '../notifications/notifications.service';

test('notification writes add an ID-only delta event before live delivery', async () => {
  const journal: any[] = []; let committed = false;
  const tx = { $queryRaw: async () => [],
    notification: { create: async ({ data }: any) => ({ ...data, id: 'notice' }) },
    syncChange: { create: async ({ data }: any) => { journal.push(data); } },
  };
  const service = new NotificationsService({
    $transaction: async (run: any) => { const row = await run(tx); committed = true; return row; },
    notification: { count: async () => 1 },
  } as any, { emitToUser: () => { assert(committed); } } as any);
  await service.notify({ userId: 'student', type: 'EXAM_SCHEDULED', title: 'Exam', body: 'Private notification text' });
  assert.deepEqual(journal, [{ entity: 'notifications', entityId: 'notice', operation: 'UPSERT', payload: { id: 'notice', userId: 'student' } }]);
});

test('a scheduled exam notifies the linked student with a working student portal link', async () => {
  const notices: any[] = [];
  const service = new ExamsService({} as any, {} as any, {} as any,
    { notify: async (data: any) => { notices.push(data); } } as any);
  await (service as any).sendExamScheduledNotifications({ student: { userId: 'student-user' }, section: { name: 'Test' }, sections: [] },
    { id: 'exam-one' }, new Date('2030-01-01T12:00:00Z'));
  assert.equal(notices.length, 1);
  assert.equal(notices[0].userId, 'student-user');
  assert.equal(notices[0].link, '/student');
  assert.equal(notices[0].data.examId, 'exam-one');
});

test('exam reminder claims prevent duplicate delivery and changed dates use a new reminder key', async () => {
  const stored: any[] = []; const delivered: any[] = [];
  const now = new Date('2030-01-01T00:00:00Z');
  let scheduledAt = new Date('2030-01-01T12:00:00Z');
  let scheduled = true;
  const tx = {
    $queryRaw: async () => [], syncChange: { create: async () => ({}) }, exam: { count: async () => scheduled ? 1 : 0 },
    notification: {
      findFirst: async ({ where }: any) => stored.find(row => row.data.reminderKey === where.data.equals),
      create: async ({ data }: any) => { stored.push(data); return data; },
    },
  };
  const prisma = {
    exam: { findMany: async () => [{ id: 'exam', scheduledAt, student: { userId: 'student' }, location: 'Room' }] },
    $transaction: async (run: any) => run(tx), notification: { count: async () => stored.length },
  };
  const service = new ExamRemindersService(prisma as any, { emitToUser: (...args: any[]) => delivered.push(args) } as any);
  await service.sendDueReminders(now); await service.sendDueReminders(now);
  assert.equal(stored.length, 1); assert.equal(delivered.length, 1);
  await service.sendDueReminders(new Date('2030-01-01T11:15:00Z'));
  assert.equal(stored.length, 2);
  scheduledAt = new Date('2030-01-01T13:00:00Z');
  await service.sendDueReminders(now);
  assert.equal(stored.length, 3);
  scheduled = false; scheduledAt = new Date('2030-01-01T14:00:00Z');
  await service.sendDueReminders(now);
  assert.equal(stored.length, 3);
});
