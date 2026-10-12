import { useEffect, useState } from 'react';
import { useAuthStore } from '@/store/auth';
import { syncOfflineOperations } from '@/lib/offline/sync';
import { replayOfflineOperation } from '@/lib/offline/replay';

/** Browser connectivity events are hints, not proof that the API is reachable. */
export default function OfflineStatus() {
  const [online, setOnline] = useState(() => typeof navigator === 'undefined' || navigator.onLine);
  const accountId = useAuthStore((state) => state.user?.id ?? '');

  useEffect(() => {
    const sync = () => {
      if (navigator.onLine && accountId) {
        void syncOfflineOperations(accountId, replayOfflineOperation).catch(() => {
          // Keep the durable outbox intact; the next online event retries it.
        });
      }
    };
    const onOnline = () => { setOnline(true); sync(); };
    const onOffline = () => setOnline(false);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    sync();
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, [accountId]);

  if (online) return null;
  return <div role="status" aria-live="polite" dir="rtl" className="fixed inset-x-0 top-0 z-[100] bg-amber-100 px-4 py-2 text-center text-sm font-medium text-amber-950 shadow-sm">أنت غير متصل بالإنترنت. يمكنك حفظ كشف الحضور محلياً؛ ستتم محاولة مزامنته عند عودة الاتصال.</div>;
}
