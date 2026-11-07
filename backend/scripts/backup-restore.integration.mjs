import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
const source = new URL(process.env.DATABASE_URL || 'postgresql://localhost/missing');
if (!['localhost', '127.0.0.1'].includes(source.hostname) || source.pathname !== '/quran_test') throw new Error('Restore rehearsal requires disposable local quran_test');
const env = { ...process.env, PGHOST: source.hostname, PGPORT: source.port || '5432', PGUSER: decodeURIComponent(source.username), PGPASSWORD: decodeURIComponent(source.password), PGDATABASE: 'quran_test' };
const run = (program, args, extra = {}) => {
  const result = spawnSync(program, args, { env: { ...env, ...extra }, encoding: 'utf8' });
  if (result.error || result.status !== 0) throw new Error(`${program} failed: ${result.stderr?.slice(0, 1000) || result.error?.message}`);
  return result.stdout.trim();
};
const query = (sql, database = 'quran_test') => run('psql', ['-X', '-A', '-t', '-v', 'ON_ERROR_STOP=1', '-c', sql], { PGDATABASE: database });
const root = await mkdtemp(join(process.cwd(), '.backup-rehearsal-'));
try {
  const uploads = join(root, 'uploads'); await mkdir(uploads); await writeFile(join(uploads, 'test.txt'), 'synthetic upload');
  const backup = join(root, 'backup');
  run(process.execPath, ['scripts/backup.mjs', '--output', backup, '--uploads', uploads], { BACKUP_DATABASE_URL: source.toString() });
  query('CREATE DATABASE quran_restore_test');
  const target = new URL(source); target.pathname = '/quran_restore_test';
  run(process.execPath, ['scripts/restore.mjs', '--backup', backup, '--confirm-database', 'quran_restore_test'], { RESTORE_DATABASE_URL: target.toString() });
  const tableCount = "SELECT count(*) FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE'";
  assert.equal(query(tableCount, 'quran_restore_test'), query(tableCount));
  for (const table of ['_prisma_migrations', 'users', 'students', 'circles', 'activity_logs', 'processed_operations', 'sync_changes']) {
    assert.equal(query(`SELECT count(*) FROM "${table}"`, 'quran_restore_test'), query(`SELECT count(*) FROM "${table}"`), `restored ${table} count`);
  }
  // A second restore must refuse existing data rather than replacing it.
  const refused = spawnSync(process.execPath, ['scripts/restore.mjs', '--backup', backup, '--confirm-database', 'quran_restore_test'], { env: { ...env, RESTORE_DATABASE_URL: target.toString() }, encoding: 'utf8' });
  assert.notEqual(refused.status, 0);
  query('DROP DATABASE quran_restore_test');
  console.log('Backup/restore rehearsal passed on disposable PostgreSQL, including refusal to overwrite existing tables.');
} finally { await rm(root, { recursive: true, force: true }); }
