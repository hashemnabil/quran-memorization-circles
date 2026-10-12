export const ATTENDANCE_STATUSES = new Set(['PRESENT', 'ABSENT', 'EXCUSED']);

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function validateAttendancePayload(payload, now = new Date()) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return 'بيانات كشف الحضور غير مكتملة ولا يمكن حفظها للمزامنة';
  }
  if (typeof payload.circleId !== 'string' || !UUID_V4.test(payload.circleId)) {
    return 'معرّف الحلقة غير صالح';
  }
  if (typeof payload.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(payload.date)) {
    return 'التاريخ غير صالح';
  }
  const [year, month, day] = payload.date.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return 'التاريخ غير صالح';
  }
  if (date.getTime() > Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())) {
    return 'لا يمكن مزامنة كشف حضور بتاريخ مستقبلي';
  }
  if (!Array.isArray(payload.entries) || payload.entries.length === 0) {
    return 'يجب إدخال حضور طالب واحد على الأقل';
  }
  const seen = new Set();
  for (const entry of payload.entries) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      return 'بيانات أحد الطلاب في كشف الحضور غير صالحة';
    }
    if (typeof entry.studentId !== 'string' || !UUID_V4.test(entry.studentId)) {
      return 'معرّف أحد الطلاب غير صالح';
    }
    // UUIDs are case-insensitive; normalize before duplicate detection so
    // differently-cased copies of the same database ID cannot slip through.
    const normalizedStudentId = entry.studentId.toLowerCase();
    if (seen.has(normalizedStudentId)) {
      return 'يوجد طالب مكرر في كشف الحضور';
    }
    seen.add(normalizedStudentId);
    if (!ATTENDANCE_STATUSES.has(entry.status)) {
      return 'حالة الحضور غير صالحة';
    }
    if (entry.note !== undefined && entry.note !== null &&
      (typeof entry.note !== 'string' || entry.note.length > 300)) {
      return 'ملاحظة الحضور غير صالحة';
    }
  }
  return null;
}
