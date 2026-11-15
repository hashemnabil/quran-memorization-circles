import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ConversationType, Role } from '@prisma/client';
import { ChatService } from './chat.service';

const actor = { id: 'member', role: Role.TEACHER } as any;

test('muted group member cannot send a message', async () => {
  let created = false;
  const prisma = {
    conversationMember: { findFirst: async () => ({ id: 'membership', isMuted: true, isAdmin: false }), findMany: async () => [] },
    conversation: { findUnique: async () => ({ type: ConversationType.GROUP, isClosed: false, adminOnly: false }) },
    message: { create: async () => { created = true; } },
  };
  const service = new ChatService(prisma as any, {} as any, {} as any, {} as any);
  (service as any).assertAllContactable = async () => {};
  await assert.rejects(service.send(actor, 'group', { body: 'blocked' }), /أوقف مشرف المجموعة/);
  assert.equal(created, false);
});

test('invite join respects contact permissions and does not add a member when denied', async () => {
  let added = false;
  const prisma = {
    conversation: { findFirst: async () => ({ id: 'group', members: [{ userId: 'existing' }] }) },
    conversationMember: { upsert: async () => { added = true; } },
  };
  const service = new ChatService(prisma as any, {} as any, {} as any, {} as any);
  (service as any).assertAllContactable = async () => { throw new Error('contact denied'); };
  await assert.rejects(service.joinByInvite(actor, 'code'), /contact denied/);
  assert.equal(added, false);
});
