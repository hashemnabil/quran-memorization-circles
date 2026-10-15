import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Network } from '@capacitor/network';
import { db } from '@/lib/db';
import { initOffline, syncAll, pullAll } from '@/lib/offline-engine';
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
  const synchronize = async () => {
    setBusy(true); setError('');
    try { await syncAll(); await pullAll(); } catch (e) { setError(e instanceof Error ? e.message : 'تعذرت المزامنة'); }
    finally { setBusy(false); await refresh(); }
  };
  useEffect(() => {
    if (!account) return;
    let active = true;
    const start = () => { setOnline(navigator.onLine); if (navigator.onLine) void synchronize(); };
    const update = () => { if (active) void refresh(); };
    const changed = () => { update(); void queryClient.invalidateQueries(); };
    void initOffline().then(update).catch((e) => { if (active) setError(String(e.message || e)); });
    const listener = Network.addListener('networkStatusChange', (status) => { setOnline(status.connected); if (status.connected) void synchronize(); });
    window.addEventListener('online', start); window.addEventListener('offline', start);
    window.addEventListener('halaqat:changed', changed);
    const interval = setInterval(update, 2000);
    const syncInterval = setInterval(() => { if (navigator.onLine) void synchronize(); }, 60000);
    return () => { active = false; clearInterval(interval); clearInterval(syncInterval); void listener.then((handle) => handle.remove()); window.removeEventListener('online', start); window.removeEventListener('offline', start); window.removeEventListener('halaqat:changed', changed); };
  }, [account]);
  return <div dir="rtl" role="status" className={`flex flex-wrap items-center justify-between gap-2 p-3 text-sm ${!online ? 'bg-red-100 text-red-900' : pending || error ? 'bg-yellow-100 text-yellow-900' : 'bg-green-100 text-green-900'}`}>
    <span>{!online ? 'أوفلاين — البيانات المحملة متاحة' : pending ? `عندك ${pending} عملية بانتظار المزامنة` : last ? 'تمت المزامنة' : 'جاري تجهيز البيانات المحلية'}{last && ` · آخر مزامنة: ${new Date(last).toLocaleString('ar-SA')}`}{error && ` · ${error}`}</span>
    <div className="flex gap-3"><button disabled={busy || !online} onClick={() => void synchronize()}>{busy ? 'جارٍ المزامنة…' : 'مزامنة الآن'}</button><Link to="/settings/offline">إدارة الأوفلاين</Link></div>
  </div>;
}
