import 'reflect-metadata';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { generateKeyPairSync, verify } from 'node:crypto';
import { PushProvider, PushSendError, safePushLink, signProviderJwt, validAndroidChannel } from './push-provider';
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
test('Android delivery uses a validated selected channel, with legacy fallback and silence', async () => {
  const originalFetch = global.fetch;
  const requests: any[] = [];
  const provider = new PushProvider({ FCM_PROJECT_ID: 'test-project', FCM_CLIENT_EMAIL: 'test', FCM_PRIVATE_KEY: 'test' });
  (provider as any).googleAccess = { token: 'test-only-token', expires: Date.now() + 60000 };
  global.fetch = (async (_url: any, options: any) => { requests.push(JSON.parse(options.body)); return { ok: true }; }) as any;
  try {
    const notice = { id: 'notice', title: 'test', body: null, link: '/notifications' };
    for (const channel of ['school-general-calm-v1', 'school-general-silent-v1', undefined, 'untrusted-channel', 'school-general-custom-v2-012345abcdef']) await provider.send('android', 'test-device', notice, channel);
    assert.equal(requests[0].message.android.notification.channel_id, 'school-general-calm-v1');
    assert.equal(requests[1].message.android.notification.channel_id, 'school-general-silent-v1');
    assert.equal(requests[1].message.android.notification.sound, undefined);
    assert.equal(requests[2].message.android.notification.channel_id, 'halaqat-updates');
    assert.equal(requests[3].message.android.notification.channel_id, 'halaqat-updates');
    assert.equal(requests[4].message.android.notification.channel_id, 'school-general-custom-v2-012345abcdef');
  } finally { global.fetch = originalFetch; }
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
function fixture(owner = 'recipient', failure?: Error, hidePreview = true) {
  const updates: any[] = []; const delivered: any[] = []; let sends = 0;
  const job: any = { id: 'job', deviceId: 'device', status: 'PENDING', attempts: 0, nextAttemptAt: new Date(0), notification: { id: 'notice', userId: 'recipient', isRead: false, title: 'Private title', body: 'Private student details', link: '/chat/conversation' }, device: {} };
  const tx: any = { $queryRaw: async () => [], notification: { findMany: async () => [] } };
  const prisma: any = { $transaction: async (run: any) => run(tx), user: { count: async () => 1 },
    pushDevice: { findUnique: async () => ({ id: 'device', userId: owner, token: 'opaque-token', platform: 'android', enabled: true, hidePreview }), updateMany: async (input: any) => updates.push(input) },
    pushDelivery: { findMany: async () => [job], updateMany: async () => ({ count: 1 }), update: async ({ data }: any) => updates.push(data) } };
  const service = new PushService(prisma); (service as any).provider = { send: async (_platform:any,_token:any,notice:any) => { delivered.push(notice); sends++; if (failure) throw failure; } };
  return { service, updates, delivered, sends: () => sends };
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

test('private push previews redact message content while preserving identity and navigation',async()=>{
 const hidden=fixture();await hidden.service.drain();assert.equal(hidden.delivered[0].title,'مدرسة عبدالله بن عمر');assert(!JSON.stringify(hidden.delivered[0]).includes('Private student'));assert.equal(hidden.delivered[0].id,'notice');assert.equal(hidden.delivered[0].link,'/chat/conversation');
 const visible=fixture('recipient',undefined,false);await visible.service.drain();assert.equal(visible.delivered[0].body,'Private student details');
});

test('notification v3 channels accept only known sounds and retain independent vibration in FCM', async () => {
  for (const sound of ['school','soft','bright','pulse','default','silent']) for (const vibration of ['0','1']) assert(validAndroidChannel(`school-general-${sound}-v3-b${vibration}`));
  assert(validAndroidChannel('school-general-custom-v3-012345abcdef-b1'));
  for (const bad of ['school-general-custom-v3-random-b1','school-general-custom-v3-b1','school-general-unknown-v3-b0','school-general-school-v3-b2']) assert.equal(validAndroidChannel(bad),false);
  const original=global.fetch;const requests:any[]=[];
  const provider=new PushProvider({FCM_PROJECT_ID:'test-project',FCM_CLIENT_EMAIL:'test',FCM_PRIVATE_KEY:'test'});(provider as any).googleAccess={token:'test',expires:Date.now()+60000};
  global.fetch=(async(_url:any,options:any)=>{requests.push(JSON.parse(options.body));return {ok:true};}) as any;
  try {
    await provider.send('android','device',{id:'n',title:'Notice',body:'Test',link:'/notifications'},'school-general-school-v3-b1');
    await provider.send('android','device',{id:'n',title:'Notice',body:'Test',link:'/notifications'},'school-general-silent-v3-b0');
    assert.equal(requests[0].message.android.notification.sound,'school_school');assert.deepEqual(requests[0].message.android.notification.vibrate_timings,['0s','0.14s']);
    assert.equal(requests[1].message.android.notification.sound,undefined);assert.deepEqual(requests[1].message.android.notification.vibrate_timings,['0s','0s']);
  } finally {global.fetch=original;}
});
