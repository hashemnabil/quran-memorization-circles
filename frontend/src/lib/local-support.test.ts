import 'fake-indexeddb/auto';
import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';
import { db } from './db';
import { configureOffline, syncAll } from './offline-engine';
import { localRead, localWrite, rememberRead } from './local-api';
let online = false;
const account = '11111111-1111-4111-8111-111111111111';
let actor = { id: account, fullName: 'Student', role: 'STUDENT' };
Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { get onLine() { return online; } } });
Object.assign(globalThis, { window: new EventTarget(), localStorage: { getItem: () => JSON.stringify(actor) } });
beforeEach(async () => {
  online = false; actor = { id: account, fullName: 'Student', role: 'STUDENT' };
  for (const table of db.tables) await table.clear();
  configureOffline(async () => { throw new Error('offline'); }, () => actor.id);
});
test('ticket and follow-up reply survive reopening without claiming a server number', async () => {
  const ticket = await localWrite('post', '/support', { subject: 'Help', description: 'Issue' });
  assert.equal(ticket.synced, 0); assert.equal(ticket.number, null);
  await localWrite('post', `/support/${ticket.id}/reply`, { body: 'More details', isInternal: false });
  db.close(); await db.open();
  assert.equal((await localRead(`/support/${ticket.id}`)).messages.length, 2);
  assert.equal((await localRead('/support', { search: 'help' })).data[0].id, ticket.id);
  assert.equal(await db.queue.count(), 2);
});
test('creation receipts and dependent replies are replayed once after a lost response', async () => {
  const ticket = await localWrite('post', '/support', { subject: 'Help', description: 'Issue' });
  await localWrite('post', `/support/${ticket.id}/reply`, { body: 'Details', isInternal: false });
  const canonical = '22222222-2222-4222-8222-222222222222';
  const receipts = new Map(); let writes = 0, lost = true;
  online = true;
  configureOffline(async (_method, _path, payload) => {
    const outcomes = payload.operations.map((op: any) => {
      if (!receipts.has(op.opId)) { writes++; receipts.set(op.opId, { opId: op.opId, status: 'applied', data: { id: canonical, number: 17, subject: 'Help', createdById: account, messages: [{ id: 'server-reply', body: 'Details', sender: actor }] } }); }
      return receipts.get(op.opId);
    });
    if (lost) { lost = false; throw new Error('lost acknowledgement'); }
    return { outcomes };
  }, () => actor.id);
  await assert.rejects(syncAll()); await syncAll();
  assert.equal(writes, 2); assert.equal(await db.queue.count(), 0);
  const detail = await localRead(`/support/${ticket.id}`);
  assert.equal(detail.id, canonical); assert.equal(detail.number, 17); assert.equal(detail.synced, 1);
});
test('local support enforces ownership, internal notes and verified request boundaries', async () => {
  await assert.rejects(localWrite('post', '/support', { subject: 'Delete', description: 'Account', category: 'ACCOUNT_DELETION' }));
  await assert.rejects(localWrite('post', '/support', { subject: 'Reset', description: 'Password', category: 'PASSWORD_RESET' }));
  const id = '33333333-3333-4333-8333-333333333333';
  await rememberRead(`/support/${id}`, {}, { id, subject: 'Other', status: 'OPEN', createdById: 'other', messages: [] });
  assert.equal(await localRead(`/support/${id}`), undefined);
  await assert.rejects(localWrite('post', `/support/${id}/reply`, { body: 'Not mine' }));
  await db.table('supportTickets').update([account, id], { createdById: account });
  await assert.rejects(localWrite('post', `/support/${id}/reply`, { body: 'Secret', isInternal: true }));
  await db.table('supportTickets').update([account, id], { status: 'CLOSED' });
  await assert.rejects(localWrite('post', `/support/${id}/reply`, { body: 'Closed' }));
  actor = { ...actor, id: 'another-account' }; assert.equal(await localRead(`/support/${id}`), undefined);
});

test('version-12 response caches remain readable offline but cannot revive a scoped-out ticket', async () => {
  const id = '33333333-3333-4333-8333-333333333333';
  await db.responses.put({ key: JSON.stringify([account, `/support/${id}`, []]), accountId: account, data: { id, subject: 'Saved before upgrade', createdById: account, messages: [{ id: 'old-reply', body: 'Cached', isInternal: false }] } });
  assert.equal((await localRead(`/support/${id}`)).messages[0].body, 'Cached');
  await db.table('supportTickets').clear();
  await db.meta.put({ key: `${account}:supportDownloadedAt`, value: 'new-scoped-snapshot' });
  assert.equal(await localRead(`/support/${id}`), undefined);
});

test('staff changes remain pending without replacing the last approved status or assignment', async () => {
  actor = { ...actor, role: 'SUPPORT' };
  const id = '33333333-3333-4333-8333-333333333333', original = '2026-10-28T09:00:00.000Z';
  await rememberRead(`/support/${id}`, {}, { id, subject: 'Ticket', status: 'OPEN', priority: 'NORMAL', createdById: 'customer', updatedAt: original, assignedToId: null });
  const pending = await localWrite('patch', `/support/${id}`, { status: 'IN_PROGRESS', assignedToId: account });
  assert.equal(pending.synced, 0); assert.equal(pending.status, 'OPEN'); assert.equal(pending.assignedToId, null);
  assert.equal(pending.pendingStatus, 'IN_PROGRESS');
  const op = (await db.queue.toArray())[0]; assert.equal(op.data.status, 'IN_PROGRESS'); assert.equal(op.data.previousUpdatedAt, original);
  await assert.rejects(localWrite('patch', `/support/${id}`, { status: 'CLOSED' }));
  actor = { ...actor, role: 'STUDENT' };
  await assert.rejects(localWrite('patch', `/support/${id}`, { status: 'CLOSED' }));
  actor = { ...actor, role: 'SUPPORT' }; online = true;
  configureOffline(async (_method, _path, payload) => ({ outcomes: payload.operations.map((operation: any) => ({ opId: operation.opId, status: 'applied', data: { id, status: 'IN_PROGRESS', assignedToId: account } })) }), () => account);
  await syncAll();
  const acknowledged = await localRead(`/support/${id}`);
  assert.equal(acknowledged.status, 'IN_PROGRESS'); assert.equal(acknowledged.pendingUpdate, false); assert.equal(acknowledged.pendingStatus, null);
});
