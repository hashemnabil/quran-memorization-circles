import 'reflect-metadata';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { normalizePhone, renderSms } from './sms-policy';
import { SmsService } from './sms.service';
import { randomBytes } from 'node:crypto';
import * as XLSX from 'xlsx';

test('Palestinian numbers normalize to the same international identity', () => {
  for (const phone of ['0591234567', '591234567', '+970 59 123 4567', '00970591234567', '٠٥٩١٢٣٤٥٦٧']) assert.equal(normalizePhone(phone), '+970591234567');
  assert.equal(normalizePhone('561234567'), '+970561234567');
  assert.equal(normalizePhone('970594370955'), '+970594370955');
  assert.equal(normalizePhone('00970594370955'), '+970594370955');
  for (const phone of ['', '059123', '970551234567', '123x456789', '000000000']) assert.throws(() => normalizePhone(phone));
});
test('personalization rejects missing and empty fields', () => {
  assert.equal(renderSms('مرحبًا {الاسم}', { الاسم: 'أحمد' }), 'مرحبًا أحمد');
  assert.throws(() => renderSms('{سبب الإنذار}', {}));
  assert.throws(() => renderSms('{الاسم}', { الاسم: ' ' }));
});
test('all spreadsheet formats preserve headers and leading zeroes', () => {
  const service = new SmsService({} as any);
  for (const bookType of ['xls', 'xlsx', 'csv'] as const) {
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([['الاسم', 'الهاتف'], ['أحمد', '0591234567']]));
    const result = service.import({ originalname: 'recipients.' + bookType, buffer: XLSX.write(book, { type: 'buffer', bookType }) } as any);
    assert.equal(result.rows[0]['الهاتف'], '0591234567');
  }
});
test('password columns import for explicitly confirmed temporary credential delivery', () => {
  const service = new SmsService({} as any);
  const result = service.import({ originalname: 'x.csv', buffer: Buffer.from('password,phone\ntemporary123,0591234567') } as any);
  assert.equal(result.rows[0].password, 'temporary123');
});
test('non-admin cannot enqueue and duplicate recipients fail before DB calls', async () => {
  const service = new SmsService({} as any);
  const body = { confirm: true, requestKey: 'test-request-12345', messages: [{ phone: '0591234567', text: 'اختبار' }, { phone: '+970591234567', text: 'اختبار' }] };
  await assert.rejects(service.enqueue({ role: 'TEACHER' } as any, body));
  await assert.rejects(service.enqueue({ id: 'admin', role: 'ADMIN' } as any, body));
});
test('retry selects only definitively failed messages below retry limit', async () => {
  let args: any;
  const service = new SmsService({ smsMessage: { updateMany: async (query: any) => { args = query; return { count: 1 }; } } } as any);
  await service.retry('campaign');
  assert.deepEqual(args.where, { campaignId: 'campaign', status: 'FAILED', attempts: { lt: 3 } });
});
test('lost-response enqueue retries reuse the persisted operation even with sending disabled', async () => {
  let stored: any, creates = 0;
  const oldEnv = { enabled: process.env.OFFLINESMS_ENABLED, api: process.env.OFFLINESMS_API_KEY, key: process.env.SMS_ENCRYPTION_KEY };
  process.env.OFFLINESMS_ENABLED = 'true'; process.env.OFFLINESMS_API_KEY = 'test-only'; process.env.SMS_ENCRYPTION_KEY = randomBytes(32).toString('base64');
  const database: any = { smsCampaign: {
    findUnique: async () => stored,
    create: async ({ data }: any) => { creates++; stored = { ...data, id: 'persisted-operation' }; return { id: stored.id }; },
  }, smsMessage: { createMany: async ({data}: any) => { stored.messages = data; } } };
  database.$transaction = async (run: any) => run(database);
  const service = new SmsService(database);
  const user: any = { id: 'admin', role: 'ADMIN' }, body = { confirm: true, requestKey: 'idempotency-test-123', messages: [{ phone: '0591234567', text: 'اختبار' }] };
  try {
    assert.deepEqual(await service.enqueue(user, body), { id: 'persisted-operation' });
    process.env.OFFLINESMS_ENABLED = 'false';
    assert.deepEqual(await service.enqueue(user, body), { id: 'persisted-operation' });
    assert.equal(creates, 1);
    assert.ok(!JSON.stringify(stored).includes('اختبار'));
    await assert.rejects(service.enqueue(user, { ...body, messages: [{ phone: '0591234567', text: 'محتوى مختلف' }] }));
  } finally {
    for (const [name, value] of Object.entries({ OFFLINESMS_ENABLED: oldEnv.enabled, OFFLINESMS_API_KEY: oldEnv.api, SMS_ENCRYPTION_KEY: oldEnv.key })) { if (value === undefined) delete process.env[name]; else process.env[name] = value; }
  }
});
test('application-only communication does not create SMS rows or require provider credentials', async () => {
  let saved: any;
  const old = process.env.OFFLINESMS_ENABLED; process.env.OFFLINESMS_ENABLED = 'false';
  const tx = { smsCampaign: { create: async ({ data }: any) => { saved = data; return { id: 'app-only' }; } } };
  const service = new SmsService({ smsCampaign: { findUnique: async () => null }, $transaction: async (run: any) => run(tx) } as any);
  const preview: any[] = [{ studentId: 's', userId: null, name: 'طالب', phone: '', text: 'نص', title: 'إشعار', error: '' }];
  service.preview = async () => preview;
  try {
    await service.communicate({ id: 'admin', role: 'ADMIN' } as any, { kind: 'NOTICE', channel: 'APP', confirm: true, requestKey: 'app-operation-1234', preview });
    assert.equal(saved.messages, undefined);
    await assert.rejects(service.communicate({ id: 'admin', role: 'ADMIN' } as any, { kind: 'NOTICE', channel: 'APP', confirm: true, requestKey: 'app-operation-1234', preview: [] }));
  } finally { if (old === undefined) delete process.env.OFFLINESMS_ENABLED; else process.env.OFFLINESMS_ENABLED = old; }
});
test('worker sends mocked provider requests once and never treats acceptance as delivery', async () => {
  const oldFetch = global.fetch;
  const oldEnv = { enabled: process.env.OFFLINESMS_ENABLED, api: process.env.OFFLINESMS_API_KEY, key: process.env.SMS_ENCRYPTION_KEY };
  process.env.OFFLINESMS_ENABLED = 'true'; process.env.OFFLINESMS_API_KEY = 'test-only'; process.env.SMS_ENCRYPTION_KEY = randomBytes(32).toString('base64');
  let state = 'QUEUED', calls = 0;
  const updates: any[] = [];
  const row: any = { id: 'message', phone: normalizePhone('970591234567'), title: 'اختبار' };
  const service = new SmsService({ smsMessage: {
    findMany: async () => state === 'QUEUED' ? [row] : [],
    updateMany: async (q: any) => { if (!q.where.id) return { count: 0 }; if (state !== 'QUEUED') return { count: 0 }; state = q.data.status; return { count: 1 }; },
    update: async (q: any) => { state = q.data.status; updates.push(q.data); },
  } } as any);
  row.encryptedText = (service as any).encrypt('رسالة اختبار');
  assert.ok(!row.encryptedText.includes('رسالة اختبار'));
  try {
    global.fetch = async (_url, options) => { calls++; const payload = JSON.parse(String(options?.body)); assert.deepEqual(Object.keys(payload.messages[0]).sort(), ['body', 'phone', 'title']); assert.equal(payload.messages[0].phone, '+970591234567'); return new Response('{"success":true}', { status: 200 }); };
    await service.work(); await service.work();
    assert.equal(calls, 1); assert.equal(state, 'ACCEPTED'); assert.ok(!JSON.stringify(updates).includes('رسالة اختبار'));
    state = 'QUEUED'; global.fetch = async () => { throw new Error('timeout'); };
    await service.work(); assert.equal(state, 'UNKNOWN');
    state = 'QUEUED'; global.fetch = async () => new Response('{"ok":true,"data":{}}', { status: 200 });
    await service.work(); assert.equal(state, 'ACCEPTED');
    state = 'QUEUED'; global.fetch = async () => new Response('{"ok":false,"error":{"code":"insufficient_points","message":"Not enough points"}}', { status: 400 });
    await service.work(); assert.equal(updates[updates.length - 1].errorCode, 'PROVIDER_BALANCE_OR_POINTS');
    state = 'QUEUED'; global.fetch = async () => new Response('{"unexpected":true}', { status: 200 });
    await service.work(); assert.equal(state, 'UNKNOWN');
    state = 'QUEUED'; global.fetch = async () => new Response('{}', { status: 401 });
    await service.work(); assert.equal(state, 'FAILED');
  } finally {
    global.fetch = oldFetch;
    for (const [name, value] of Object.entries({ OFFLINESMS_ENABLED: oldEnv.enabled, OFFLINESMS_API_KEY: oldEnv.api, SMS_ENCRYPTION_KEY: oldEnv.key })) { if (value === undefined) delete process.env[name]; else process.env[name] = value; }
  }
});
test('credential worker hashes temporary passwords, revokes sessions and encrypts the queued secret', async () => {
  const oldFetch = global.fetch;
  const original = { OFFLINESMS_ENABLED: process.env.OFFLINESMS_ENABLED, OFFLINESMS_API_KEY: process.env.OFFLINESMS_API_KEY, SMS_ENCRYPTION_KEY: process.env.SMS_ENCRYPTION_KEY };
  process.env.OFFLINESMS_ENABLED = 'true'; process.env.OFFLINESMS_API_KEY = 'test-only'; process.env.SMS_ENCRYPTION_KEY = randomBytes(32).toString('base64');
  let account: any, revoked = false, sentText = '', state = 'QUEUED';
  const row: any = { id: 'credentials', credential: true, phone: '970591234567', title: 'بيانات الدخول' };
  const tx: any = {
    user: { update: async ({data}: any) => { account = { ...data, isActive: true }; } },
    refreshToken: { updateMany: async () => { revoked = true; } },
    smsMessage: { update: async ({data}: any) => { if (data.encryptedText) row.encryptedText = data.encryptedText; } },
  };
  const service = new SmsService({
    $transaction: async (run: any) => run(tx), user: { findUnique: async () => account },
    smsMessage: {
      findMany: async () => state === 'QUEUED' ? [row] : [],
      updateMany: async (q: any) => { if (!q.where.id) return { count: 0 }; state = 'PROCESSING'; return { count: 1 }; },
      update: async ({data}: any) => { state = data.status; },
    },
  } as any);
  row.encryptedText = (service as any).encrypt('CREDENTIALS_PENDING:' + JSON.stringify({ userId: 'student-user', text: 'اسم المستخدم: student. كلمة المرور: [ستولّد كلمة مرور مؤقتة عند التأكيد]' }));
  try {
    global.fetch = async (_url, options) => { sentText = JSON.parse(String(options?.body)).messages[0].body; return new Response('{"success":true}'); };
    await service.work();
    assert.equal(state, 'ACCEPTED'); assert.equal(revoked, true); assert.equal(account.mustChangePassword, true);
    assert.match(account.passwordHash, /^\$2[aby]\$/); assert.ok(!sentText.includes('[ستولّد'));
    const password = sentText.split('كلمة المرور: ')[1];
    assert.ok(password.length >= 16); assert.ok(!row.encryptedText.includes(password));
    const bcrypt = await import('bcryptjs'); assert.equal(await bcrypt.compare(password, account.passwordHash), true);
  } finally {
    global.fetch = oldFetch;
    for (const [name,value] of Object.entries(original)) { if (value === undefined) delete process.env[name]; else process.env[name] = value; }
  }
});
