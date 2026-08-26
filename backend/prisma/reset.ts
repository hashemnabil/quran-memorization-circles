/**
 * Empties the database completely, then puts back only what the app needs to
 * run: the 60 ahzab, the school-settings row, and one administrator.
 *
 *   npm run db:wipe                  # wipe, then create the baseline
 *   npm run db:wipe -- --keep-uploads  # ... but leave uploaded files on disk
 *
 * Every table is truncated rather than dropped, so the schema and the migration
 * history stay exactly as they are — this is a data reset, not a re-install, and
 * it does not need a shadow database or a re-run of every migration.
 *
 * `_prisma_migrations` is the one table left alone. Clearing it would make
 * Prisma believe the database had never been migrated and try to apply
 * everything again on top of tables that already exist.
 *
 * THIS DELETES EVERYTHING. It refuses to run without `--force`, which the npm
 * script passes, so it cannot be triggered by a stray `ts-node prisma/reset.ts`.
 */
import { PrismaClient } from '@prisma/client';
import { existsSync, readdirSync, rmSync } from 'fs';
import { join } from 'path';
import { createBaseline, printBaseline } from './baseline';

const prisma = new PrismaClient();

const args = process.argv.slice(2);
const forced = args.includes('--force') || args.includes('-f');
const keepUploads = args.includes('--keep-uploads');

/** Every table Prisma manages, straight from the database. */
async function tableNames(): Promise<string[]> {
  const rows = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'
    ORDER BY tablename
  `;
  return rows.map((r) => r.tablename);
}

/** What is about to be lost, so the operator sees it before it happens. */
async function summarise() {
  const [users, students, circles, teachers, parents, courses, recitations, attendance, exams] =
    await Promise.all([
      prisma.user.count(),
      prisma.student.count(),
      prisma.circle.count(),
      prisma.teacherProfile.count(),
      prisma.parentProfile.count(),
      prisma.course.count(),
      prisma.recitation.count(),
      prisma.attendance.count(),
      prisma.exam.count(),
    ]);
  return { users, students, circles, teachers, parents, courses, recitations, attendance, exams };
}

/** Uploaded avatars, logos and course images, whose rows are about to vanish. */
function clearUploads(): number {
  const root = join(process.cwd(), process.env.UPLOAD_DIR || 'uploads');
  if (!existsSync(root)) return 0;

  let removed = 0;
  for (const folder of readdirSync(root, { withFileTypes: true })) {
    if (!folder.isDirectory()) continue;
    const dir = join(root, folder.name);
    for (const file of readdirSync(dir)) {
      rmSync(join(dir, file), { force: true });
      removed += 1;
    }
  }
  return removed;
}

async function main() {
  const before = await summarise();

  console.log('');
  console.log('  سيُحذف كل ما في قاعدة البيانات:');
  console.log(`     ${before.users} مستخدماً · ${before.students} طالباً · ${before.circles} حلقة`);
  console.log(`     ${before.teachers} معلماً · ${before.parents} ولي أمر · ${before.courses} دورة`);
  console.log(
    `     ${before.recitations} تسميعاً · ${before.attendance} سجل حضور · ${before.exams} اختباراً`,
  );
  console.log('');

  if (!forced) {
    console.log('  ✗ لم يُحذف شيء. هذا إجراء لا رجعة فيه، ويحتاج تأكيداً صريحاً:');
    console.log('       npm run db:wipe');
    console.log('');
    process.exit(1);
  }

  const tables = await tableNames();
  // One statement: TRUNCATE takes them together, so no foreign key can complain
  // about the order, and RESTART IDENTITY resets the sequences behind them.
  const list = tables.map((t) => `"public"."${t}"`).join(', ');
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE`);
  console.log(`  · أُفرغ ${tables.length} جدولاً`);

  if (keepUploads) {
    console.log('  · تُركت الملفات المرفوعة كما هي (--keep-uploads)');
  } else {
    const removed = clearUploads();
    console.log(`  · حُذف ${removed} ملفاً مرفوعاً (صور شخصية وشعارات)`);
  }

  const result = await createBaseline(prisma);
  printBaseline(result);
}

main()
  .catch((error) => {
    console.error('تعذر تفريغ قاعدة البيانات:', error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
