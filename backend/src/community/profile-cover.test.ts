import 'reflect-metadata';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CommunityController } from './community.controller';

const actor = { id: 'owner', role: 'TEACHER' } as any;
const requestId = '00000000-0000-4000-8000-000000000099';
const file = { buffer: Buffer.from([137,80,78,71,13,10,26,10]), mimetype: 'image/png' } as any;
test('cover upload is owned by the signed-in account and a retry reuses the same media', async () => {
  let media: any, creates = 0, choice: any;
  const tx = { communityMedia: { findUnique: async () => media, create: async ({ data }: any) => { creates++; return media = data; } }, presentationChoice: { upsert: async (args: any) => { choice = args; } } };
  const controller = new CommunityController({ $transaction: async (fn: any) => fn(tx) } as any);
  assert.deepEqual(await controller.uploadProfileCover(actor, file, requestId), { coverMediaId: requestId });
  assert.equal(media.ownerId, actor.id);
  assert.equal(choice.where.userId_kind.userId, actor.id);
  assert.equal(choice.where.userId_kind.kind, 'PROFILE_COVER_UPLOAD');
  await controller.uploadProfileCover(actor, file, requestId);
  assert.equal(creates, 1);
  await assert.rejects(controller.uploadProfileCover({ ...actor, id: 'another' }, file, requestId), /لا يخص/);
  await assert.rejects(controller.uploadProfileCover(actor, { ...file, buffer: Buffer.from('not an image') }, requestId), /اختر صورة/);
  await assert.rejects(controller.uploadProfileCover(actor, file, 'invalid'), /اختر صورة/);
});

test('only a selected cover of an active owner grants extra image visibility', async () => {
  let selected = true, bytesRead = 0;
  const controller = new CommunityController({
    communityMedia: { count: async ({ where }: any) => where.owner ? (assert.equal(where.ownerId, 'owner'), 1) : 0, findUnique: async () => { bytesRead++; return { mime: 'image/png', bytes: file.buffer }; } },
    communityPost: { count: async () => 0 }, communityStory: { count: async () => 0 }, message: { count: async () => 0 },
    presentationChoice: { findFirst: async ({ where }: any) => { assert.equal(where.kind, 'PROFILE_COVER_UPLOAD'); return selected ? { userId: 'owner' } : null; } },
  } as any);
  let headers: any;
  const response: any = { set: (value: any) => { headers = value; return response; }, send: (bytes: Buffer) => bytes };
  await controller.media({ ...actor, id: 'viewer' }, requestId, response);
  assert.equal(headers['Cache-Control'], 'private, no-store');
  assert.equal(bytesRead, 1);
  selected = false;
  await assert.rejects(controller.media(actor, 'private-image', response), /غير متاحة/);
  assert.equal(bytesRead, 1);
});
test('removing a cover clears only the authenticated account selection', async () => {
  let where: any;
  const controller = new CommunityController({ presentationChoice: { deleteMany: async (args: any) => { where = args.where; } } } as any);
  assert.deepEqual(await controller.removeProfileCover(actor), { coverMediaId: null });
  assert.deepEqual(where, { userId: actor.id, kind: 'PROFILE_COVER_UPLOAD' });
});
