import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Create User accounts for students that currently lack one and link them via
 * students.userId. Produces a JSON report under prisma/archives with the
 * generated credentials so the operator can communicate them to guardians.
 *
 * Usage (after building):
 *   node ./dist/scripts/create-student-accounts.js
 */

async function main() {
  const prisma = new PrismaClient();
  try {
    const rounds = parseInt(process.env.BCRYPT_ROUNDS || '10', 10);

    const students = await prisma.student.findMany({
      where: { userId: null, deletedAt: null },
      select: { id: true, code: true, fullName: true },
    });

    if (!students.length) {
      console.log('No students without user accounts found. Nothing to do.');
      return;
    }

    const outDir = path.join(process.cwd(), 'prisma', 'archives');
    if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

    const report: Array<{ studentId: string; username: string; password: string; userId: string }> = [];

    for (const s of students) {
      // Generate a sensible username from the student code.
      let base = (s.code || `student-${s.id.slice(0, 8)}`).toLowerCase();
      base = base.replace(/[^a-z0-9-_]/g, '-');
      let username = base;
      // Ensure uniqueness
      let attempt = 0;
      while (await prisma.user.findUnique({ where: { username } })) {
        attempt += 1;
        username = `${base}-${Math.floor(Math.random() * 900) + 100}`;
        if (attempt > 10) username = `${base}-${Date.now().toString().slice(-6)}`;
      }

      // Random password (hex, human-safe). Operator must distribute it and force reset.
      const password = crypto.randomBytes(6).toString('hex');
      const passwordHash = await bcrypt.hash(password, rounds);

      const user = await prisma.user.create({
        data: {
          username,
          email: null,
          passwordHash,
          fullName: s.fullName,
          role: 'STUDENT',
          phone: null,
        },
      });

      await prisma.student.update({ where: { id: s.id }, data: { userId: user.id } });

      report.push({ studentId: s.id, username, password, userId: user.id });
      console.log(`Created account for ${s.fullName} — ${username}`);
    }

    const outFile = path.join(outDir, `student_accounts_created_${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
    fs.writeFileSync(outFile, JSON.stringify(report, null, 2), 'utf-8');
    console.log(`Wrote ${report.length} entries to ${outFile}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
