import 'dotenv/config';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const backend = fileURLToPath(new URL('../', import.meta.url));

export async function startProduction({ env = process.env, migrate = spawnSync, start = () => import('../dist/main.js') } = {}) {
  if (!env.DATABASE_URL) throw new Error('DATABASE_URL is required before applying database migrations.');
  const result = migrate(process.execPath, [
    fileURLToPath(new URL('../node_modules/prisma/build/index.js', import.meta.url)),
    'migrate', 'deploy', '--schema', fileURLToPath(new URL('../prisma/schema.prisma', import.meta.url)),
  ], {
    cwd: backend, stdio: 'inherit', shell: false,
    env: { ...env, DIRECT_URL: env.DIRECT_URL || env.DATABASE_URL },
  });
  if (result.error || result.status !== 0) throw new Error('Database migrations failed; the API was not started. Check the migration log above.');
  await start();
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  startProduction().catch(error => { console.error(error.message); process.exitCode = 1; });
}
