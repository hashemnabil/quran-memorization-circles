import 'reflect-metadata';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { generateKeyPairSync, verify } from 'node:crypto';
import { PushProvider, PushSendError, safePushLink, signProviderJwt } from './push-provider';
import { PushService } from './push.service';
import { ChangePasswordDto } from '../auth/dto/auth.dto';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

test('new chosen passwords may be short while the current legacy password is accepted', async () => {
  assert.equal((await validate(plainToInstance(ChangePasswordDto, { currentPassword: '4827', newPassword: 'School River 27' }))).length, 0);
  assert.equal((await validate(plainToInstance(ChangePasswordDto, { currentPassword: 'existing', newPassword: '482' }))).length, 0);
  assert((await validate(plainToInstance(ChangePasswordDto, { currentPassword: 'existing', newPassword: '' }))).length > 0);
});
test('provider credentials remain server-side, and missing setup never attempts a send', async () => {
  const provider = new PushProvider({});
  assert.equal(provider.ready('android'), false); assert.equal(provider.ready('ios'), false);
  await assert.rejects(provider.send('android', 'device', { id: 'id', title: 'notice', body: null, link: null }), /PROVIDER_NOT_CONFIGURED/);
  for (const link of ['https://example.com', '//example.com', 'javascript:alert(1)', '/\\example.com']) assert.equal(safePushLink(link), '/notifications');
  assert.equal(safePushLink('/student'), '/student');
});
test('Google RS256 and Apple ES256 provider tokens have valid signatures', () => {
  for (const apple of [false, true]) {
    const pair = apple ? generateKeyPairSync('ec', { namedCurve: 'P-256' }) : generateKeyPairSync('rsa', { modulusLength: 2048 });
    const key = pair.privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
    const token = signProviderJwt({ alg: apple ? 'ES256' : 'RS256' }, { iss: 'test', iat: 1 }, key, apple ? 'SHA256' : 'RSA-SHA256');
    const [head, body, signature] = token.split('.');
    assert(verify(apple ? 'SHA256' : 'RSA-SHA256', Buffer.from(`${head}.${body}`), { key: pair.publicKey, ...(apple ? { dsaEncoding: 'ieee-p1363' as const } : {}) }, Buffer.from(signature, 'base64url')));
  }
});
function fixture(owner = 'recipient', failure?: Error) {
  const updates: any[] = []; let sends = 0;
  const job: any = { id: 'job', deviceId: 'device', status: 'PENDING', attempts: 0, nextAttemptAt: new Date(0), notification: { id: 'notice', userId: 'recipient', isRead: false }, device: {} };
  const tx: any = { $queryRaw: async () => [], notification: { findMany: async () => [] } };
  const prisma: any = { $transaction: async (run: any) => run(tx), user: { count: async () => 1 },
    pushDevice: { findUnique: async () => ({ id: 'device', userId: owner, token: 'opaque-token', platform: 'android', enabled: true }), updateMany: async (input: any) => updates.push(input) },
    pushDelivery: { findMany: async () => [job], updateMany: async () => ({ count: 1 }), update: async ({ data }: any) => updates.push(data) } };
  const service = new PushService(prisma); (service as any).provider = { send: async () => { sends++; if (failure) throw failure; } };
  return { service, updates, sends: () => sends };
}
test('queued notices cannot be sent to the next account using the same device', async () => {
  const { service, updates, sends } = fixture('another-account'); await service.drain();
  assert.equal(sends(), 0); assert.equal(updates[0].status, 'SKIPPED');
});
test('transient failures retain a retry; invalidated device tokens disable only that token', async () => {
  const retry = fixture('recipient', new Error('temporary network failure')); await retry.service.drain();
  assert.equal(retry.updates[0].status, 'PENDING'); assert(retry.updates[0].nextAttemptAt > new Date());
  const invalid = fixture('recipient', new PushSendError('UNREGISTERED', true)); await invalid.service.drain();
  assert.deepEqual(invalid.updates[0].where, { id: 'device', token: 'opaque-token' });
  assert.equal(invalid.updates[1].status, 'FAILED');
});
