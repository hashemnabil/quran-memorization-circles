#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
async function sha256(path) { const hash = createHash('sha256'); for await (const chunk of createReadStream(path)) hash.update(chunk); return hash.digest('hex'); }
const args = process.argv.slice(2);
const option = (name) => args[args.indexOf(name) + 1];
if (!args.includes('--backup') || !args.includes('--confirm-database') || !process.env.RESTORE_DATABASE_URL) throw new Error('Usage: RESTORE_DATABASE_URL=<isolated empty database URL> node scripts/restore.mjs --backup <directory> --confirm-database <target database name>');
const url = new URL(process.env.RESTORE_DATABASE_URL);
const database = decodeURIComponent(url.pathname.slice(1));
if (!['postgres:', 'postgresql:'].includes(url.protocol) || option('--confirm-database') !== database) throw new Error('Target database confirmation does not match');
const directory = resolve(option('--backup'));
const manifest = JSON.parse(await readFile(join(directory, 'manifest.json'), 'utf8'));
const dump = join(directory, 'database.dump');
const digest = await sha256(dump);
if (manifest.version !== 1 || digest !== manifest.files?.['database.dump']) throw new Error('Backup checksum validation failed');
const env = { ...process.env, PGHOST: url.hostname, PGPORT: url.port || '5432', PGUSER: decodeURIComponent(url.username), PGPASSWORD: decodeURIComponent(url.password), PGDATABASE: database };
if (url.searchParams.has('sslmode')) env.PGSSLMODE = url.searchParams.get('sslmode');
const probe = spawnSync('psql', ['-X', '-A', '-t', '-v', 'ON_ERROR_STOP=1', '-c', "SELECT count(*) FROM information_schema.tables WHERE table_schema NOT IN ('pg_catalog', 'information_schema') AND table_type = 'BASE TABLE'"], { env, encoding: 'utf8' });
if (probe.error || probe.status !== 0 || probe.stdout.trim() !== '0') throw new Error('Restore requires a reachable empty database; existing data is never dropped');
const restored = spawnSync('pg_restore', ['--dbname', database, '--single-transaction', '--exit-on-error', '--no-owner', '--no-privileges', dump], { env, stdio: ['ignore', 'ignore', 'pipe'] });
if (restored.error || restored.status !== 0) throw new Error('Restore failed and was rolled back; check PostgreSQL client compatibility');
console.log('Database restored. Reconcile upload checksums and verify migrations, record counts and application roles before using it.');
