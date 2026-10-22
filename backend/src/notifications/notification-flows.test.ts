import 'reflect-metadata';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Role, StudentFileRequestStatus } from '@prisma/client';
import { NotificationsService } from './notifications.service';
import { ChatService } from '../chat/chat.service';
import { CertificatesService } from '../certificates/certificates.service';
import { SupportService } from '../support/support.service';
import { randomUUID } from 'node:crypto';

test('only administrators broadcast, with current active recipients inside the selected role', async () => {
  let where: any; const sent: any[] = [];
  const service = new NotificationsService({ user: { findMany: async (query: any) => { where = query.where; return [{ id: 'student-one' }]; } } } as any, {} as any);
  service.notifyMany = async (ids, notice) => { sent.push({ ids, notice }); return ids; };
  const actor: any = { id: 'admin', role: Role.ADMIN };
  const dto: any = { title: ' Title ', body: ' Message ', audience: 'STUDENT', selection: 'SELECTED', userIds: ['student-one'] };
  await assert.rejects(service.broadcast({ ...actor, role: Role.TEACHER }, dto));
  assert.equal((await service.broadcast(actor, dto)).recipientCount, 1);
  assert.deepEqual(where, { isActive: true, deletedAt: null, role: 'STUDENT', id: { in: ['student-one'] } });
  assert.equal(sent[0].notice.title, 'Title');
  await assert.rejects(service.broadcast(actor, { ...dto, userIds: [] }));
  await assert.rejects(service.broadcast(actor, { ...dto, userIds: ['student-one', 'outside-role'] }));
  assert.equal(sent.length, 1);
});

test('educational staff and circle broadcasts resolve current membership and reject unrelated selected accounts', async () => {
  let where: any; let calls = 0;
  const service = new NotificationsService({ circle: { findFirst: async ({ where }: any) => where.id === 'circle' ? { id: 'circle' } : null }, user: { findMany: async (query: any) => { where = query.where; return [{ id: 'member' }]; } } } as any, {} as any);
  service.notifyMany = async ids => { calls++; return ids; };
  const actor: any = { id: 'admin', role: Role.ADMIN };
  const dto: any = { title: 'Notice', body: 'Body', selection: 'ALL', userIds: [], audience: 'STAFF' };
  await service.broadcast(actor, dto);
  assert.deepEqual(where.role.in, [Role.TEACHER, Role.SUPERVISOR, Role.EXAM_COMMITTEE]);
  await service.broadcast(actor, { ...dto, audience: 'CIRCLE', circleId: 'circle' });
  assert.deepEqual(where.studentProfile, { circleId: 'circle', deletedAt: null });
  assert.equal(where.role, Role.STUDENT);
  await assert.rejects(service.broadcast(actor, { ...dto, audience: 'CIRCLE' }));
  await assert.rejects(service.broadcast(actor, { ...dto, audience: 'CIRCLE', circleId: 'missing' }));
  await assert.rejects(service.broadcast(actor, { ...dto, audience: 'CIRCLE', circleId: 'circle', selection: 'SELECTED', userIds: ['member', 'outside'] }));
  assert.equal(calls, 2);
});

test('broadcast directory returns more than one staff-list page and separates students without accounts', async () => {
  const people = Array.from({ length: 205 }, (_, index) => ({ id: String(index), fullName: `Person ${index}`, username: `person${index}`, role: index < 200 ? Role.STUDENT : Role.TEACHER, studentProfile: index < 200 ? { circleId: 'circle', deletedAt: null } : null }));
  let query: any;
  const service = new NotificationsService({ user: { findMany: async (input: any) => { query = input; return people; } }, circle: { findMany: async () => [{ id: 'circle', name: 'Circle' }] }, student: { findMany: async () => [{ id: 'no-login', fullName: 'No account', circleId: 'circle' }] } } as any, {} as any);
  const result = await service.recipients();
  assert.equal(result.users.length, 205); assert.equal(result.users[0].circleId, 'circle');
  assert.equal(query.take, undefined); assert.equal(query.select.passwordHash, undefined);
  assert.equal(result.studentsWithoutAccounts[0].id, 'no-login');
});

test('password recovery reaches administrators only and a lost-response retry reuses its ticket', async () => {
  let saved: any; let count = 0; const notices: any[] = [];
  const prisma: any = { supportTicket: { findUnique: async () => saved, create: async ({ data }: any) => { saved = { ...data, number: 25 }; count++; return saved; } } };
  const service = new SupportService(prisma, { log: async () => undefined } as any, { notifyRoles: async (...args: any[]) => { notices.push(args); } } as any, {} as any);
  const dto = { requestId: randomUUID(), contactName: 'Student', contactPhone: '0591234567', subject: 'طلب تغيير كلمة المرور', description: 'Student identity submitted for manual review' };
  assert.equal((await service.createPublic(dto, 'client')).number, 25);
  assert.equal((await service.createPublic(dto, 'client')).number, 25);
  assert.equal(count, 1); assert.equal(saved.category, 'PASSWORD_RESET');
  assert.deepEqual(notices[0][0], [Role.ADMIN]); assert.equal(notices.length, 1);
  await assert.rejects(service.createPublic({ ...dto, description: 'Changed payload' }, 'client'));
  const recordService = new SupportService({ supportTicket: { findFirst: async () => saved } } as any, {} as any, {} as any, {} as any);
  await assert.rejects(recordService.findOne({ id: 'support', role: Role.SUPPORT } as any, saved.id));
  await assert.rejects(recordService.update({ id: 'support', role: Role.SUPPORT } as any, saved.id, { status: 'RESOLVED' }));
});

test('donation notes are stored as admin-visible tickets and notify administrators only', async () => {
  let saved: any; const notices: any[] = [];
  const prisma: any = {
    schoolSettings: { findUnique: async () => ({ donationsEnabled: true }) },
    supportTicket: {
      findUnique: async () => saved,
      create: async ({ data }: any) => { saved = { ...data, id: 'donation-note', number: 31 }; return saved; },
    },
  };
  const service = new SupportService(prisma, { log: async () => undefined } as any,
    { notifyRoles: async (...args: any[]) => { notices.push(args); } } as any, {} as any);
  await service.createPublic({ requestId: randomUUID(), contactName: 'Donor', subject: 'ملاحظة تبرع', description: 'وصلت المساهمة اليوم' }, 'donor-client');
  assert.equal(saved.category, 'DONATION');
  assert.deepEqual(notices[0][0], [Role.ADMIN]);
  assert.equal(notices[0][1].title, 'وصلت ملاحظة من متبرع');
  const disabled = new SupportService({ schoolSettings: { findUnique: async () => ({ donationsEnabled: false }) } } as any, {} as any, {} as any, {} as any);
  await assert.rejects(disabled.createPublic({ contactName: 'Donor', subject: 'ملاحظة تبرع', description: 'note' } as any, 'other-client'));
});

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
