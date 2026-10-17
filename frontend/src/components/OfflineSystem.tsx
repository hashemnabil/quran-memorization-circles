import { useEffect, useState } from 'react';
import { Network } from '@capacitor/network';
import { db } from '@/lib/db';
import { initOffline, refreshOffline } from '@/lib/offline-engine';
import { useAuthStore } from '@/store/auth';
import { queryClient } from '@/lib/queryClient';
import { getSyncProgress } from '@/lib/sync-progress';
import { tokenStore } from '@/lib/api';

export default function OfflineSystem() {
  const account = useAuthStore((state) => state.user?.id);
  const [online, setOnline] = useState(navigator.onLine);
  const [pending, setPending] = useState(0); const [last, setLast] = useState('');
  const [error, setError] = useState('');
  const [progress, setProgress] = useState(getSyncProgress);
  const refresh = async () => {
    if (!account) return;
    setPending(await db.queue.where('accountId').equals(account).count());
    setLast((await db.meta.get(`${account}:lastSync`))?.value || '');
  };

  useEffect(() => {
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
    window.addEventListener('halaqat:sync-progress', progressChanged);
    window.addEventListener('halaqat:remote-change', remoteChanged);
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
    return () => {
      active = false; clearInterval(interval);
      clearTimeout(initialTimer); clearTimeout(refreshTimer);
      clearTimeout(remoteTimer);
      window.removeEventListener('halaqat:sync-progress', progressChanged);
      window.removeEventListener('halaqat:remote-change', remoteChanged);
      void listener.then((handle) => handle.remove());
      window.removeEventListener('online', start); window.removeEventListener('offline', start);
      window.removeEventListener('halaqat:changed', changed);
    };
  }, [account]);
  const syncing = online && progress.account === account && progress.active;
  const waiting = pending > 0 || Boolean(error) || !last;
  return <div dir="rtl" role="status" aria-live="polite" className="mb-5 flex flex-wrap items-center gap-2 text-[11px] font-medium">
    <span className={`inline-flex items-center gap-2 rounded-lg px-2.5 py-1.5 ${online ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>
      <span aria-hidden="true" className={`h-2 w-2 rounded-full ${online ? 'bg-emerald-500' : 'bg-slate-400'}`} />
      {online ? 'متصل' : 'غير متصل'}
    </span>
    <span className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 ${syncing ? 'bg-blue-50 text-blue-700' : waiting ? 'bg-slate-100 text-slate-600' : 'bg-emerald-50 text-emerald-700'}`}>
      {syncing ? <svg aria-hidden="true" viewBox="0 0 16 16" className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" fill="none"><circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="2" opacity=".2" /><path d="M8 2a6 6 0 0 1 6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg> : !waiting ? <span aria-hidden="true">✓</span> : null}
      {syncing ? `جارٍ المزامنة ${progress.percent}٪` : waiting ? 'بانتظار المزامنة' : 'تمت المزامنة'}
      {syncing && <span role="progressbar" aria-label="تقدم مراحل المزامنة" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress.percent} className="h-1.5 w-14 overflow-hidden rounded-full bg-blue-100"><span className="block h-full rounded-full bg-blue-500 transition-[width] motion-reduce:transition-none" style={{ width: `${progress.percent}%` }} /></span>}
    </span>
  </div>;
}
