import assert from 'node:assert/strict';
import { test } from 'node:test';
import { recoverSmsSchema } from './sms-schema';

test('SMS schema repair never touches a database without explicit opt-in', async () => {
  const client = { $transaction: () => { throw new Error('must not run'); } };
  assert.equal(await recoverSmsSchema(client as any, false), false);
});

test('SMS schema repair is one bounded transaction and propagates a rejected repair', async () => {
  const statements: string[] = [];
  const client = { $transaction: async (run: any, options: any) => {
    assert.equal(options.timeout, 65000);
    return run({ $executeRawUnsafe: async (sql: string) => { statements.push(sql); if (sql.startsWith('DO ')) throw new Error('incompatible schema'); } });
  } };
  await assert.rejects(recoverSmsSchema(client as any, true), /incompatible schema/);
  assert.equal(statements.length, 3);
  assert.match(statements[2], /CREATE TABLE IF NOT EXISTS public.sms_templates/);
  assert.doesNotMatch(statements[2], /\b(?:DROP|TRUNCATE|ALTER|UPDATE)\b|\bDELETE\s+FROM\b|_prisma_migrations/i);
});
