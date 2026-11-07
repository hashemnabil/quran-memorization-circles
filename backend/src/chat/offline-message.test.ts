import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ChatService } from './chat.service';
import { Role } from '@prisma/client';

const actor = { id: 'author', role: Role.STUDENT } as any;
const baseline = { body: 'Original', editedAt: '2026-10-28T08:00:00.000Z' };
function fixture(count: number, senderId = actor.id) {
  const mutations: any[] = [], emissions: any[] = [];
  const prisma = {
    message: {
      findFirst: async () => ({ id: 'message', conversationId: 'conversation', senderId, body: 'Original' }),
      updateMany: async (query: any) => { mutations.push(query); return { count }; },
      findUnique: async () => ({ id: 'message', body: 'Edited' }),
      update: async () => { throw new Error('must use atomic guarded write'); },
    },
    conversationMember: { findMany: async () => [], findFirst: async () => ({ isAdmin: false }) },
  };
  const service = new ChatService(prisma as any, { emitToConversation: (...args: any[]) => emissions.push(args) } as any, {} as any, {} as any);
  (service as any).assertMember = async () => {};
  (service as any).assertAllContactable = async () => {};
  return { service, mutations, emissions };
}
test('queued edit atomically checks the original body and server edit timestamp', async () => {
  const { service, mutations, emissions } = fixture(1);
  await service.editMessage(actor, 'conversation', 'message', 'Edited', baseline);
  assert.deepEqual(mutations[0].where, { id: 'message', conversationId: 'conversation', deletedAt: null, body: baseline.body, editedAt: new Date(baseline.editedAt) });
  assert.equal(mutations[0].data.body, 'Edited'); assert.equal(emissions.length, 1);
});
test('a concurrent edit prevents both queued editing and deletion without emitting success', async () => {
  for (const action of ['update', 'delete']) {
    const { service, emissions } = fixture(0);
    await assert.rejects(action === 'update' ? service.editMessage(actor, 'conversation', 'message', 'Edited', baseline) : service.deleteMessage(actor, 'conversation', 'message', baseline), /تغيّرت الرسالة/);
    assert.equal(emissions.length, 0);
  }
});
test('offline replay retains author and moderation permission checks', async () => {
  const { service, mutations } = fixture(1, 'another-author');
  await assert.rejects(service.editMessage(actor, 'conversation', 'message', 'Edited', baseline), /مرسلها/);
  await assert.rejects(service.deleteMessage(actor, 'conversation', 'message', baseline), /مرسلها/);
  assert.equal(mutations.length, 0);
});

test('direct and group creation retain server contact policy checks at replay time', async () => {
 let creates=0;
 const service=new ChatService({user:{count:async()=>2},conversation:{create:async()=>{creates++;return {id:'new'};}}} as any,{} as any,{} as any,{assertCanContact:async()=>{throw new Error('contact denied');}} as any);
 await assert.rejects(service.createDirect(actor,{userId:'target'}),/contact denied/);
 await assert.rejects(service.createGroup(actor,{title:'Group',memberIds:['target']}),/contact denied/);
 assert.equal(creates,0);
});

test('a direct request from another device reuses an existing server thread', async () => {
 let creates=0;
 const service=new ChatService({conversation:{findFirst:async()=>({id:'existing'}),create:async()=>{creates++;return {id:'new'};}}} as any,{} as any,{} as any,{assertCanContact:async()=>({id:'target'})} as any);
 assert.equal((await service.createDirect(actor,{userId:'target'})).id,'existing');assert.equal(creates,0);
});
