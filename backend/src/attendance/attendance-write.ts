import { AttendanceStatus, Prisma } from '@prisma/client';
import { AuthUser } from '../common/decorators';
import { RecordAttendanceDto } from './dto/attendance.dto';

/** Caller owns the transaction and the circle/day advisory lock. */
export async function applyAttendanceEntries(tx: Prisma.TransactionClient, actor: AuthUser, dto: RecordAttendanceDto, date: Date) {
  const newlyAbsentIds: string[] = [];
  let changedCount = 0;
  const conflicts: Array<{ studentId: string; requested: AttendanceStatus; saved: AttendanceStatus }> = [];
  const saved = await tx.attendance.findMany({
    where: { circleId: dto.circleId, date },
    select: { studentId: true, status: true, note: true },
  });
  const byStudent = new Map(saved.map((row) => [row.studentId, row]));

  for (const entry of dto.entries) {
    const current = byStudent.get(entry.studentId);
    if (current && current.status !== entry.status) {
      conflicts.push({ studentId: entry.studentId, requested: entry.status, saved: current.status === AttendanceStatus.PRESENT || entry.status === AttendanceStatus.PRESENT ? AttendanceStatus.PRESENT : current.status });
    }
    if (current?.status === AttendanceStatus.PRESENT) {
      // A later offline ABSENT/EXCUSED replay must never downgrade PRESENT.
      continue;
    }
    if (current && entry.status !== AttendanceStatus.PRESENT) {
      // Keep the first non-present state unless a PRESENT report upgrades it.
      continue;
    }

    const note = entry.status === AttendanceStatus.EXCUSED ? entry.note ?? null : null;
    if (current) {
      await tx.attendance.update({
        where: { studentId_date: { studentId: entry.studentId, date } },
        data: { status: AttendanceStatus.PRESENT, note: null, recordedById: actor.id },
      });
    } else {
      await tx.attendance.create({
        data: {
          studentId: entry.studentId,
          circleId: dto.circleId,
          date,
          status: entry.status,
          note,
          recordedById: actor.id,
        },
      });
      if (entry.status === AttendanceStatus.ABSENT) newlyAbsentIds.push(entry.studentId);
    }
    byStudent.set(entry.studentId, {
      studentId: entry.studentId,
      status: entry.status,
      note,
    });
    changedCount += 1;
  }
  return { newlyAbsentIds, changedCount, conflicts };
}
