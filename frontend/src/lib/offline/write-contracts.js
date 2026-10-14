import { validateAttendancePayload } from './attendance-validation.js';
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const fields = ['studentId', 'date', 'type', 'fromSurah', 'fromAyah', 'toSurah', 'toAyah', 'pagesCount', 'mistakes', 'warnings', 'versesCount', 'evaluation', 'notes'];
const object = value => value && typeof value === 'object' && !Array.isArray(value);
function recitation(payload, partial = false) {
  if (!object(payload) || Object.keys(payload).some(key => !fields.includes(key))) throw new Error('حقول تسميع غير مدعومة');
  if (!partial && (typeof payload.studentId !== 'string' || !uuid.test(payload.studentId))) throw new Error('معرّف الطالب غير صالح');
  if (partial && ('studentId' in payload || !Object.keys(payload).length)) throw new Error('لا يمكن تغيير الطالب في سجل محفوظ');
  if (!partial || payload.date !== undefined) {
    const date = new Date(`${payload.date}T00:00:00.000Z`);
    if (typeof payload.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(payload.date) || !Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== payload.date || payload.date > new Date().toISOString().slice(0, 10)) throw new Error('تاريخ التسميع غير صالح');
  }
  for (const key of ['fromSurah', 'toSurah']) if ((!partial || payload[key] !== undefined) && (typeof payload[key] !== 'string' || !payload[key].trim() || payload[key].length > 60)) throw new Error('سورة التسميع غير صالحة');
  for (const key of ['fromAyah', 'toAyah']) if ((!partial || payload[key] !== undefined) && (!Number.isInteger(payload[key]) || payload[key] < 1 || payload[key] > 286)) throw new Error('آية التسميع غير صالحة');
  for (const [key, max, integer] of [['pagesCount', 604, false], ['mistakes', 9999, true], ['warnings', 9999, true], ['versesCount', 6236, true]]) {
    const n = payload[key]; if (n != null && (typeof n !== 'number' || !Number.isFinite(n) || n < 0 || n > max || integer && !Number.isInteger(n))) throw new Error('عدد غير صالح في التسميع');
  }
  if (payload.type != null && !['MEMORIZATION', 'MINOR_REVIEW', 'MAJOR_REVIEW', 'TAJWEED'].includes(payload.type)) throw new Error('نوع تسميع غير صالح');
  if ((!partial || payload.evaluation != null) && !['EXCELLENT', 'VERY_GOOD', 'GOOD', 'ACCEPTABLE', 'UNSATISFACTORY'].includes(payload.evaluation)) throw new Error('تقييم غير صالح');
  if (payload.notes != null && (typeof payload.notes !== 'string' || payload.notes.length > 1000)) throw new Error('ملاحظة التسميع غير صالحة');
}
export function offlineOperationSpec(op) {
  if (op.resource === 'attendance-sheet' && op.method === 'POST' && op.path === '/attendance') {
    const error = validateAttendancePayload(op.payload); if (error) throw new Error(error);
    return { entity: 'attendance', kind: 'record', data: op.payload };
  }
  if (op.resource === 'recitation-create' && op.method === 'POST' && op.path === '/recitations') {
    recitation(op.payload); return { entity: 'recitation', kind: 'create', data: op.payload };
  }
  const match = /^\/recitations\/([0-9a-f-]+)$/i.exec(op.path);
  if (!match || !uuid.test(match[1]) || typeof op.baseUpdatedAt !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(op.baseUpdatedAt) || !Number.isFinite(Date.parse(op.baseUpdatedAt))) throw new Error('هذا التعديل غير مفعّل دون اتصال أو يفتقد إصدار السجل');
  if (op.resource === 'recitation-delete' && op.method === 'DELETE' && object(op.payload) && !Object.keys(op.payload).length) return { entity: 'recitation', kind: 'delete', baseUpdatedAt: op.baseUpdatedAt, data: { id: match[1] } };
  if (op.resource === 'recitation-correct' && op.method === 'PATCH') {
    recitation(op.payload, true); return { entity: 'recitation', kind: 'correct', baseUpdatedAt: op.baseUpdatedAt, data: { id: match[1], patch: op.payload } };
  }
  throw new Error('هذا النوع من التعديلات غير مفعّل للمزامنة دون اتصال');
}
