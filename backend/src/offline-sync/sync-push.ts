import { BadRequestException, HttpException } from '@nestjs/common';
import { AttendanceStatus, NotificationType, Prisma, Role } from '@prisma/client';
import { createHash } from 'node:crypto';
import { AuthUser } from '../common/decorators';
import { AccessControlService } from '../common/services/access-control.service';
import { PrismaService } from '../prisma/prisma.service';
import { applyAttendanceEntries } from '../attendance/attendance-write';
import { RecordAttendanceDto } from '../attendance/dto/attendance.dto';

type Operation = { opId: string; entity: string; kind?: unknown; data?: unknown; baseUpdatedAt?: unknown };
type Outcome = { opId: string; status: 'applied' | 'conflict' | 'rejected'; code?: string; message?: string; data?: Prisma.JsonObject; replayed?: boolean };
const staff = new Set<Role>([Role.ADMIN, Role.SUPERVISOR, Role.TEACHER]);
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function object(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}
function keys(value: Record<string, unknown>, allowed: string[]) {
  if (Object.keys(value).some((key) => !allowed.includes(key))) throw new BadRequestException('حقول غير مدعومة في العملية');
}
function validId(value: unknown): value is string { return typeof value === 'string' && uuid.test(value); }
function entry(value: unknown, withStudent: boolean) {
  if (!object(value)) throw new BadRequestException('صيغة سجل الحضور غير صالحة');
  keys(value, withStudent ? ['studentId', 'status', 'note'] : ['id', 'status', 'note']);
  if (!validId(withStudent ? value.studentId : value.id) || !Object.values(AttendanceStatus).includes(value.status as AttendanceStatus) ||
      (value.note !== undefined && value.note !== null && (typeof value.note !== 'string' || value.note.length > 300))) {
    throw new BadRequestException('بيانات سجل الحضور غير صالحة');
  }
}
function dateOnly(value: unknown): Date {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new BadRequestException('التاريخ غير صالح');
  const date = new Date(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value || value > new Date().toISOString().slice(0, 10)) {
    throw new BadRequestException('التاريخ غير صالح أو مستقبلي');
  }
  return date;
}
function validate(op: Operation): Record<string, unknown> {
  keys(op, ['opId', 'entity', 'kind', 'data', 'baseUpdatedAt']);
  if (!object(op.data)) throw new BadRequestException('بيانات العملية غير صالحة');
  if (op.kind === 'record') {
    keys(op.data, ['circleId', 'date', 'entries']);
    if (op.baseUpdatedAt !== undefined || !validId(op.data.circleId) || !Array.isArray(op.data.entries) || op.data.entries.length < 1 || op.data.entries.length > 500) {
      throw new BadRequestException('بيانات كشف الحضور غير صالحة (1–500 طالب)');
    }
    dateOnly(op.data.date);
    op.data.entries.forEach((item) => entry(item, true));
    const ids = op.data.entries.map((item) => (item as Record<string, unknown>).studentId);
    if (new Set(ids).size !== ids.length) throw new BadRequestException('يوجد طالب مكرر في كشف الحضور');
  } else {
    entry(op.data, false);
    if (typeof op.baseUpdatedAt !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(op.baseUpdatedAt) ||
        !Number.isFinite(Date.parse(op.baseUpdatedAt))) throw new BadRequestException('يلزم إصدار السجل الأصلي لإجراء التصحيح');
  }
  return op.data;
}
// Canonical JSON prevents key ordering from changing the idempotency fingerprint.
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (object(value)) return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
}

async function apply(tx: Prisma.TransactionClient, user: AuthUser, op: Operation, payload: Record<string, unknown>): Promise<Outcome> {
  const acl = new AccessControlService(tx as PrismaService);
  let circleId: string;
  let studentId: string | undefined;
  if (op.kind === 'record') circleId = payload.circleId as string;
  else {
    const row = await tx.attendance.findUnique({ where: { id: payload.id as string } });
    if (!row) return { opId: op.opId, status: 'rejected', code: 'NOT_FOUND', message: 'سجل الحضور غير موجود' };
    circleId = row.circleId;
    studentId = row.studentId;
  }
  await acl.assertCircleAccess(user, circleId);
  await acl.assertCircleWriteAccess(user, circleId);
  if (op.kind === 'record') {
    const dto = payload as unknown as RecordAttendanceDto;
    const date = dateOnly(dto.date);
    await tx.$queryRaw`SELECT 1 FROM (SELECT pg_advisory_xact_lock(hashtext(${circleId}), hashtext(${date.toISOString()}))) AS locked`;
    const ids = dto.entries.map((item) => item.studentId);
    const students = await tx.student.findMany({
      where: { id: { in: ids }, circleId, deletedAt: null },
      select: { id: true, fullName: true, parentProfile: { select: { userId: true } } },
    });
    if (students.length !== ids.length) throw new BadRequestException('بعض الطلاب لا ينتمون إلى هذه الحلقة');
    const result = await applyAttendanceEntries(tx, user, dto, date);
    for (const student of students) {
      if (result.newlyAbsentIds.includes(student.id) && student.parentProfile?.userId) {
        await tx.notification.create({ data: {
          userId: student.parentProfile.userId, type: NotificationType.ATTENDANCE,
          title: 'تسجيل غياب', body: `تم تسجيل غياب الطالب ${student.fullName} بتاريخ ${dto.date}`, link: `/parent/children/${student.id}`,
        } });
      }
    }
    if (result.changedCount) await tx.activityLog.create({ data: {
      userId: user.id, action: 'ATTENDANCE_RECORD', summary: `تسجيل حضور ${dto.entries.length} طالب بتاريخ ${dto.date}`,
      entityType: 'Circle', entityId: circleId,
    } });
    return { opId: op.opId, status: 'applied', data: {
      circleId, date: dto.date, changedCount: result.changedCount,
      conflicts: result.conflicts, conflictPolicy: 'present-wins-otherwise-first-saved',
    } };
  }
  // Recheck the student's live scope too; a transferred student must not be corrected by old staff.
  await acl.assertStudentWriteAccess(user, studentId!);
  const current = await tx.attendance.findUnique({ where: { id: payload.id as string } });
  if (!current || current.updatedAt.toISOString() !== op.baseUpdatedAt) {
    return { opId: op.opId, status: 'conflict', code: 'STALE_VERSION', message: 'تغيّر السجل؛ راجع النسخة الحالية قبل حفظ التصحيح' };
  }
  const updated = await tx.attendance.updateMany({
    where: { id: current.id, updatedAt: new Date(op.baseUpdatedAt as string) },
    data: { status: payload.status as AttendanceStatus, note: payload.status === AttendanceStatus.EXCUSED ? (payload.note as string | undefined) ?? null : null, recordedById: user.id },
  });
  if (updated.count !== 1) return { opId: op.opId, status: 'conflict', code: 'STALE_VERSION' };
  if (payload.status === AttendanceStatus.ABSENT && current.status !== AttendanceStatus.ABSENT) {
    const student = await tx.student.findUnique({ where: { id: studentId }, select: { fullName: true, parentProfile: { select: { userId: true } } } });
    if (student?.parentProfile?.userId) await tx.notification.create({ data: {
      userId: student.parentProfile.userId, type: NotificationType.ATTENDANCE, title: 'تعديل سجل الحضور',
      body: `تم تسجيل غياب الطالب ${student.fullName} بتاريخ ${current.date.toISOString().slice(0, 10)}`, link: `/parent/children/${studentId}`,
    } });
  }
  await tx.activityLog.create({ data: { userId: user.id, action: 'ATTENDANCE_UPDATE', summary: 'تصحيح سجل حضور عبر المزامنة', entityType: 'Attendance', entityId: current.id } });
  return { opId: op.opId, status: 'applied', data: { id: current.id } };
}

export async function pushValidatedOperations(prisma: PrismaService, user: AuthUser, operations: Operation[]) {
  const results: Outcome[] = [];
  for (const op of operations) {
    if (op.entity !== 'attendance' || (op.kind !== 'record' && op.kind !== 'correct')) {
      results.push({ opId: op.opId, status: 'rejected', code: 'UNSUPPORTED_OPERATION', message: 'نوع العملية غير مدعوم' });
      continue;
    }
    if (!staff.has(user.role)) {
      results.push({ opId: op.opId, status: 'rejected', code: 'FORBIDDEN', message: 'لا تملك صلاحية تعديل الحضور' });
      continue;
    }
    try {
      const payload = validate(op);
      const fingerprint = createHash('sha256').update(canonical(op)).digest('hex');
      let outcome: Outcome | undefined;
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          outcome = await prisma.$transaction(async (tx) => {
            await tx.$queryRaw`SELECT 1 FROM (SELECT pg_advisory_xact_lock(hashtext(${user.id}), hashtext(${op.opId}))) AS locked`;
            const existing = await tx.processedOperation.findUnique({ where: { opId_accountId: { opId: op.opId, accountId: user.id } } });
            if (existing) {
              const stored = existing.result as { fingerprint?: string; outcome?: Outcome } | null;
              if (stored?.fingerprint !== fingerprint || !stored.outcome) return { opId: op.opId, status: 'rejected' as const, code: 'OP_ID_REUSED', message: 'معرّف العملية مستخدم لبيانات مختلفة' };
              return { ...stored.outcome, replayed: true };
            }
            const result = await apply(tx, user, op, payload);
            await tx.processedOperation.create({ data: { opId: op.opId, accountId: user.id, result: { fingerprint, outcome: result } as unknown as Prisma.InputJsonValue } });
            return result;
          }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 15000 });
          break;
        } catch (error) {
          // Concurrent same-op or same-sheet writers may lose a serialization race.
          if (error instanceof Prisma.PrismaClientKnownRequestError && ['P2034', 'P2002'].includes(error.code) && attempt < 2) continue;
          throw error;
        }
      }
      results.push(outcome!);
    } catch (error) {
      // Failed transactions are rolled back; never acknowledge an unknown DB failure.
      if (!(error instanceof HttpException) || error.getStatus() >= 500) throw error;
      results.push({ opId: op.opId, status: 'rejected', code: error.getStatus() === 403 ? 'FORBIDDEN' : 'INVALID_DATA', message: error.message });
    }
  }
  return { version: 1, accountId: user.id, results };
}
