import { listOfflineOperations } from '@/lib/offline/outbox';
import { syncOfflineOperations } from '@/lib/offline/sync';
import { replayOfflineOperation } from '@/lib/offline/replay';
import { syncPendingSupport } from '@/lib/offline/pendingSupport';
import { useCallback, useEffect, useState } from 'react';
import { useAuthStore } from '@/store/auth';

const OUTBOX_CHANGED = 'quran-circles:outbox-changed';

/** Browser connectivity events are hints, not proof that the API is reachable. */
export default function OfflineStatus() {
  const [online, setOnline] = useState(() => typeof navigator === 'undefined' || navigator.onLine);
  const [operations, setOperations] = useState<any[]>([]);
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
            // invalidate queries are handled elsewhere; keep UI simple here
          }
          await refresh();
        }).catch(() => { void refresh(); });
        // also try to sync any pending support tickets saved from the login page
        void syncPendingSupport().catch(() => null).finally(() => void refresh());
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

  return (
    <>
      {!online && (
        <div role="status" aria-live="polite" dir="rtl" className="fixed inset-x-0 top-0 z-[100] bg-amber-100 px-4 py-2 text-center text-sm font-medium text-amber-950 shadow-sm">
          أنت غير متصل بالإنترنت. التعديلات المحفوظة محلياً ستظهر أدناه.
        </div>
      )}
      {operations.length > 0 && (
        <div className="fixed inset-x-0 top-[48px] z-[100] mx-4 rounded-md bg-white/90 p-3 shadow">
          <div className="flex items-center justify-between">
            <div className="text-sm font-medium">توجد تعديلات محفوظة محلياً</div>
            <div className="text-xs text-slate-500">ستحاول المزامنة تلقائياً عند العودة</div>
          </div>
        </div>
      )}
    </>
  );
}
