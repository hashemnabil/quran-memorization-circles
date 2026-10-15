import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { PrismaClient } from '@prisma/client';

// Never rehearse recovery against a hosted or application database.
const source = new URL(process.env.DATABASE_URL || 'postgresql://localhost/missing');
assert(['localhost', '127.0.0.1'].includes(source.hostname) && source.pathname === '/quran_test',
  'Recovery rehearsal requires disposable local quran_test credentials');
const name = `quran_recovery_${randomBytes(6).toString('hex')}`;
const target = new URL(source); target.pathname = `/${name}`;
const admin = new PrismaClient({ datasources: { db: { url: source.href } } });
const fixture = new PrismaClient({ datasources: { db: { url: target.href } } });
const cwd = fileURLToPath(new URL('../', import.meta.url));
const cli = fileURLToPath(new URL('../node_modules/prisma/build/index.js', import.meta.url));
const env = { ...process.env, DATABASE_URL: target.href, DIRECT_URL: target.href };
const run = args => {
  const result = spawnSync(process.execPath, [cli, ...args], { cwd, env, stdio: 'inherit', shell: false });
  assert.equal(result.status, 0, 'Recovery rehearsal command failed');
};
let created = false;
try {
  await admin.$executeRawUnsafe(`CREATE DATABASE "${name}"`); created = true;
  run(['migrate', 'deploy']);
  const student = await fixture.student.create({ data: { code: '320261234', fullName: 'Recovery test student', status: 'ACTIVITY' } });
  // Reproduce the supplied production metadata: application tables exist, but
  // six newer tables and Prisma migration history are missing.
  await fixture.$executeRawUnsafe('DROP TABLE registry_users, sync_changes, processed_operations, media_plans, teacher_duties, teacher_duty_assignments CASCADE');
  await fixture.$executeRawUnsafe('DROP TABLE _prisma_migrations');
  await fixture.$disconnect();
  run(['db', 'execute', '--file', 'prisma/recovery/add-missing-offline-tables.sql', '--schema', 'prisma/schema.prisma']);
  assert.equal((await fixture.student.findUniqueOrThrow({ where: { id: student.id } })).fullName, student.fullName);
  const tables = await fixture.$queryRawUnsafe("SELECT tablename FROM pg_tables WHERE schemaname = 'public'");
  for (const table of ['registry_users', 'sync_changes', 'processed_operations', 'media_plans', 'teacher_duties', 'teacher_duty_assignments']) {
    assert(tables.some(row => row.tablename === table), `${table} must exist after recovery`);
  }
  assert(!tables.some(row => row.tablename === '_prisma_migrations'), 'Recovery must not invent migration history');
  await fixture.student.update({ where: { id: student.id }, data: { address: 'After recovery' } });
  assert(await fixture.syncChange.count({ where: { entity: 'students', entityId: student.id } }) > 0);
  const opId = 'recovery-operation';
  await fixture.processedOperation.create({ data: { opId, accountId: 'test-account', result: { status: 'applied' } } });
  assert(await fixture.processedOperation.findUnique({ where: { opId_accountId: { opId, accountId: 'test-account' } } }));
  console.log('Recovery preserved the existing student, restored all six tables, and enabled journal and receipt writes.');
} finally {
  await fixture.$disconnect();
  if (created) await admin.$executeRawUnsafe(`DROP DATABASE "${name}"`);
  await admin.$disconnect();
}
