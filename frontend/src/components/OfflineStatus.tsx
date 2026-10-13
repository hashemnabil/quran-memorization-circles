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

  const refresh = refreshOutbox;
  const visible = !online || operations.length > 0;

  if (!visible) return null;

  const syncNow = () => {
    if (!navigator.onLine || !accountId) { void refresh(); return; }
    void syncOfflineOperations(accountId, replayOfflineOperation).then(async (report) => {
      if (report.applied > 0) {
        void queryClient.invalidateQueries({ queryKey: ['attendance'] });
        void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      }
      await refresh();
    }).catch(() => void refresh());
  };

  return (
    <aside
      dir="rtl"
      aria-label="حالة الاتصال والمزامنة"
      className="fixed bottom-20 left-3 z-[99] w-[min(21rem,calc(100vw-1.5rem))] sm:bottom-4 sm:left-4"
    >
      <details className="group overflow-hidden rounded-2xl border border-slate-200/90 bg-white/95 text-slate-800 shadow-lg shadow-slate-900/10 backdrop-blur">
        <summary className="flex cursor-pointer list-none items-center gap-3 px-3.5 py-3 [&::-webkit-details-marker]:hidden">
          <span className={online ? 'grid h-9 w-9 shrink-0 place-items-center rounded-full bg-amber-50 text-amber-700' : 'grid h-9 w-9 shrink-0 place-items-center rounded-full bg-rose-50 text-rose-700'} aria-hidden>
            {online ? '↻' : '⌁'}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-bold">
              {!online ? 'تعمل دون إنترنت' : 'تعديلات بانتظار المزامنة'}
            </span>
            <span className="mt-0.5 block truncate text-xs text-slate-500">
              {!online
                ? (operations.length ? `${operations.length} تعديل محفوظ محلياً` : 'سيتم تحديث البيانات عند عودة الاتصال')
                : `${operations.length} تعديل في قائمة الانتظار`}
            </span>
          </span>
          <span className="shrink-0 rounded-full bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-600 group-open:rotate-180" aria-hidden>⌄</span>
        </summary>

        <div className="border-t border-slate-100 px-3.5 pb-3.5 pt-3">
          <p className="mb-3 text-xs leading-5 text-slate-600">
            {!online
              ? 'تأكد من بقاء التطبيق على الجهاز. ستظهر التعديلات المحفوظة محلياً هنا حتى يتوفر الاتصال.'
              : 'يمكنك محاولة إرسال التعديلات المحفوظة إلى الخادم الآن.'}
          </p>
          {operations.length > 0 && (
            <ul className="mb-3 max-h-36 space-y-2 overflow-auto">
              {operations.map((operation) => (
                <li key={operation.id} className="rounded-xl bg-slate-50 px-3 py-2.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <strong className="text-xs">{operation.resource === 'attendance-sheet' ? 'كشف حضور' : operation.resource}</strong>
                    <span className={operation.state === 'blocked' ? 'rounded-full bg-rose-100 px-2 py-1 text-[11px] font-medium text-rose-700' : 'rounded-full bg-amber-100 px-2 py-1 text-[11px] font-medium text-amber-800'}>
                      {operation.state === 'blocked' ? 'يحتاج مراجعة' : online ? 'بانتظار الإرسال' : 'محفوظ محلياً'}
                    </span>
                  </div>
                  <p className="mt-1 text-[11px] text-slate-500">حُفظ: {new Date(operation.createdAt).toLocaleString()} · محاولات: {operation.attempts}</p>
                  {operation.lastError && <p className="mt-1 text-xs text-rose-700">{operation.lastError}</p>}
                </li>
              ))}
            </ul>
          )}
          <button
            type="button"
            disabled={!online || loading}
            onClick={syncNow}
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-primary-700 px-3 py-2.5 text-sm font-bold text-white transition hover:bg-primary-800 disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            {loading ? 'جارٍ تحديث الحالة…' : online ? 'مزامنة الآن' : 'بانتظار عودة الإنترنت'}
          </button>
        </div>
      </details>
    </aside>
  );
}
