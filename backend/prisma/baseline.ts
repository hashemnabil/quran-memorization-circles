/**
 * The minimum a working install needs, and nothing more.
 *
 * Shared by `bootstrap.ts` (fill an empty database) and `reset.ts` (wipe, then
 * fill). Everything here is either reference data the app cannot function
 * without, or the one account somebody has to sign in with — no circles, no
 * students, no sample accounts.
 */
import { ExamSectionKind, PrismaClient, Role } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

export const ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'admin1';
export const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin@2026';
export const ADMIN_NAME = process.env.ADMIN_NAME || 'مدير النظام';

/**
 * The examination programme: 60 ahzab, in no binding order.
 *
 * Reference data, not demo data — every school examines by the hizb, so an
 * install without these cannot accept a single exam request. Defined here
 * rather than imported from `src/common/quran.ts` because `tsconfig.seed.json`
 * only compiles `prisma/`.
 */
export const HIZB_SECTIONS = Array.from({ length: 60 }, (_, i) => {
  const hizb = i + 1;
  return {
    code: `HIZB-${String(hizb).padStart(2, '0')}`,
    name: `الحزب ${hizb}`,
    order: hizb,
    kind: ExamSectionKind.HIZB,
    pagesCount: 10,
    minScore: 60,
    isRequired: true,
    description: `اختبار حفظ وإتقان الحزب ${hizb} (من الجزء ${Math.ceil(hizb / 2)})`,
  };
});

export interface BaselineResult {
  username: string;
  sections: number;
}

/** Creates the baseline. Safe to call twice: every write is conditional. */
export async function createBaseline(prisma: PrismaClient): Promise<BaselineResult> {
  const rounds = parseInt(process.env.BCRYPT_ROUNDS || '10', 10);

  const admin = await prisma.user.upsert({
    where: { username: ADMIN_USERNAME },
    update: {},
    create: {
      username: ADMIN_USERNAME,
      fullName: ADMIN_NAME,
      role: Role.ADMIN,
      passwordHash: await bcrypt.hash(ADMIN_PASSWORD, rounds),
      isActive: true,
    },
    select: { username: true },
  });

  // The settings row is a singleton the whole app reads; create it now so the
  // login screen has a name to show before anyone opens the settings page.
  await prisma.schoolSettings.upsert({
    where: { id: 'default' },
    create: { id: 'default' },
    update: {},
  });

  const existingSections = await prisma.examSection.count();
  if (existingSections === 0) {
    await prisma.examSection.createMany({ data: HIZB_SECTIONS });
  }

  return { username: admin.username, sections: await prisma.examSection.count() };
}

/** The block every entry point prints when it is done. */
export function printBaseline(result: BaselineResult) {
  console.log('');
  console.log('  ✓ النظام جاهز للاستخدام');
  console.log(`     اسم المستخدم      : ${result.username}`);
  console.log(`     كلمة المرور       : ${ADMIN_PASSWORD}`);
  console.log(`     مقررات الاختبارات : ${result.sections} حزباً`);
  console.log('');
  console.log('  ⚠  غيّر كلمة المرور من «الملف الشخصي» بعد أول دخول.');
  console.log('     ثم أضف المشرفين والمعلمين والحلقات والطلاب من داخل النظام.');
  console.log('');
}
