import { useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { api, tokenStore } from '@/lib/api';
import { db } from '@/lib/db';
import { useAuthStore } from '@/store/auth';
import { openValue, sealValue } from '@/lib/local-encryption';
import { Button, Modal } from '@/components/ui';

export type Popup = { id: string; title: string; body: string; link?: string; audience: string[]; publishedAt: string; expiresAt?: string; isActive: boolean; receipts?: { kind: string; createdAt: string }[]; popup: { placement: string; repeat: string; state: string; priority: number; requireAck: boolean; important: boolean; buttonText: string; imageAssetId: string; videoAssetId?: string } };
const base = () => String(api.defaults.baseURL).replace(/\/$/, '');
function usePopupMedia(id?: string) {
  const user = useAuthStore(state => state.user);
  const account = user?.id, role = user?.role;
  const address = id ? `${base()}/founder-assets/${encodeURIComponent(id)}/${account ? 'private-content' : 'content'}` : '';
  const [source, setSource] = useState('');
  useEffect(() => {
    let active = true, objectUrl = '';
    setSource(account ? '' : address);
    if (!address) return;
    void (async () => {
      try {
        if (account) {
          const key = `${account}:popup-media:${role}:${id}`;
          let blob: Blob | undefined;
          try {
            if (!navigator.onLine) throw new Error('offline');
            const token = tokenStore.access(); if (!token) return;
            const response = await fetch(address, { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store', credentials: 'omit' });
            if (!response.ok) return;
            blob = await response.blob();
            if (!active || useAuthStore.getState().user?.id !== account || blob.size > 5 * 1024 * 1024) return;
            try { await db.responses.put({ key, accountId: account, data: blob }); } catch { /* Display online even when local storage is full. */ }
          } catch { const saved = await db.responses.get(key); if (saved?.data instanceof Blob) blob = saved.data; }
          if (!active || !blob || useAuthStore.getState().user?.id !== account) return;
          objectUrl = URL.createObjectURL(blob); setSource(objectUrl); return;
        }
        const cache = await caches.open('qc-curated-assets-v1');
        let response: Response | undefined;
        try { const online = await fetch(address); if (online.ok) { response = online; await cache.put(address, online.clone()); } else return; }
        catch { response = await cache.match(address); }
        if (!response || !active) return;
        const blob = await response.blob(); if (!active || blob.size > 5 * 1024 * 1024) return;
        objectUrl = URL.createObjectURL(blob); setSource(objectUrl);
      } catch { /* The ordinary resource URL remains available online. */ }
    })();
    return () => { active = false; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [address, account, role, id]);
  return source;
}
export function PopupBody({ row, onAction }: { row: Popup; onAction?: () => void }) {
  const image = usePopupMedia(row.popup.imageAssetId), video = usePopupMedia(row.popup.videoAssetId);
  return <div className="space-y-4">
    {row.popup.important && <p className="rounded-xl bg-amber-50 px-3 py-2 text-sm font-bold text-amber-900">إعلان مهم</p>}
    {row.popup.imageAssetId && <img className="max-h-64 w-full rounded-xl object-contain" alt="صورة الإعلان" src={image || undefined} />}
    {row.popup.videoAssetId && <video className="max-h-72 w-full rounded-xl" controls preload="metadata" src={video || undefined} />}
    <p className="whitespace-pre-wrap break-words text-sm leading-8">{row.body}</p>
    {row.link && row.link.startsWith('/') && !row.link.startsWith('//') ? <Link className="btn-primary inline-flex" to={row.link} onClick={onAction}>{row.popup.buttonText || 'عرض التفاصيل'}</Link> : row.link?.startsWith('https://') && <a className="btn-primary inline-flex" href={row.link} target="_blank" rel="noopener noreferrer" onClick={onAction}>{row.popup.buttonText || 'عرض التفاصيل'}</a>}
  </div>;
}

export default function PopupAnnouncements() {
  const user = useAuthStore(state => state.user), status = useAuthStore(state => state.status);
  const { pathname, search } = useLocation();
  const target = new URLSearchParams(search).get('announcement');
  const scope = user ? `user:${user.id}:${user.role}` : 'public';
  const [rows, setRows] = useState<{ scope: string; data: Popup[] }>({ scope: '', data: [] });
  const [dismissed, setDismissed] = useState<string[]>([]), [error, setError] = useState('');
  const [unlocked, setUnlocked] = useState(document.documentElement.dataset.appLocked !== '1');
  const opening = useRef(crypto.randomUUID());
  const content = useRef<HTMLDivElement>(null);
  useEffect(() => { const observer = new MutationObserver(() => setUnlocked(document.documentElement.dataset.appLocked !== '1')); observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-app-locked'] }); return () => observer.disconnect(); }, []);
  useEffect(() => {
    if (!['authenticated', 'unauthenticated'].includes(status) || !unlocked) return;
    let active = true;
    const cacheKey = `qc.popup.cache.${scope}`;
    const read = (key: string, fallback: any) => { try { const value = JSON.parse(localStorage.getItem(key) || 'null'); return value ? user ? openValue(user.id, key, value) : value : fallback; } catch { return fallback; } };
    const write = (key: string, value: unknown) => { localStorage.setItem(key, JSON.stringify(user ? sealValue(user.id, key, value) : value)); };
    const saved = read(cacheKey, []);
    if (Array.isArray(saved)) setRows({ scope, data: saved });
    async function refresh() {
      if (!active) return;
      try { const { data } = await api.get(`/popup-announcements/${user ? 'active' : 'public'}`);
        if (!active || !Array.isArray(data)) return;
        setRows({ scope, data }); try { write(cacheKey, data); } catch { /* Online display still works. */ }
      } catch { /* Retain only this scope's non-expired cached notices. */ }
      if (user && useAuthStore.getState().user?.id === user.id) {
        const key = `qc.popup.acks.${user.id}`;
        const pending = read(key, []);
        if (!Array.isArray(pending)) return;
        for (const id of pending) {
          if (!active || useAuthStore.getState().user?.id !== user.id) return;
          try { await api.post(`/popup-announcements/${encodeURIComponent(id)}/event`, { kind: 'ACK', eventKey: 'ack' });
            const latest = read(key, []); write(key, Array.isArray(latest) ? latest.filter(item => item !== id) : []);
          } catch { break; }
        }
      }
    }
    void refresh(); const timer = window.setInterval(() => void refresh(), 60000); window.addEventListener('online', refresh);
    return () => { active = false; clearInterval(timer); window.removeEventListener('online', refresh); };
  }, [scope, status, unlocked]);
  const now = new Date();
  const row = rows.scope === scope && unlocked && (user || pathname === '/login') ? [...rows.data].sort((a, b) => Number(b.id === target) - Number(a.id === target)).find(row => {
    if (!row?.popup || !row.isActive || row.popup.state !== 'PUBLISHED' || new Date(row.publishedAt) > now || row.expiresAt && new Date(row.expiresAt) <= now || dismissed.includes(`${scope}:${row.id}`)) return false;
    if (!user && (row.audience?.length || !['BEFORE', 'BOTH'].includes(row.popup.placement))) return false;
    if (user && (!['AFTER', 'BOTH'].includes(row.popup.placement) || row.audience?.length && !row.audience.includes(user.role))) return false;
    if (row.id === target) return true;
    let seen: { day?: string; ack?: boolean } = {};
    try { seen = JSON.parse(localStorage.getItem(`qc.popup.seen.${row.popup.placement === 'BOTH' ? 'device' : scope}.${row.id}`) || '{}'); } catch { /* Show safely if preferences are unavailable. */ }
    const receipts = row.receipts || [];
    if (row.popup.repeat === 'UNTIL_ACK' || row.popup.requireAck) return !seen.ack && !receipts.some(receipt => receipt.kind === 'ACK');
    if (row.popup.repeat === 'OPEN') return true;
    if (row.popup.repeat === 'ONCE_DEVICE') return !seen.day;
    if (row.popup.repeat === 'DAILY') return seen.day !== now.toLocaleDateString('en-CA') && !receipts.some(receipt => receipt.kind === 'VIEW' && new Date(receipt.createdAt).toLocaleDateString('en-CA') === now.toLocaleDateString('en-CA'));
    return !seen.day && !receipts.length;
  }) : undefined;
  useEffect(() => {
    if (!row) return;
    const timer = setTimeout(() => {
      if (document.visibilityState !== 'visible' || document.documentElement.dataset.appLocked === '1') return;
      const box = content.current?.getBoundingClientRect();
      if (!box || box.width <= 0 || box.height <= 0 || box.bottom <= 0 || box.top >= innerHeight) return;
      try { const key = `qc.popup.seen.${row.popup.placement === 'BOTH' ? 'device' : scope}.${row.id}`; const saved = JSON.parse(localStorage.getItem(key) || '{}'); localStorage.setItem(key, JSON.stringify({ ...saved, day: new Date().toLocaleDateString('en-CA') })); } catch { /* Impression transport is still attempted. */ }
      let device = ''; try { device = localStorage.getItem('qc.popup.device') || crypto.randomUUID(); localStorage.setItem('qc.popup.device', device); } catch { device = crypto.randomUUID(); }
      void api.post(`/popup-announcements/${row.id}/${user ? 'event' : 'public-event'}`, { kind: 'VIEW', eventKey: opening.current, device }).catch(() => {});
    }, 300);
    return () => clearTimeout(timer);
  }, [row?.id, scope]);
  if (!row) return null;
  const close = () => setDismissed(previous => [...previous, `${scope}:${row.id}`]);
  return <Modal open title={row.title} onClose={close} size="md">
    <div ref={content}><PopupBody row={row} onAction={() => {
      let device = ''; try { device = localStorage.getItem('qc.popup.device') || crypto.randomUUID(); } catch { device = crypto.randomUUID(); }
      void api.post(`/popup-announcements/${row.id}/${user ? 'event' : 'public-event'}`, { kind: 'CLICK', eventKey: crypto.randomUUID(), device }).catch(() => {});
    }} /></div>
    {error && <p role="alert" className="mt-3 text-sm text-red-700">{error}</p>}
    <div className="mt-5 flex flex-wrap gap-2"><Button variant="secondary" onClick={close}>إغلاق والمتابعة</Button>
      {user && (row.popup.requireAck || row.popup.repeat === 'UNTIL_ACK') && <Button onClick={() => {
        try {
          const key = `qc.popup.acks.${user.id}`, raw = JSON.parse(localStorage.getItem(key) || 'null');
          const pending = raw ? openValue<string[]>(user.id, key, raw) : [];
          localStorage.setItem(key, JSON.stringify(sealValue(user.id, key, [...new Set([...pending, row.id])])));
          const seenKey = `qc.popup.seen.${row.popup.placement === 'BOTH' ? 'device' : scope}.${row.id}`;
          localStorage.setItem(seenKey, JSON.stringify({ day: new Date().toLocaleDateString('en-CA'), ack: true })); close();
          void api.post(`/popup-announcements/${row.id}/event`, { kind: 'ACK', eventKey: 'ack' }).then(() => window.dispatchEvent(new Event('online'))).catch(() => {});
        } catch { setError('تعذر حفظ تأكيد القراءة على الجهاز؛ لم يُسجَّل التأكيد.'); }
      }}>اطلعت</Button>}
    </div>
  </Modal>;
}
