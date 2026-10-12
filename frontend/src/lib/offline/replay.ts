import axios from 'axios';
import { api } from '@/lib/api';
import type { OutboxOperation } from './outbox';
import type { ReplayResult } from './sync';

/** Domain-specific replay policy. Only the attendance sheet endpoint is enabled. */
export async function replayOfflineOperation(operation: OutboxOperation): Promise<ReplayResult> {
  if (operation.resource !== 'attendance-sheet' || operation.method !== 'POST' || operation.path !== '/attendance') {
    return { kind: 'rejected', reason: 'نوع تعديل غير مدعوم للمزامنة التلقائية' };
  }

  try {
    await api.post(operation.path, operation.payload);
    return { kind: 'applied' };
  } catch (error) {
    if (!axios.isAxiosError(error) || !error.response) {
      return { kind: 'retry', reason: 'تعذر الاتصال بالخادم' };
    }
    const status = error.response.status;
    if (status === 401 || status === 403) {
      return { kind: 'rejected', reason: 'انتهت صلاحية الجلسة أو لا تملك صلاحية تسجيل الحضور' };
    }
    if (status === 400 || status === 409) {
      return { kind: 'conflict', reason: 'كشف الحضور تغيّر على الخادم؛ راجعه قبل إعادة المحاولة' };
    }
    if (status >= 500 || status === 408 || status === 429) {
      return { kind: 'retry', reason: 'الخادم غير متاح مؤقتاً' };
    }
    return { kind: 'rejected', reason: `رفض الخادم التعديل (HTTP ${status})` };
  }
}
