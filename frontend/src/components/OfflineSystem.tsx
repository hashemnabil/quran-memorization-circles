import { useEffect, useState } from 'react';
import { Network } from '@capacitor/network';
import { db } from '@/lib/db';
import { initOffline, refreshOffline } from '@/lib/offline-engine';
import { useAuthStore } from '@/store/auth';
import { queryClient } from '@/lib/queryClient';
import { getSyncProgress } from '@/lib/sync-progress';
import { tokenStore, syncQueuedAvatar, syncQueuedCover, syncQueuedStudentPhotos } from '@/lib/api';
import { studentPhotoCount } from '@/lib/pending-student-photos';
import { localDomainLabels } from '@/lib/local-domain-labels';

export default function OfflineSystem() {
  const account = useAuthStore((state) => state.user?.id);
  const [, setOnline] = useState(navigator.onLine);
  const [, setError] = useState('');
  const [, setProgress] = useState(getSyncProgress);
  const [rejected, setRejected] = useState<Array<{ id: string; label: string; message: string }>>([]);
  const refresh = async () => {
    if (!account) return;
    const operations = await db.queue.where('accountId').equals(account).toArray();
    if (useAuthStore.getState().user?.id !== account) return;
    setRejected(operations.filter(operation => !!operation.error).map(operation => ({ id: operation.opId, label: localDomainLabels[operation.table] || 'عملية محفوظة', message: operation.error! })));
  };

  useEffect(() => {
    setError(''); setRejected([]);
    if (!account) return;
    let active = true;
    let running = false;
    let changedDuringSync = false;
    let remoteChangedDuringSync = false;
    let refreshAfterSync = false;
    let refreshTimer: ReturnType<typeof setTimeout> | undefined;
    let remoteTimer: ReturnType<typeof setTimeout> | undefined;
    const update = () => { if (active) void refresh(); };
    const synchronize = async (initial = false, refreshReads = false) => {
      if (!active || !navigator.onLine) return;
      if (running) { refreshAfterSync ||= refreshReads; return; }
      running = true; setError('');
      try {
        const wasLocal = tokenStore.isLocal();
        await useAuthStore.getState().resumeOnline();
        if (!active || useAuthStore.getState().user?.id !== account) return;
        // Visible screens must leave their cached offline results as soon as
        // the server session is verified, even if the sync cursor is unchanged.
        if (refreshReads || wasLocal) await queryClient.invalidateQueries();
        await (initial ? initOffline() : refreshOffline({ checkDelta: refreshReads }));
        if (active && useAuthStore.getState().user?.id === account) {
          const results = await Promise.allSettled([syncQueuedAvatar(), syncQueuedCover(), syncQueuedStudentPhotos()]);
          const rejected = results.find(result => result.status === 'rejected');
          if (rejected?.status === 'rejected') throw rejected.reason;
        }
      }
      catch (e) { if (active) setError(e instanceof Error ? e.message : String(e)); }
      finally {
        running = false;
        if (active) {
          update();
          if (refreshAfterSync) { refreshAfterSync = false; void synchronize(false, true); }
          if (changedDuringSync) { changedDuringSync = false; void queryClient.invalidateQueries(); }
          if (remoteChangedDuringSync) { remoteChangedDuringSync = false; remoteTimer = setTimeout(() => { void synchronize(); }, 750); }
        }
      }
    };
    // Reconnection only resumes known pending work. The realtime connection
    // announces the current server revision, including changes missed offline.
    const connectivityChanged = (connected: boolean) => {
      setOnline(connected);
      if (connected) void synchronize(false, true);
      // Keep visible data and unsaved form input intact on disconnect. Further
      // requests already switch to the local adapter without remounting forms.
    };
    const start = () => connectivityChanged(navigator.onLine);
    const changed = () => {
      update();
      if (running) { changedDuringSync = true; return; }
      clearTimeout(refreshTimer);
      refreshTimer = setTimeout(() => { if (active) void queryClient.invalidateQueries(); }, 150);
    };
    const progressChanged = () => { if (active) setProgress(getSyncProgress()); };
    const remoteChanged = () => {
      if (running) { remoteChangedDuringSync = true; return; }
      clearTimeout(remoteTimer);
      remoteTimer = setTimeout(() => { void synchronize(); }, 750);
    };
    const serviceWorkerMessage = (event: MessageEvent) => {
      if (event.data?.type === 'HALAQAT_SYNC_REQUEST') void synchronize(false, true);
    };
    window.addEventListener('halaqat:sync-progress', progressChanged);
    window.addEventListener('halaqat:remote-change', remoteChanged);
    navigator.serviceWorker?.addEventListener('message', serviceWorkerMessage);
    update();
    // Let the first screen render and issue its interactive requests first.
    const locallyUnlocked = tokenStore.isLocal();
    const initialTimer = setTimeout(() => { void synchronize(true, true); }, locallyUnlocked ? 0 : 1200);
    const listener = Network.addListener('networkStatusChange', (status) => {
      if (!active) return;
      connectivityChanged(status.connected);
    });
    window.addEventListener('online', start); window.addEventListener('offline', start);
    window.addEventListener('halaqat:changed', changed);
    const interval = setInterval(update, 2000);
    const avatarRetry = setInterval(() => {
      if (active && navigator.onLine && !running) void db.meta.get(`${account}:pendingAvatar`)
        .then(async pending => { if ((pending || await studentPhotoCount(account)) && active) void synchronize(); }).catch(() => undefined);
    }, 60_000);
    return () => {
      active = false; clearInterval(interval);
      clearInterval(avatarRetry);
      clearTimeout(initialTimer); clearTimeout(refreshTimer);
      clearTimeout(remoteTimer);
      window.removeEventListener('halaqat:sync-progress', progressChanged);
      window.removeEventListener('halaqat:remote-change', remoteChanged);
      navigator.serviceWorker?.removeEventListener('message', serviceWorkerMessage);
      void listener.then((handle) => handle.remove());
      window.removeEventListener('online', start); window.removeEventListener('offline', start);
      window.removeEventListener('halaqat:changed', changed);
    };
  }, [account]);
  if (!rejected.length) return null;
  return <div dir="rtl" role="status" aria-live="polite" className="mb-4 text-[11px] font-medium">
    <details className="w-full rounded-xl border border-amber-200 bg-amber-50 p-3 text-amber-900">
      <summary className="cursor-pointer font-bold">تعذّر اعتماد {rejected.length} عملية — عرض الأسباب</summary>
      <p className="mt-2 leading-6">تعديلاتك محفوظة على الجهاز. راجع البيانات أو الصلاحيات المذكورة؛ لم تُعتمد هذه العمليات على الخادم.</p>
      <ul className="mt-2 space-y-2">{rejected.slice(0,10).map(operation => <li key={operation.id}><strong>{operation.label}:</strong> {operation.message}</li>)}</ul>
      {rejected.length > 10 && <p className="mt-2">توجد {rejected.length - 10} عمليات إضافية تحتاج المراجعة.</p>}
    </details>
  </div>;
}
