import { useEffect, useState } from 'react';

/** Browser connectivity events are hints, not proof that the API is reachable. */
export default function OfflineStatus() {
  const [online, setOnline] = useState(() => typeof navigator === 'undefined' || navigator.onLine);
  useEffect(() => {
    const onOnline = () => setOnline(true);
    const onOffline = () => setOnline(false);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, []);
  if (online) return null;
  return <div role="status" aria-live="polite" dir="rtl" className="fixed inset-x-0 top-0 z-[100] bg-amber-100 px-4 py-2 text-center text-sm font-medium text-amber-950 shadow-sm">أنت غير متصل بالإنترنت. قد لا تتوفر البيانات الجديدة، وستحتاج التعديلات غير المتصلة إلى المزامنة عند عودة الاتصال.</div>;
}
