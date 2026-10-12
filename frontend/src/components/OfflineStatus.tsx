import { useCallback, useEffect, useState } from 'react';
import { useAuthStore } from '@/store/auth';
import { syncOfflineOperations } from '@/lib/offline/sync';
import { replayOfflineOperation } from '@/lib/offline/replay';
import { listOfflineOperations, type OutboxOperation } from '@/lib/offline/outbox';
import { queryClient } from '@/lib/queryClient';

const OUTBOX_CHANGED = 'quran-circles:outbox-changed';

/** Browser connectivity events are hints, not proof that the API is reachable. */
export default function OfflineStatus() {
  const [online, setOnline] = useState(() => typeof navigator === 'undefined' || navigator.onLine);
  const [operations, setOperations] = useState<OutboxOperation[]>([]);
  const [loading, setLoading] = useState(false);
  const accountId = useAuthStore((state) => state.user?.id ?? '');

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
            void queryClient.invalidateQueries({ queryKey: ['attendance'] });
            void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
          }
          await refresh();
        }).catch(() => { void refresh(); });
      } else {
        void refresh();
      }
    };
    const onOnline = () => { setOnline(true); sync(); };
    const onOffline = () => { setOnline(false); void refresh(); };
    const onOutboxChanged = () => { void refresh(); };
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

  // Keep a current snapshot available to the sync callback without making the
  // effect depend on the list itself.
  const refresh = refreshOutbox;

  return (
    <>
      {!online && (
        <div role="status" aria-live="polite" dir="rtl" className="fixed inset-x-0 top-0 z-[100] bg-amber-100 px-4 py-2 text-center text-sm font-medium text-amber-950 shadow-sm">
          أنت غير متصل بالإنترنت. التعديلات المحفوظة محلياً ستظهر أدناه.
        </div>
      )}
      {operations.length > 0 && (
        <section dir="rtl" aria-label="التعديلات المحفوظة محلياً" className={`fixed inset-x-3 z-[99] mx-auto max-w-2xl rounded-xl border border-amber-200 bg-white p-4 shadow-lg ${online ? 'top-3' : 'top-12'}`}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-bold text-slate-800">تعديلات تنتظر المزامنة ({operations.length})</h2>
            <button type="button" onClick={() => void refresh()} className="rounded-lg border px-3 py-1 text-sm hover:bg-slate-50">تحديث الحالة</button>
          </div>
          <p className="mt-1 text-sm text-slate-600">تبقى البيانات على هذا الجهاز حتى تنجح المزامنة. لا تحذف بيانات التطبيق قبل مراجعة هذه العناصر.</p>
          <ul className="mt-3 max-h-64 space-y-2 overflow-auto">
            {operations.map((operation) => (
              <li key={operation.id} className="rounded-lg border border-slate-200 p-3 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <strong>{operation.resource === 'attendance-sheet' ? 'كشف حضور' : operation.resource}</strong>
                  <span className={operation.state === 'blocked' ? 'rounded bg-red-100 px-2 py-1 text-red-800' : 'rounded bg-amber-100 px-2 py-1 text-amber-900'}>
                    {operation.state === 'blocked' ? 'يحتاج مراجعة' : online ? 'بانتظار المزامنة' : 'محفوظ دون اتصال'}
                  </span>
                </div>
                <p className="mt-1 text-xs text-slate-500">حُفظ: {new Date(operation.createdAt).toLocaleString()} · محاولات المزامنة: {operation.attempts}</p>
                {operation.lastError && <p className="mt-1 text-sm text-red-700">{operation.lastError}</p>}
                <details className="mt-2">
                  <summary className="cursor-pointer text-primary-700">عرض تفاصيل البيانات المحفوظة</summary>
                  <pre className="mt-2 max-h-40 overflow-auto rounded bg-slate-50 p-2 text-xs">{JSON.stringify(operation.payload, null, 2)}</pre>
                </details>
              </li>
            ))}
          </ul>
          {loading && <p className="mt-2 text-xs text-slate-500">جارٍ تحديث القائمة…</p>}
        </section>
      )}
    </>
  );
}
