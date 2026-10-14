import { Prisma } from '@prisma/client';
/** Same authoritative balance calculation for online and offline transactional writes. */
export async function recalculateStudentPoints(db: Pick<Prisma.TransactionClient, 'recitation' | 'surahCompletion' | 'student'>, studentId: string) {
  const [recitations, surahs] = await Promise.all([
    db.recitation.aggregate({ where: { studentId, deletedAt: null }, _sum: { points: true } }),
    db.surahCompletion.aggregate({ where: { studentId }, _sum: { points: true } }),
  ]);
  const total = Math.round(((recitations._sum.points ?? 0) + (surahs._sum.points ?? 0)) * 100) / 100;
  await db.student.update({ where: { id: studentId }, data: { totalPoints: total } });
  return total;
}
