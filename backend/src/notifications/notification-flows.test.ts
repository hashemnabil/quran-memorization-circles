import 'reflect-metadata';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Role, StudentFileRequestStatus } from '@prisma/client';
import { NotificationsService } from './notifications.service';
import { ChatService } from '../chat/chat.service';
import { CertificatesService } from '../certificates/certificates.service';

test('bulk notifications deliver complete persisted rows, deduplicate recipients and tolerate socket failures', async () => {
  const events: any[] = [];
  const tx: any = { $queryRaw: async () => [], syncChange: { create: async () => ({}) },
    notification: { create: async ({ data }: any) => ({ ...data, id: `notice-${data.userId}`, isRead: false }) } };
  const prisma: any = { $transaction: async (run: any) => run(tx), notification: { count: async () => 1 } };
  const service = new NotificationsService(prisma, { emitToUser: (...args: any[]) => { events.push(args); if (args[0] === 'one') throw new Error('socket down'); } } as any);
  assert.deepEqual(await service.notifyMany(['one', 'one', 'two'], { type: 'SYSTEM', title: 'Saved' }), ['one', 'two']);
  assert.equal(events.length, 2);
  assert.equal(events[1][2].notification.id, 'notice-two');
  assert.equal(events[1][2].notification.userId, 'two');
});

test('every account role gets a persistent message notice even while connected; the sender is excluded', async () => {
  for (const role of Object.values(Role)) {
    const notices: any[] = []; const events: any[] = [];
    const member: any = { findFirst: async () => ({ id: 'member' }), update: async () => ({}),
      findMany: async ({ where }: any) => { assert.equal(where.userId.not, 'sender'); assert.equal(where.leftAt, null); return [{ userId: 'recipient' }]; } };
    const tx: any = { message: { create: async ({ data }: any) => ({ ...data, id: 'message', createdAt: new Date() }) },
      conversation: { update: async () => ({}) }, conversationMember: member };
    const prisma: any = { $transaction: async (run: any) => run(tx), conversationMember: member,
      conversation: { findUnique: async () => ({ type: 'DIRECT' }) } };
    const service = new ChatService(prisma, { isOnline: () => true, emitToConversation() {}, emitToUser: (...args: any[]) => events.push(args) } as any,
      { notify: async (input: any) => notices.push(input) } as any, { assertCanContact: async () => ({ id: 'recipient' }) } as any);
    await service.send({ id: 'sender', fullName: 'Sender', role } as any, 'conversation', { body: 'Hello' });
    assert.equal(notices.length, 1); assert.equal(notices[0].userId, 'recipient');
    assert.deepEqual(notices[0].data, { conversationId: 'conversation', messageId: 'message' });
    assert.equal(events[0][1], 'chat:inbox');
  }
});

test('reading a conversation clears only that account and conversation notifications', async () => {
  let filter: any; const events: any[] = [];
  const prisma: any = { conversationMember: { findFirst: async () => ({ id: 'membership' }) },
    $transaction: async (run: any) => run({ conversationMember: { update: async () => ({}) },
      notification: { updateMany: async ({ where }: any) => { filter = where; } } }) };
  const service = new ChatService(prisma, { emitToConversation() {}, emitToUser: (...args: any[]) => events.push(args) } as any, {} as any, {} as any);
  await service.markRead({ id: 'reader' } as any, 'conversation');
  assert.equal(filter.userId, 'reader'); assert.equal(filter.type, 'CHAT_MESSAGE');
  assert.deepEqual(filter.data, { path: ['conversationId'], equals: 'conversation' });
  assert.equal(events[0][0], 'reader');
});

test('certificate approval, rejection and ready states notify student and guardian in the same transaction', async () => {
  for (const status of [StudentFileRequestStatus.APPROVED, StudentFileRequestStatus.REJECTED, StudentFileRequestStatus.READY]) {
    const notices: any[] = []; let committed = false;
    const tx: any = { $queryRaw: async () => [], syncChange: { create: async () => ({}) },
      student: { findUnique: async () => ({ userId: 'student-user', parentProfile: { userId: 'guardian' } }) },
      studentFileRequest: { update: async ({ data }: any) => ({ id: 'request', ...data }) },
      notification: { create: async ({ data }: any) => { const row = { ...data, id: `n${notices.length}` }; notices.push(row); return row; } } };
    const prisma: any = { studentFileRequest: { findUnique: async () => ({ id: 'request', studentId: 'student', status: 'PENDING' }) },
      $transaction: async (run: any) => { const result = await run(tx); committed = true; return result; }, notification: { count: async () => 1 } };
    const service = new CertificatesService(prisma, { emitToUser() { assert(committed); } } as any);
    const result = await service.decideRequest({ id: 'admin' } as any, 'request', { status, decisionNote: 'Decision', fileUrl: status === 'READY' ? 'https://example.com/file.pdf' : undefined });
    assert.equal(result.status, status); assert.equal(notices.length, 2);
    assert.equal(notices[0].link, '/my-files'); assert.equal(notices[1].link, '/parent/children/student');
  }
});
