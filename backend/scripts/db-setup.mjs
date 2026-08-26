/**
 * One-shot database setup: apply every migration, then load the demo data.
 *
 * Works against a local PostgreSQL and against a hosted one (Neon, Supabase…).
 * Hosted databases need three things that a plain `prisma migrate deploy` does
 * not do on its own, and each of them is a real failure we hit:
 *
 *   1. Migrations must run over the DIRECT endpoint, never the pooled one — a
 *      transaction pooler cannot hold the session Prisma Migrate needs.
 *   2. A free-tier endpoint suspends when idle. The first connection wakes it,
 *      which takes longer than Prisma's 10s advisory-lock timeout and fails
 *      with `P1002 … pg_advisory_lock`. So we wake it first, then migrate.
 *   3. The advisory lock only guards *concurrent* migrations. A single operator
 *      running setup does not need it, and on a sleepy endpoint it is the thing
 *      that breaks. It is disabled for this script only.
 *
 * Uses the Prisma binary installed in this project — it never installs or
 * upgrades Prisma globally.
 */
import { spawnSync } from 'child_process';
import { existsSync, readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const backend = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const prismaBin = path.join(backend, 'node_modules', 'prisma', 'build', 'index.js');

if (!existsSync(prismaBin)) {
  console.error('لم يُعثر على Prisma داخل المشروع. شغّل: npm --prefix backend install');
  process.exit(1);
}

function readEnvFile() {
  const file = path.join(backend, '.env');
  if (!existsSync(file)) {
    console.error('الملف backend/.env غير موجود. انسخ backend/.env.example وعدّله.');
    process.exit(1);
  }
  const text = readFileSync(file, 'utf8');
  const pick = (key) => text.match(new RegExp(`^${key}="?([^"\\r\\n]+)"?`, 'm'))?.[1];
  return { database: pick('DATABASE_URL'), direct: pick('DIRECT_URL') };
}

const { database, direct } = readEnvFile();
if (!database) {
  console.error('DATABASE_URL غير معرّف في backend/.env');
  process.exit(1);
}
// Falling back keeps a plain local PostgreSQL working with no extra setup.
const migrationUrl = direct || database;

const host = (() => {
  try {
    return new URL(migrationUrl).hostname;
  } catch {
    return '(غير معروف)';
  }
})();
const remote = !/^(localhost|127\.0\.0\.1|::1)$/.test(host);

if (remote && !direct) {
  console.warn(
    '\n⚠️  DIRECT_URL غير معرّف مع قاعدة بيانات بعيدة.\n' +
      '   إذا كان DATABASE_URL يشير إلى نقطة مجمّعة (pooler) فستفشل الترحيلات.\n' +
      '   راجع قسم "قاعدة بيانات سحابية" في README.\n',
  );
}
if (remote && /-pooler\./.test(host)) {
  console.warn(`\n⚠️  عنوان الترحيلات (${host}) يبدو نقطة مجمّعة — استخدم النقطة المباشرة.\n`);
}

/** Opens a connection so a suspended serverless endpoint is awake before we migrate. */
async function wakeDatabase() {
  const { PrismaClient } = await import('@prisma/client');
  const prisma = new PrismaClient({ datasources: { db: { url: migrationUrl } } });
  for (let attempt = 1; attempt <= 5; attempt += 1) {
    const started = Date.now();
    try {
      await prisma.$queryRaw`SELECT 1`;
      console.log(`✓ قاعدة البيانات مستيقظة (${host}) خلال ${Date.now() - started}ms`);
      await prisma.$disconnect();
      return;
    } catch (error) {
      const message = String(error.message).split('\n').find((l) => l.trim()) ?? '';
      console.log(`… محاولة إيقاظ ${attempt}/5 لم تنجح: ${message.slice(0, 110)}`);
      await new Promise((r) => setTimeout(r, 3000));
    }
  }
  await prisma.$disconnect();
  console.error(`\n✗ تعذر الوصول إلى قاعدة البيانات على ${host}.`);
  console.error('  تحقّق من صحة DIRECT_URL ومن أن الجدار الناري يسمح بالمنفذ 5432.\n');
  process.exit(1);
}

/**
 * Runs a Node script from this project. `shell` stays off on purpose: the path
 * to node.exe contains a space on Windows, which a shell would split.
 */
function runNode(label, args, extraEnv = {}) {
  console.log(`\n▸ ${label}`);
  const result = spawnSync(process.execPath, args, {
    cwd: backend,
    stdio: 'inherit',
    shell: false,
    env: { ...process.env, PRISMA_HIDE_UPDATE_MESSAGE: 'true', ...extraEnv },
  });
  if (result.status !== 0) {
    console.error(`\n✗ فشلت الخطوة: ${label}`);
    process.exit(result.status ?? 1);
  }
}

await wakeDatabase();

runNode('تطبيق الترحيلات', [prismaBin, 'migrate', 'deploy'], {
  PRISMA_SCHEMA_DISABLE_ADVISORY_LOCK: 'true',
});

// The seed runs over the direct endpoint too: it issues thousands of statements
// and the pooler adds nothing but latency and prepared-statement limits.
// ts-node is invoked directly rather than through `npm run seed`, so no shell
// is involved on any platform.
const tsNode = path.join(backend, 'node_modules', 'ts-node', 'dist', 'bin.js');
runNode('تحميل البيانات التجريبية', [tsNode, '-P', 'tsconfig.seed.json', 'prisma/seed.ts'], {
  DATABASE_URL: migrationUrl,
});

console.log('\n=== قاعدة البيانات جاهزة ===');
