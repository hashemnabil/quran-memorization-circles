import 'reflect-metadata';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { PrismaClient, Role } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { FounderAssetsController } from './assets.controller';
import { PopupsController } from './popups.controller';

test('founder uploads, private publication, acknowledgement replay and choices use real PostgreSQL transactions', async () => {
  const url = new URL(process.env.DATABASE_URL || 'postgresql://invalid/invalid');
  assert.equal(process.env.NODE_ENV, 'test', 'Integration requires NODE_ENV=test');
  assert.ok(['localhost', '127.0.0.1'].includes(url.hostname), 'Only a local disposable test database is allowed');
  assert.equal(url.pathname, '/quran_test', 'Only the disposable quran_test database is allowed');
  const prisma = new PrismaClient();
  const ownerId = randomUUID(), teacherId = randomUUID(), studentId = randomUUID();
  const password = randomBytes(24).toString('base64url');
  let noticeId: string | undefined;
  const assets = new FounderAssetsController(prisma as any), popups = new PopupsController(prisma as any);
  const owner: any = { id: ownerId, role: Role.FOUNDER };
  try {
    await prisma.user.create({ data: { id: ownerId, username: `test.owner.${ownerId}`, fullName: 'Integration Owner', role: Role.FOUNDER, passwordHash: await bcrypt.hash(password, 10) } });
    const content = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a2ioAAAAASUVORK5CYII=', 'base64');
    const image = await assets.upload(owner, { buffer: content } as any, { title: 'Private image', kind: 'ANNOUNCEMENT_IMAGE', password });
    const cover = await assets.upload(owner, { buffer: content } as any, { title: 'Cover', kind: 'PROFILE_COVER', password });
    const notice = await popups.save(owner, { title: 'Integration notice', body: 'Private audience', link: '', audience: [Role.TEACHER], password, publishedAt: new Date(Date.now() - 60000).toISOString(), expiresAt: new Date(Date.now() + 3600000).toISOString(), popup: { placement: 'AFTER', repeat: 'UNTIL_ACK', state: 'PUBLISHED', priority: 10, requireAck: true, important: false, buttonText: '', imageAssetId: image.id, videoAssetId: '' } });
    noticeId = notice.id;
    assert.equal((await popups.publicList()).some(row => row.id === notice.id), false);
    assert.equal((await popups.privateList({ id: teacherId, role: Role.TEACHER } as any)).some(row => row.id === notice.id), true);
    await assert.rejects(assets.content(image.id, {} as any));
    await assert.rejects(assets.privateContent({ id: studentId, role: Role.STUDENT } as any, image.id, {} as any));
    await popups.privateEvent({ id: teacherId, role: Role.TEACHER } as any, notice.id, { kind: 'ACK', eventKey: 'first' });
    await popups.privateEvent({ id: teacherId, role: Role.TEACHER } as any, notice.id, { kind: 'ACK', eventKey: 'retry' });
    assert.equal(await prisma.announcementReceipt.count({ where: { announcementId: notice.id, kind: 'ACK' } }), 1);
    await assets.choose({ id: teacherId } as any, 'PROFILE_COVER', { assetId: cover.id });
    await assets.choose({ id: teacherId } as any, 'PROFILE_COVER', { assetId: cover.id });
    assert.equal((await assets.choices({ id: teacherId } as any)).length, 1);
    await assert.rejects(assets.choose({ id: teacherId } as any, 'CHAT_BACKGROUND', { assetId: cover.id }));
  } finally {
    if (noticeId) { await prisma.announcementReceipt.deleteMany({ where: { announcementId: noticeId } }); await prisma.announcement.deleteMany({ where: { id: noticeId } }); }
    await prisma.presentationChoice.deleteMany({ where: { userId: teacherId } });
    await prisma.founderAsset.deleteMany({ where: { createdById: ownerId } });
    await prisma.activityLog.deleteMany({ where: { userId: ownerId } });
    await prisma.user.deleteMany({ where: { id: ownerId } });
    await prisma.$disconnect();
  }
});
