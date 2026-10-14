import { validateAttendancePayload } from './attendance-validation.js';

/** Transport is injected so commit acknowledgements and network failures are testable. */
export async function replayAttendanceOperation(operation, currentAccountId, post) {
  if (operation.resource !== 'attendance-sheet' || operation.method !== 'POST' || operation.path !== '/attendance') {
    return { kind: 'rejected', reason: 'نوع تعديل غير مدعوم للمزامنة التلقائية' };
  }
  if (currentAccountId !== operation.accountId) {
    return { kind: 'retry', reason: 'تغيّر الحساب أثناء المزامنة؛ العملية محفوظة لحسابها الأصلي' };
  }
  const validationError = validateAttendancePayload(operation.payload);
  if (validationError) return { kind: 'rejected', reason: validationError };
  try {
    const { data } = await post('/sync/push', { operations: [{
      opId: operation.id, entity: 'attendance', kind: 'record', data: operation.payload,
    }] });
    const result = data?.results?.[0];
    if (data?.accountId !== operation.accountId || data?.results?.length !== 1 || result?.opId !== operation.id) {
      return { kind: 'retry', reason: 'تعذر التحقق من إقرار الخادم للعملية' };
    }
    if (result.status === 'conflict') return { kind: 'conflict', reason: result.message || 'تغيّر سجل الحضور؛ راجعه قبل المتابعة' };
    if (result.status === 'rejected') return { kind: 'rejected', reason: result.message || 'رفض الخادم العملية' };
    if (result.status !== 'applied') return { kind: 'retry', reason: 'لم يؤكد الخادم حفظ العملية' };
    return { kind: 'applied' };
  } catch (error) {
    const status = error?.response?.status;
    if (!status || status >= 500 || status === 408 || status === 429) return { kind: 'retry', reason: 'تعذر الاتصال بالخادم؛ ستتم إعادة المحاولة تلقائياً' };
    if (status === 401 || status === 403) return { kind: 'rejected', reason: 'انتهت صلاحية الجلسة أو لا تملك صلاحية تسجيل الحضور' };
    if (status === 400 || status === 409) return { kind: 'conflict', reason: 'كشف الحضور تغيّر على الخادم؛ راجعه قبل إعادة المحاولة' };
    return { kind: 'rejected', reason: `رفض الخادم التعديل (HTTP ${status})` };
  }
}
