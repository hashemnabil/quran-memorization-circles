import 'fake-indexeddb/auto';
import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';
import { db } from './db';
import { configureOffline, syncAll } from './offline-engine';
import { localRead, localWrite, rememberRead } from './local-api';
const account = '11111111-1111-4111-8111-111111111111', target = '22222222-2222-4222-8222-222222222222';
let online = false;
const actor = { id: account, fullName: 'Student', role: 'STUDENT' };
Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { get onLine() { return online; } } });
Object.assign(globalThis, { window: new EventTarget(), localStorage: { getItem: () => JSON.stringify(actor) } });
beforeEach(async () => {
  online = false; for (const table of db.tables) await table.clear();
  configureOffline(async () => { throw new Error('offline'); }, () => account);
  await rememberRead('/users/directory', {}, [{ id: target, fullName: 'Allowed teacher', role: 'TEACHER' }]);
});
test('offline conversation creation uses only saved contacts and reuses an existing direct draft', async () => {
  await assert.rejects(localWrite('post', '/chat/conversations/direct', { userId: '33333333-3333-4333-8333-333333333333' }));
  const conversation = await localWrite('post', '/chat/conversations/direct', { userId: target });
  assert.equal(conversation.synced, 0); assert.equal(conversation.otherUser.id, target);
  const reused = await localWrite('post', '/chat/conversations/direct', { userId: target });
  assert.equal(reused.id, conversation.id); assert.equal(await db.queue.count(), 1);
  db.close(); await db.open();
  assert.equal((await localRead('/chat/conversations'))[0].title, 'Allowed teacher');
  assert.equal((await localRead(`/chat/conversations/${conversation.id}`)).canPost, true);
});
test('new group and dependent messages survive lost responses and remap to server identifiers', async () => {
  const conversation = await localWrite('post', '/chat/conversations/group', { title: 'Study group', memberIds: [target, target] });
  assert.equal(conversation.memberCount, 2);
  const message = await localWrite('post', `/chat/conversations/${conversation.id}/messages`, { body: 'Hello' });
  db.close(); await db.open();
  const canonical = '44444444-4444-4444-8444-444444444444';
  let lost = true, writes = 0; const receipts = new Map(); online = true;
  configureOffline(async (_method, _path, payload) => {
    const outcomes = payload.operations.map((op: any) => {
      if (!receipts.has(op.opId)) { writes++; receipts.set(op.opId, { opId: op.opId, status: 'applied', data: op.table === 'chatConversations' ? { id: canonical, title: 'Study group', canPost: true } : { id: message.id, conversationId: canonical, body: 'Hello' } }); }
      return receipts.get(op.opId);
    });
    if (lost) { lost = false; throw new Error('lost'); } return { outcomes };
  }, () => account);
  await assert.rejects(syncAll()); await syncAll();
  assert.equal(writes, 2); assert.equal(await db.queue.count(), 0);
  assert.equal((await localRead(`/chat/conversations/${conversation.id}`)).id, canonical);
  assert.equal((await localRead(`/chat/conversations/${conversation.id}/messages`)).data[0].conversationId, canonical);
});
test('a rejected conversation preserves its messages without attempting to send them', async () => {
  const conversation = await localWrite('post', '/chat/conversations/group', { title: 'Group', memberIds: [target] });
  await localWrite('post', `/chat/conversations/${conversation.id}/messages`, { body: 'Keep me' });
  online = true; let sends = 0;
  configureOffline(async (_method, _path, payload) => {
    assert.equal(payload.operations[0].table, 'chatConversations'); sends++;
    return { outcomes: [{ opId: payload.operations[0].opId, status: 'rejected', message: 'لم تعد صلاحية التواصل متاحة' }] };
  }, () => account);
  await assert.rejects(syncAll()); assert.equal(sends, 1); assert.equal(await db.queue.count(), 2);
  assert.equal((await localRead(`/chat/conversations/${conversation.id}`)).syncError, 'لم تعد صلاحية التواصل متاحة');
  assert.equal((await localRead(`/chat/conversations/${conversation.id}/messages`)).data[0].body, 'Keep me');
});
test('authoritative list refresh removes departed clean conversations while retaining local drafts', async () => {
  await rememberRead('/chat/conversations', {}, [{ id: target, title: 'Old thread', canPost: true }]);
  const draft = await localWrite('post', '/chat/conversations/group', { title: 'Pending', memberIds: [target] });
  await rememberRead('/chat/conversations', {}, []);
  assert.equal((await localRead('/chat/conversations')).length, 1);
  assert.equal((await localRead('/chat/conversations'))[0].id, draft.id);
  assert.equal(await localRead(`/chat/conversations/${target}`), undefined);
});

test('a contact loaded through the directory search can be selected before full prefetch finishes', async () => {
  await db.responses.clear();
  await rememberRead('/users/directory', { search: 'teacher' }, [{ id: target, fullName: 'Allowed teacher', role: 'TEACHER' }]);
  const conversation = await localWrite('post', '/chat/conversations/direct', { userId: target });
  assert.equal(conversation.otherUser.id, target); assert.equal(conversation.synced, 0);
});
