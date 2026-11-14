import { PrismaClient, Role } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { randomUUID } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
const url = new URL(process.env.DATABASE_URL || 'postgresql://localhost/missing');
if (!['localhost', '127.0.0.1'].includes(url.hostname) || url.pathname !== '/quran_test') throw new Error('Browser fixtures require disposable local quran_test');
const db = new PrismaClient();
try {
  const suffix = randomUUID().replace(/-/g, '').slice(0, 8);
  const password = 'BrowserTest!783'; const passwordHash = await bcrypt.hash(password, 4);
  const accounts = {};
  for (const role of Object.values(Role)) {
    const user = await db.user.create({ data: { username: `browser${role.toLowerCase().replace(/_/g, '')}${suffix}`, fullName: `Browser ${role}`, role, passwordHash } });
    accounts[role] = { id: user.id, username: user.username, password };
  }
  const teacher = await db.teacherProfile.create({ data: { userId: accounts.TEACHER.id } });
  const circle = await db.circle.create({ data: { name: `Browser circle ${suffix}`, code: `BC${suffix}`, supervisorId: accounts.SUPERVISOR.id } });
  await db.circleTeacher.create({ data: { circleId: circle.id, teacherId: teacher.id, role: 'PRIMARY' } });
  const student = await db.student.create({ data: { fullName: `Browser student ${suffix}`, code: `B${suffix}`, circleId: circle.id, userId: accounts.STUDENT.id } });
  const fixtures = { accounts, circle, student };
  await writeFile(new URL('../../frontend/e2e/.accounts.json', import.meta.url), JSON.stringify(fixtures), { mode: 0o600 });
  console.log('Synthetic browser fixtures ready; no production data was used.');
} finally { await db.$disconnect(); }
