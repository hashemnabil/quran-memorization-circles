import assert from 'node:assert/strict';
import { test } from 'node:test';
import { checkOfflineSmsConnection, providerFailureCode, safeProbeReason, smsConfiguration } from './sms-readiness';
import { SmsService } from './sms.service';

test('SMS configuration exposes only booleans and distinguishes missing settings', () => {
  assert.deepEqual(smsConfiguration({}), { apiKeyConfigured: false, encryptionKeyConfigured: false, sendingEnabled: false });
  const config = smsConfiguration({ OFFLINESMS_API_KEY: 'test-secret', SMS_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString('base64'), OFFLINESMS_ENABLED: 'true' });
  assert.deepEqual(config, { apiKeyConfigured: true, encryptionKeyConfigured: true, sendingEnabled: true });
  assert.ok(!JSON.stringify(config).includes('test-secret'));
});

test('provider check never contains a recipient/text and confirms auth using an empty invalid batch', async () => {
  const requests: any[] = [];
  const send: any = async (url: string, options: any) => {
    requests.push({ url, options });
    return requests.length === 1 ? new Response('{}', { status: 401 }) : new Response('{"errors":{"messages":["required"]}}', { status: 422 });
  };
  const result = await checkOfflineSmsConnection('test-secret', send);
  assert.equal(result.outcome, 'AUTHENTICATION_CONFIRMED_ZERO_RECIPIENTS');
  assert.equal(requests.length, 2);
  for (const { options } of requests) assert.deepEqual(JSON.parse(options.body), { messages: [] });
  assert.equal(requests[0].options.headers.Authorization, undefined);
  assert.equal(requests[1].options.headers.Authorization, 'Bearer test-secret');
  assert.ok(!JSON.stringify(result).includes('test-secret'));
});

test('provider check does not accept bad credentials, redirects or ambiguous responses', async () => {
  assert.equal((await checkOfflineSmsConnection('test', async () => new Response('{}', { status: 401 }))).outcome, 'API_KEY_REJECTED');
  assert.equal((await checkOfflineSmsConnection('test', async () => new Response('{}', { status: 404 }))).outcome, 'AUTHENTICATION_NOT_CONFIRMED');
  assert.equal((await checkOfflineSmsConnection('test', async () => { throw new Error('must not log a secret'); })).outcome, 'CONNECTION_FAILED');
});

test('readiness cannot claim safety to provision encryption when storage is unavailable', async () => {
  const service = new SmsService({ smsMessage: { count: async () => { throw new Error('database unavailable'); } } } as any);
  const result = await service.readiness();
  assert.equal(result.schemaReady, false); assert.equal(result.encryptedPayloadsPresent, null); assert.equal(result.ready, false);
});

test('only zero-recipient validation reasons can be exposed and secrets/contacts are rejected', () => {
  assert.equal(safeProbeReason({ error: 'messages_required' }, 'test-secret'), 'messages_required');
  for (const error of ['test-secret', 'phone 970591234567 rejected', 'user@example.com', 'offmsg_live_example', 'Bearer secret', 'abcdefghijklmnopqrstuvwxyz123456']) assert.equal(safeProbeReason({ error }, 'test-secret'), undefined);
});

test('real-message rejection classification never retains personal provider text', () => {
  assert.equal(providerFailureCode({ error: 'Not enough points' }, 400), 'PROVIDER_BALANCE_OR_POINTS');
  assert.equal(providerFailureCode({ message: 'Phone 970591234567 invalid' }, 400), 'PROVIDER_RECIPIENT_INVALID');
  assert.equal(providerFailureCode({ error: 'No relay device available' }, 400), 'PROVIDER_SENDER_UNAVAILABLE');
  assert.equal(providerFailureCode({ error: 'Unknown failure with private text' }, 400), 'HTTP_400');
});
