#!/usr/bin/env node
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
async function sha256(path) { const hash = createHash('sha256'); for await (const chunk of createReadStream(path)) hash.update(chunk); return hash.digest('hex'); }

const args = process.argv.slice(2);
const option = (name) => args[args.indexOf(name) + 1];
const target = args.includes('--output') ? resolve(option('--output')) : null;
const source = process.env.BACKUP_DATABASE_URL || process.env.DIRECT_URL;
if (!target || !source) throw new Error('Usage: BACKUP_DATABASE_URL=<direct URL> node scripts/backup.mjs --output <new backup directory> [--uploads <directory>]');
const url = new URL(source);
if (!['postgres:', 'postgresql:'].includes(url.protocol)) throw new Error('A direct PostgreSQL URL is required');
const env = { ...process.env, PGHOST: url.hostname, PGPORT: url.port || '5432', PGUSER: decodeURIComponent(url.username), PGPASSWORD: decodeURIComponent(url.password), PGDATABASE: decodeURIComponent(url.pathname.slice(1)) };
if (url.searchParams.has('sslmode')) env.PGSSLMODE = url.searchParams.get('sslmode');
await mkdir(target, { recursive: false, mode: 0o700 });
const run = (program, parameters) => {
  const result = spawnSync(program, parameters, { env, stdio: ['ignore', 'ignore', 'pipe'] });
  if (result.error || result.status !== 0) throw new Error(`${program} failed; backup is incomplete (check tool availability, connection and PostgreSQL client version)`);
};
const dump = join(target, 'database.dump');
run('pg_dump', ['--format=custom', '--no-owner', '--no-privileges', '--file', dump]);
const manifest = { version: 1, createdAt: new Date().toISOString(), database: env.PGDATABASE, files: {} };
manifest.files['database.dump'] = await sha256(dump);
if (args.includes('--uploads')) {
  run('tar', ['-czf', join(target, 'uploads.tar.gz'), '-C', resolve(option('--uploads')), '.']);
  manifest.files['uploads.tar.gz'] = await sha256(join(target, 'uploads.tar.gz'));
}
await writeFile(join(target, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, { mode: 0o600 });
console.log('Backup completed. Store the directory encrypted off-host and rehearse restoration in an isolated database.');
