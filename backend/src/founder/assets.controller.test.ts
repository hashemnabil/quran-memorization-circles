import 'reflect-metadata';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FounderAssetsController } from './assets.controller';
const asset = { id: 'image', kind: 'ANNOUNCEMENT_IMAGE', isActive: true, mime: 'image/png', content: Buffer.from('private-image') };
const notice = { isActive: true, audience: ['TEACHER'], publishedAt: new Date('2020-01-01'), expiresAt: new Date('2099-01-01'), popup: { placement: 'AFTER', repeat: 'ONCE_USER', state: 'PUBLISHED', priority: 0, requireAck: false, important: false, buttonText: '', imageAssetId: asset.id } };
test('private advertisement image cannot be obtained from public content route', async () => {
  const controller = new FounderAssetsController({ founderAsset: { findFirst: async () => asset }, announcement: { findMany: async () => [notice] } } as any);
  await assert.rejects(controller.content(asset.id, {} as any));
});
test('private content checks current role and sets private no-store response headers', async () => {
  const controller = new FounderAssetsController({ founderAsset: { findFirst: async () => asset }, announcement: { findMany: async () => [notice] } } as any);
  await assert.rejects(controller.privateContent({ role: 'STUDENT' } as any, asset.id, {} as any));
  let headers: any, content: any;
  await controller.privateContent({ role: 'TEACHER' } as any, asset.id, { set: (value: any) => { headers = value; }, send: (value: any) => { content = value; } } as any);
  assert.equal(headers['Cache-Control'], 'private, no-store'); assert.deepEqual(content, asset.content);
});
test('ordinary catalog does not reveal advertisement media metadata', async () => {
  let query: any;
  const controller = new FounderAssetsController({ founderAsset: { findMany: async (value: any) => { query = value; return []; } } } as any);
  await controller.list({ role: 'STUDENT' } as any);
  assert.deepEqual(query.where.kind, { notIn: ['ANNOUNCEMENT_IMAGE', 'ANNOUNCEMENT_VIDEO'] });
});
