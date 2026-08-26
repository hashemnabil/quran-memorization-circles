/**
 * First-run setup for an empty database: one administrator, the school-settings
 * row, and the 60 ahzab. Nothing else.
 *
 * `seed.ts` is the opposite — it fills the database with demo circles, teachers,
 * students and sample accounts so the system can be explored; none of that
 * belongs in a live install.
 *
 * Idempotent by design: if any account already exists the script stops without
 * touching a thing, so running it twice — or against a database already in use —
 * cannot overwrite anyone. To start over deliberately, use `npm run db:wipe`.
 *
 *   npm run bootstrap     # fill an empty database
 *   npm run db:wipe       # erase everything, then fill it
 */
import { PrismaClient } from '@prisma/client';
import { createBaseline, printBaseline } from './baseline';

const prisma = new PrismaClient();

async function main() {
  const existing = await prisma.user.count();
  if (existing > 0) {
    const admins = await prisma.user.count({ where: { role: 'ADMIN', deletedAt: null } });
    console.log(`› قاعدة البيانات تحتوي ${existing} حساباً بالفعل (${admins} مدير عام).`);
    console.log('› لم يُنشأ شيء. لتفريغها والبدء من جديد: npm run db:wipe');
    return;
  }

  printBaseline(await createBaseline(prisma));
}

main()
  .catch((error) => {
    console.error('تعذر إنشاء الحساب الأول:', error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
