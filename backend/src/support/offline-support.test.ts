import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Role, TicketStatus } from '@prisma/client';
import { SupportService } from './support.service';
const student = { id: 'student', role: Role.STUDENT } as any;
function fixture(ticket: any) {
  let created = 0; let detailQuery: any;
  const service = new SupportService({
    supportTicket: { findFirst: async (query: any) => { detailQuery = query; return ticket; }, update: async () => ticket },
    ticketMessage: { create: async () => { created++; return { id: 'reply', body: 'Reply', isInternal: false }; } },
  } as any, { log: async () => {} } as any, { notify: async () => {}, notifyRoles: async () => {} } as any, { emitToUser() {} } as any);
  return { service, count: () => created, query: () => detailQuery };
}
test('support replay cannot reply to another account, a closed ticket or an admin-only request', async () => {
  for (const ticket of [
    { createdById: 'another', status: TicketStatus.OPEN },
    { createdById: student.id, status: TicketStatus.CLOSED },
    { createdById: student.id, status: TicketStatus.OPEN, category: 'PASSWORD_RESET' },
  ]) {
    const { service, count } = fixture(ticket);
    await assert.rejects(service.reply(student, 'ticket', { body: 'Reply' }));
    assert.equal(count(), 0);
  }
});
test('internal support notes remain restricted to staff and customer details exclude internal notes', async () => {
  const { service, count, query } = fixture({ createdById: student.id, status: TicketStatus.OPEN });
  await assert.rejects(service.reply(student, 'ticket', { body: 'Private', isInternal: true }));
  assert.equal(count(), 0);
  await service.findOne(student, 'ticket');
  assert.deepEqual(query().include.messages.where, { isInternal: false });
  const forbidden = fixture({ createdById: 'another', status: TicketStatus.OPEN });
  await assert.rejects(forbidden.service.findOne(student, 'ticket'));
});
test('offline ticket creation does not bypass password reset or account deletion verification', async () => {
  const { service, count } = fixture(null);
  for (const category of ['PASSWORD_RESET', 'ACCOUNT_DELETION']) await assert.rejects(service.create(student, { subject: 'Restricted', description: 'Needs verification', category }));
  assert.equal(count(), 0);
});

test('queued staff changes atomically compare server revision before status changes or notifications', async () => {
  const expected = '2026-10-28T09:00:00.000Z';
  for (const count of [0, 1]) {
    const mutations: any[] = []; let notifications = 0;
    const service = new SupportService({ supportTicket: {
      findFirst: async () => ({ id: 'ticket', createdById: 'customer', status: TicketStatus.OPEN }),
      updateMany: async (query: any) => { mutations.push(query); return { count }; },
      findUnique: async () => ({ id: 'ticket', status: TicketStatus.CLOSED }),
      update: async () => { throw new Error('must use revision guard'); },
    } } as any, { log: async () => {} } as any, { notify: async () => { notifications++; } } as any, {} as any);
    const request = service.update({ ...student, role: Role.SUPPORT }, 'ticket', { status: TicketStatus.CLOSED }, expected);
    if (!count) { await assert.rejects(request, /تغيّر طلب الدعم/); assert.equal(notifications, 0); }
    else { await request; assert.equal(notifications, 1); }
    assert.deepEqual(mutations[0].where, { id: 'ticket', deletedAt: null, updatedAt: new Date(expected) });
  }
});
