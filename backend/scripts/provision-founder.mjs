// Server-operator procedure only. No HTTP endpoint or automatic promotion.
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
const accountId = process.env.FOUNDER_ACCOUNT_ID;
const expectedUsername = process.env.FOUNDER_VERIFIED_USERNAME;
if (!accountId || !expectedUsername || process.env.FOUNDER_IDENTITY_VERIFIED !== 'yes') {
  throw new Error('Verify ownership out of band, then set FOUNDER_ACCOUNT_ID, FOUNDER_VERIFIED_USERNAME and FOUNDER_IDENTITY_VERIFIED=yes.');
}
const prisma = new PrismaClient();
try {
  await prisma.$transaction(async tx => {
    const user = await tx.user.findFirst({ where: { id: accountId, username: expectedUsername, deletedAt: null, isActive: true },
      include: { teacher: true, parent: true } });
    if (!user || user.role !== 'ADMIN' || user.teacher || user.parent) throw new Error('Expected a verified active administrator with no linked teaching/parent profile.');
    if (!await tx.user.count({ where: { role: 'ADMIN', isActive: true, deletedAt: null, id: { not: user.id } } })) throw new Error('Keep another active administrator before promoting this account.');
    if (await tx.student.count({ where: { userId: user.id } })) throw new Error('Student accounts cannot be promoted.');
    const claimed = await tx.user.updateMany({ where: { id: user.id, role: 'ADMIN', isActive: true, deletedAt: null }, data: { role: 'FOUNDER' } });
    if (claimed.count !== 1) throw new Error('Account changed; verify again.');
    await tx.refreshToken.updateMany({ where: { userId: user.id, revokedAt: null }, data: { revokedAt: new Date() } });
    await tx.activityLog.create({ data: { userId: user.id, action: 'FOUNDER_PROVISION', summary: 'تعيين المؤسس بإجراء خادمي بعد تحقق المشغّل', entityType: 'User', entityId: user.id } });
  });
  console.log('Founder provisioned; existing sessions revoked. Sign in again.');
} finally { await prisma.$disconnect(); }
