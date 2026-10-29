import { useEffect, useState } from 'react';
import { Network } from '@capacitor/network';
import { db } from '@/lib/db';
import { initOffline, refreshOffline } from '@/lib/offline-engine';
import { useAuthStore } from '@/store/auth';
import { queryClient } from '@/lib/queryClient';
import { getSyncProgress } from '@/lib/sync-progress';
import { tokenStore, syncQueuedAvatar, syncQueuedStudentPhotos } from '@/lib/api';
import { studentPhotoCount } from '@/lib/pending-student-photos';
import { localDomainLabels } from '@/lib/local-domain-labels';

export default function OfflineSystem() {
  const account = useAuthStore((state) => state.user?.id);
  const [online, setOnline] = useState(navigator.onLine);
  const [pending, setPending] = useState(0); const [last, setLast] = useState('');
  const [error, setError] = useState('');
  const [progress, setProgress] = useState(getSyncProgress);
  const [rejected, setRejected] = useState<Array<{ id: string; label: string; message: string }>>([]);
  const refresh = async () => {
    if (!account) return;
    const operations = await db.queue.where('accountId').equals(account).toArray();
    const count = operations.length + ((await db.meta.get(`${account}:pendingAvatar`)) ? 1 : 0) + await studentPhotoCount(account);
    const lastSync = (await db.meta.get(`${account}:lastSync`))?.value || '';
    if (useAuthStore.getState().user?.id !== account) return;
    setPending(count); setLast(lastSync);
    setRejected(operations.filter(operation => !!operation.error).map(operation => ({ id: operation.opId, label: localDomainLabels[operation.table] || 'عملية محفوظة', message: operation.error! })));
  };

  useEffect(() => {
    setPending(0); setLast(''); setError(''); setRejected([]);
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
          const results = await Promise.allSettled([syncQueuedAvatar(), syncQueuedStudentPhotos()]);
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
  const syncing = online && progress.account === account && progress.active;
  const waiting = pending > 0 || Boolean(error) || !last;
  return <div dir="rtl" role="status" aria-live="polite" className="mb-5 flex flex-wrap items-center gap-2 text-[11px] font-medium">
    <span className={`inline-flex items-center gap-2 rounded-lg px-2.5 py-1.5 ${online ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>
      <span aria-hidden="true" className={`h-2 w-2 rounded-full ${online ? 'bg-emerald-500' : 'bg-slate-400'}`} />
      {online ? 'متصل بالإنترنت' : 'العمل بالنسخة المحلية'}
    </span>
    <span className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 ${syncing ? 'bg-blue-50 text-blue-700' : waiting ? 'bg-slate-100 text-slate-600' : 'bg-emerald-50 text-emerald-700'}`}>
      {syncing ? <svg aria-hidden="true" viewBox="0 0 16 16" className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" fill="none"><circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="2" opacity=".2" /><path d="M8 2a6 6 0 0 1 6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg> : !waiting ? <span aria-hidden="true">✓</span> : null}
      {syncing ? 'تحديث النسخة المحلية في الخلفية' : waiting ? pending>0?'تعديلات محلية بانتظار الإرسال':online?'تجهيز النسخة المحلية في الخلفية':'بيانات الجهاز المحفوظة' : 'النسخة المحلية محدّثة'}
      {syncing && <span role="progressbar" aria-label="تقدم مراحل المزامنة" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress.percent} className="h-1.5 w-14 overflow-hidden rounded-full bg-blue-100"><span className="block h-full rounded-full bg-blue-500 transition-[width] motion-reduce:transition-none" style={{ width: `${progress.percent}%` }} /></span>}
    </span>
    {last && Number.isFinite(Date.parse(last)) && <time dateTime={last} className="text-slate-500">آخر مزامنة: {new Intl.DateTimeFormat('ar-SA', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(last))}</time>}
    {rejected.length > 0 && <details className="w-full rounded-xl border border-amber-200 bg-amber-50 p-3 text-amber-900">
      <summary className="cursor-pointer font-bold">تعذّر اعتماد {rejected.length} عملية — عرض الأسباب</summary>
      <p className="mt-2 leading-6">تعديلاتك محفوظة على الجهاز. راجع البيانات أو الصلاحيات المذكورة؛ لم تُعتمد هذه العمليات على الخادم.</p>
      <ul className="mt-2 space-y-2">{rejected.slice(0,10).map(operation => <li key={operation.id}><strong>{operation.label}:</strong> {operation.message}</li>)}</ul>
      {rejected.length > 10 && <p className="mt-2">توجد {rejected.length - 10} عمليات إضافية تحتاج المراجعة.</p>}
    </details>}
  </div>;
}
