import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { test } from 'node:test';
import { PrismaClient } from '@prisma/client';
import { recoverSmsSchema } from './sms-schema';

test('SMS recovery repairs an unmanaged database atomically and preserves data on reruns', async () => {
  // Refuse production/hosted databases. The new database is disposable and is
  // the only database on which the destructive failure fixtures are created.
  const source = new URL(process.env.DATABASE_URL || 'postgresql://localhost/missing');
  assert.ok(['localhost', '127.0.0.1'].includes(source.hostname) && source.pathname === '/quran_test', 'Requires disposable local quran_test credentials');
  const name = `quran_sms_recovery_${randomBytes(6).toString('hex')}`;
  const target = new URL(source); target.pathname = `/${name}`;
  const admin = new PrismaClient({ datasources: { db: { url: source.href } } });
  let fixture: PrismaClient | undefined;
  let created = false;
  try {
    await admin.$connect();
    await admin.$executeRawUnsafe(`CREATE DATABASE "${name}"`); created = true;
    fixture = new PrismaClient({ datasources: { db: { url: target.href } } });
    await fixture.$connect();
    await assert.rejects(recoverSmsSchema(fixture, true), /Expected application tables are missing/);
    await fixture.$executeRawUnsafe('CREATE TABLE public.users (id TEXT PRIMARY KEY)');
    await fixture.$executeRawUnsafe('CREATE TABLE public.students (id TEXT PRIMARY KEY, name TEXT)');
    await fixture.$executeRawUnsafe("INSERT INTO public.students VALUES ('existing-student', 'Preserve this record')");
    await recoverSmsSchema(fixture, true);
    const campaign = await fixture.smsCampaign.create({ data: { requestKey: 'existing-operation', requestHash: 'test-hash', createdById: 'test-admin' } });
    const message = await fixture.smsMessage.create({ data: { campaignId: campaign.id, phone: '970591234567', title: 'Test only', encryptedText: 'encrypted-fixture', status: 'ACCEPTED' } });
    await fixture.smsTemplate.create({ data: { kind: 'NOTICE', text: 'Custom saved template' } });
    await recoverSmsSchema(fixture, true);
    assert.equal((await fixture.smsMessage.findUniqueOrThrow({ where: { id: message.id } })).status, 'ACCEPTED');
    assert.equal((await fixture.smsTemplate.findUniqueOrThrow({ where: { kind: 'NOTICE' } })).text, 'Custom saved template');
    assert.deepEqual(await fixture.$queryRawUnsafe('SELECT name FROM public.students'), [{ name: 'Preserve this record' }]);
    await assert.rejects(fixture.smsCampaign.create({ data: { requestKey: 'existing-operation', requestHash: 'different', createdById: 'test-admin' } }));
    assert.deepEqual(await fixture.$queryRawUnsafe("SELECT to_regclass('public._prisma_migrations')::text AS history"), [{ history: null }]);
    // An incompatible existing table must reject the entire repair. A table
    // created earlier in the transaction must not survive that failure.
    await fixture.$executeRawUnsafe('DROP TABLE public.sms_messages');
    await fixture.$executeRawUnsafe('DROP TABLE public.sms_templates');
    await fixture.$executeRawUnsafe('CREATE TABLE public.sms_templates (kind INTEGER PRIMARY KEY, text TEXT, "updatedAt" TIMESTAMP(3))');
    await assert.rejects(recoverSmsSchema(fixture, true), /Incompatible SMS schema/);
    assert.deepEqual(await fixture.$queryRawUnsafe("SELECT to_regclass('public.sms_messages')::text AS messages"), [{ messages: null }]);
    assert.deepEqual(await fixture.$queryRawUnsafe('SELECT name FROM public.students'), [{ name: 'Preserve this record' }]);
  } finally {
    await fixture?.$disconnect();
    if (created) await admin.$executeRawUnsafe(`DROP DATABASE "${name}"`);
    await admin.$disconnect();
  }
});
