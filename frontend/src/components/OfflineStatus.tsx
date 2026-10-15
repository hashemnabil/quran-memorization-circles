import { listOfflineOperations } from '@/lib/offline/outbox';
import { syncOfflineOperations } from '@/lib/offline/sync';
import { replayOfflineOperation } from '@/lib/offline/replay';
import { syncPendingSupport } from '@/lib/offline/pendingSupport';
import { useCallback, useEffect, useState } from 'react';
import { useAuthStore } from '@/store/auth';
import { queryClient } from '@/lib/queryClient';

const OUTBOX_CHANGED = 'quran-circles:outbox-changed';

/** Browser connectivity events are hints, not proof that the API is reachable. */
export default function OfflineStatus() {
  const [operations, setOperations] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const accountId = useAuthStore((state) => state.user?.id ?? '');
  const blockedOperations = operations.filter((operation: any) => operation.state === 'blocked');
  const pendingOperations = operations.filter((operation: any) => operation.state !== 'blocked');

  const refreshOutbox = useCallback(async () => {
    if (!accountId) { setOperations([]); return; }
    setLoading(true);
    try { setOperations(await listOfflineOperations(accountId)); }
    catch { /* IndexedDB may be unavailable in some browser contexts. */ }
    finally { setLoading(false); }
  }, [accountId]);

  useEffect(() => {
    let mounted = true;
    const refresh = async () => {
      if (!accountId) { if (mounted) setOperations([]); return; }
      try {
        const items = await listOfflineOperations(accountId);
        if (mounted) setOperations(items);
      } catch { /* Keep the status UI usable if local storage is unavailable. */ }
    };
    const sync = () => {
      if (navigator.onLine && accountId) {
        void syncOfflineOperations(accountId, replayOfflineOperation).then(async (report) => {
          if (report.applied > 0) {
            // A successful replay changes server data; refresh affected reads.
            await Promise.all([
              queryClient.invalidateQueries({ queryKey: ['attendance'] }),
              queryClient.invalidateQueries({ queryKey: ['dashboard'] }),
            ]);
          }
          await refresh();
        }).catch(() => { void refresh(); });
        // also try to sync any pending support tickets saved from the login page
        void syncPendingSupport().catch(() => null).finally(() => void refresh());
      } else {
        void refresh();
      }
    };
    const onOnline = () => { sync(); };
    const onOffline = () => { void refresh(); };
    const onOutboxChanged = () => { sync(); };
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    window.addEventListener(OUTBOX_CHANGED, onOutboxChanged);
    void refresh();
    sync();
    return () => {
      mounted = false;
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
      window.removeEventListener(OUTBOX_CHANGED, onOutboxChanged);
    };
  }, [accountId, refreshOutbox]);

  return (
    <>
      {operations.length > 0 && (
        <div className="fixed inset-x-4 bottom-4 z-40 mx-auto max-w-xl rounded-2xl border border-slate-200 bg-white p-4 shadow-lg">
          <div className="flex items-center justify-between">
            <div className="text-sm font-medium">تعديلات محفوظة محلياً: {pendingOperations.length}</div>
            <div className="text-xs text-slate-500">ستحاول المزامنة تلقائياً عند عودة الاتصال</div>
          </div>
          {blockedOperations.length > 0 && (
            <div role="alert" className="mt-2 rounded border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700" dir="rtl">
              <div className="font-semibold">تحتاج بعض التعديلات إلى مراجعة ({blockedOperations.length})</div>
              <ul className="mt-1 list-disc pr-5">
                {blockedOperations.slice(0, 3).map((operation: any) => (
                  <li key={operation.id}>{operation.lastError || 'تعذر تطبيق التعديل؛ راجع البيانات قبل المحاولة مجدداً'}</li>
                ))}
              </ul>
              {blockedOperations.length > 3 && <div className="mt-1 text-xs">وتوجد تعديلات أخرى تحتاج إلى مراجعة.</div>}
            </div>
          )}
        </div>
      )}
    </>
  );
}
