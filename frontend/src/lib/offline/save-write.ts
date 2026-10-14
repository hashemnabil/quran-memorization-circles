import { enqueueOfflineOperation, listOfflineOperations } from './outbox';
import { syncOfflineOperations } from './sync';
import { replayOfflineOperation } from './replay';
import { useAuthStore } from '@/store/auth';
import type { OutboxOperation } from './outbox';
/** Persist before the first attempt, including online attempts that may lose their acknowledgement. */
export async function saveOfflineWrite(write: Pick<OutboxOperation, 'resource' | 'method' | 'path' | 'payload' | 'baseUpdatedAt'>) {
  const accountId = useAuthStore.getState().user?.id;
  if (!accountId) throw new Error('يلزم تسجيل الدخول لحفظ التعديل');
  const operation = await enqueueOfflineOperation({ ...write, accountId });
  window.dispatchEvent(new Event('quran-circles:outbox-changed'));
  if (navigator.onLine) await syncOfflineOperations(accountId, replayOfflineOperation);
  if (useAuthStore.getState().user?.id !== accountId) throw new Error('تغيّر الحساب؛ التعديل محفوظ للحساب الأصلي');
  const pending = (await listOfflineOperations(accountId)).find(item => item.id === operation.id);
  window.dispatchEvent(new Event('quran-circles:outbox-changed'));
  if (pending?.state === 'blocked') throw new Error(pending.lastError || 'التعديل محفوظ محليًا لكنه يحتاج مراجعة قبل المزامنة');
  return { pending: !!pending, opId: operation.id };
}
