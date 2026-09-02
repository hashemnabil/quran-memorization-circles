import { PrismaClient } from '@prisma/client';
import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';

const prisma = new PrismaClient();

async function main() {
  const outDir = join(process.cwd(), 'prisma', 'archives');
  if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });

  const report: {
    movedParents: { parentProfileId: string; userId: string; studentsLinked: string[] }[];
    updatedUsers: { userId: string; fieldsCopied: string[] }[];
    warnings: string[];
  } = { movedParents: [], updatedUsers: [], warnings: [] };

  // Load all parent profiles with their user and students
  const parents = await prisma.parentProfile.findMany({
    where: {},
    include: { user: true, students: { where: { deletedAt: null }, select: { id: true } } },
  });

  for (const p of parents) {
    const userId = (p as any).userId ?? p.user?.id;
    if (!userId) {
      report.warnings.push(`ParentProfile ${p.id} has no linked user — skipping`);
      continue;
    }

    const studentIds = (p.students ?? []).map((s) => s.id);
    if (studentIds.length) {
      await prisma.student.updateMany({ where: { id: { in: studentIds } }, data: { parentUserId: userId } });
    }

    report.movedParents.push({ parentProfileId: p.id, userId, studentsLinked: studentIds });

    // copy contact fields to user if empty
    const fieldsCopied: string[] = [];
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      report.warnings.push(`User ${userId} not found for parentProfile ${p.id}`);
      continue;
    }

    const updateData: any = {};
    if (!user.phone && (p as any).phone) {
      updateData.phone = (p as any).phone;
      fieldsCopied.push('phone');
    }
    // occupation -> jobTitle if jobTitle empty (best-effort mapping)
    if (!user.jobTitle && (p as any).occupation) {
      updateData.jobTitle = (p as any).occupation;
      fieldsCopied.push('occupation->jobTitle');
    }
    if (Object.keys(updateData).length) {
      await prisma.user.update({ where: { id: userId }, data: updateData });
      report.updatedUsers.push({ userId, fieldsCopied });
    }
  }

  const outPath = join(outDir, `populate-parentUserId_report_${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
  writeFileSync(outPath, JSON.stringify(report, null, 2), { encoding: 'utf8' });
  console.log(`Report written to ${outPath}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
