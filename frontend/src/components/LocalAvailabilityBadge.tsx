import React, { useEffect, useState } from 'react';

/**
 * Best-effort indicator that at least one query-cache snapshot exists locally.
 * This does not guarantee offline sign-in or that every page's data is available.
 */
export default function LocalAvailabilityBadge() {
  const [hasSnapshot, setHasSnapshot] = useState<boolean | null>(null);

  useEffect(() => {
    let mounted = true;

    async function check() {
      try {
        if (typeof indexedDB === 'undefined') {
          if (mounted) setHasSnapshot(false);
          return;
        }
        const request = indexedDB.open('quran-circles-query-cache', 1);
        request.onupgradeneeded = () => {
          // No snapshot yet.
          // Close immediately to avoid creating stores.
          request.transaction?.abort();
        };
        request.onsuccess = () => {
          try {
            const db = request.result;
            const tx = db.transaction('snapshots', 'readonly');
            const store = tx.objectStore('snapshots');
            const countReq = store.count();
            countReq.onsuccess = () => {
              if (!mounted) return;
              const count = countReq.result ?? 0;
              setHasSnapshot(count > 0);
              db.close();
            };
            countReq.onerror = () => { if (mounted) setHasSnapshot(false); db.close(); };
          } catch (e) {
            if (mounted) setHasSnapshot(false);
          }
        };
        request.onerror = () => { if (mounted) setHasSnapshot(false); };
      } catch {
        if (mounted) setHasSnapshot(false);
      }
    }

    void check();
    return () => { mounted = false; };
  }, []);

  if (hasSnapshot === null) return null;
  if (!hasSnapshot) {
    return (
      <div className="mt-3 rounded-md bg-slate-50 px-3 py-2 text-sm text-slate-700 ring-1 ring-slate-100">
        لا توجد نسخة بيانات محفوظة محلياً. يلزم الاتصال لتنزيل البيانات.
      </div>
    );
  }

  return (
    <div className="mt-3 flex items-center gap-2 rounded-md bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-800 ring-1 ring-emerald-100">
      <span className="inline-flex h-2.5 w-2.5 rounded-full bg-emerald-600" />
      <div>
        <div>توجد نسخة بيانات محلية لبعض الصفحات.</div>
        <div className="text-xs font-normal text-emerald-700">هذا لا يضمن إمكانية تسجيل الدخول بعد تسجيل الخروج أو توفر جميع الصفحات دون اتصال.</div>
      </div>
    </div>
  );
}
