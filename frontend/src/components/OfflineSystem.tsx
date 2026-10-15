import { useEffect, useState } from 'react';
import { Network } from '@capacitor/network';
import { db } from '@/lib/db';
import { initOffline, refreshOffline } from '@/lib/offline-engine';
import { useAuthStore } from '@/store/auth';
import { queryClient } from '@/lib/queryClient';

export default function OfflineSystem() {
  const account = useAuthStore((state) => state.user?.id);
  const [online, setOnline] = useState(navigator.onLine);
  const [pending, setPending] = useState(0); const [last, setLast] = useState('');
  const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const refresh = async () => {
    if (!account) return;
    setPending(await db.queue.where('accountId').equals(account).count());
    setLast((await db.meta.get(`${account}:lastSync`))?.value || '');
  };

  useEffect(() => {
    if (!account) return;
    let active = true;
    let running = false;
    const update = () => { if (active) void refresh(); };
    const synchronize = async (initial = false) => {
      if (running || !active || !navigator.onLine) return;
      running = true; setBusy(true); setError('');
      try { await (initial ? initOffline() : refreshOffline()); }
      catch (e) { if (active) setError(e instanceof Error ? e.message : String(e)); }
      finally { running = false; if (active) { setBusy(false); update(); } }
    };
    const start = () => { setOnline(navigator.onLine); if (navigator.onLine) void synchronize(); };
    const visible = () => { if (document.visibilityState === 'visible') start(); };
    const changed = () => { update(); void queryClient.invalidateQueries(); };
    update(); void synchronize(true);
    const listener = Network.addListener('networkStatusChange', (status) => {
      if (!active) return;
      setOnline(status.connected);
      if (status.connected) void synchronize();
    });
    window.addEventListener('online', start); window.addEventListener('offline', start);
    window.addEventListener('focus', start);
    document.addEventListener('visibilitychange', visible);
    window.addEventListener('halaqat:changed', changed);
    const interval = setInterval(update, 2000);
    const syncInterval = setInterval(() => { if (document.visibilityState === 'visible') void synchronize(); }, 30000);
    return () => {
      active = false; clearInterval(interval); clearInterval(syncInterval);
      void listener.then((handle) => handle.remove());
      window.removeEventListener('online', start); window.removeEventListener('offline', start);
      window.removeEventListener('focus', start);
      document.removeEventListener('visibilitychange', visible);
      window.removeEventListener('halaqat:changed', changed);
    };
  }, [account]);
  const syncing = online && busy;
  const waiting = pending > 0 || Boolean(error) || !last;
  return <div dir="rtl" role="status" aria-live="polite" className="flex flex-wrap items-center gap-2 border-b border-slate-100 bg-white px-4 py-2 text-xs font-medium sm:px-6">
    <span className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 ${online ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>
      <span aria-hidden="true" className={`h-2 w-2 rounded-full ${online ? 'bg-emerald-500' : 'bg-slate-400'}`} />
      {online ? 'متصل' : 'غير متصل'}
    </span>
    <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 ${syncing ? 'bg-blue-50 text-blue-700' : waiting ? 'bg-amber-50 text-amber-700' : 'bg-emerald-50 text-emerald-700'}`}>
      {syncing ? <svg aria-hidden="true" viewBox="0 0 16 16" className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" fill="none"><circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="2" opacity=".2" /><path d="M8 2a6 6 0 0 1 6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg> : !waiting ? <span aria-hidden="true">✓</span> : null}
      {syncing ? 'جارٍ المزامنة' : waiting ? 'بانتظار المزامنة' : 'تمت المزامنة'}
    </span>
  </div>;
}
