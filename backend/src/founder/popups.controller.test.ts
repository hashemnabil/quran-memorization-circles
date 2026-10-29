import 'reflect-metadata';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Prisma } from '@prisma/client';
import { PopupsController } from './popups.controller';
const row = { id: 'notice', title: 'اختبار', body: '', link: null, isActive: true, audience: [] as string[], publishedAt: new Date('2020-01-01'), expiresAt: new Date('2099-01-01'), popup: { placement: 'BOTH', repeat: 'UNTIL_ACK', state: 'PUBLISHED', priority: 0, requireAck: true, important: false, buttonText: '', imageAssetId: '' } };
const user: any = { id: 'student', role: 'STUDENT' };
test('public controller filters private notices and never queries private receipts', async () => {
  let query: any;
  const controller = new PopupsController({ announcement: { findMany: async (value: any) => { query = value; return [row, { ...row, id: 'private', audience: ['TEACHER'] }]; } } } as any);
  const result = await controller.publicList();
  assert.equal(result.length, 1); assert.equal(result[0].id, row.id);
  assert.deepEqual(query.where.AND[1], { OR: [{ audience: { isEmpty: true } }] });
  assert.deepEqual(result[0].receipts, []);
});
test('read confirmation identity comes from session and retries reuse one receipt', async () => {
  const receipts: any[] = [];
  const controller = new PopupsController({ announcement: { findFirst: async () => row }, announcementReceipt: { create: async ({ data }: any) => {
    if (receipts.length) throw new Prisma.PrismaClientKnownRequestError('duplicate', { code: 'P2002', clientVersion: 'test' });
    receipts.push(data);
  } } } as any);
  await controller.privateEvent(user, row.id, { kind: 'ACK', eventKey: 'one', userId: 'other-account' });
  await controller.privateEvent(user, row.id, { kind: 'ACK', eventKey: 'two' });
  assert.equal(receipts.length, 1); assert.equal(receipts[0].subject, 'user:student'); assert.equal(receipts[0].eventKey, 'ack');
});
test('anonymous confirmation and mismatched role confirmation are rejected', async () => {
  const controller = new PopupsController({ announcement: { findFirst: async () => ({ ...row, audience: ['TEACHER'] }) } } as any);
  await assert.rejects(controller.privateEvent(user, row.id, { kind: 'ACK', eventKey: 'ack' }));
  await assert.rejects(controller.publicEvent(row.id, { kind: 'ACK', eventKey: 'ack', device: '00000000-0000-4000-8000-000000000001' }));
});
test('founder management routes carry founder restriction and public route alone is public', () => {
  assert.deepEqual(Reflect.getMetadata('roles', PopupsController.prototype.save), ['FOUNDER']);
  assert.deepEqual(Reflect.getMetadata('roles', PopupsController.prototype.manage), ['FOUNDER']);
  assert.equal(Reflect.getMetadata('isPublic', PopupsController.prototype.publicList), true);
  assert.equal(Reflect.getMetadata('isPublic', PopupsController.prototype.privateList), undefined);
});
