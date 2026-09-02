import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Simple archiver: exports parent_profiles with related user and students to a
 * JSON file under prisma/archives so we have a safe backup before any schema
 * changes that remove parent_profiles.
 *
 * Run with: node ./dist/scripts/archive-parent-profiles.js (build first)
 */

async function main() {
  const prisma = new PrismaClient();
  try {
    const parents = await prisma.parentProfile.findMany({
      where: { deletedAt: null },
      include: {
        user: true,
        students: { where: { deletedAt: null } },
      },
    });

    const dir = path.join(process.cwd(), 'prisma', 'archives');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    const file = path.join(dir, `parent_profiles_backup_${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
    fs.writeFileSync(file, JSON.stringify(parents, null, 2), 'utf-8');
    console.log(`Exported ${parents.length} parent_profiles to ${file}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
