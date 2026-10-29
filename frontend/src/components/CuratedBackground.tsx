import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { useAuthStore } from '@/store/auth';

type Asset = { id: string; title: string; kind: string };
type Kind = 'CHAT_BACKGROUND' | 'PROFILE_COVER' | 'NOTIFICATION_SOUND' | 'ADHAN_SOUND';
function catalog(value: unknown): Asset[] {
  return Array.isArray(value) ? value.filter((item): item is Asset => !!item && typeof item.id === 'string' && typeof item.title === 'string' && typeof item.kind === 'string') : [];
}
export function useCuratedBackground(kind: Kind) {
  const account = useAuthStore(state => state.user?.id || '');
  const key = `qc.curated.${account}.${kind}`;
  const [assets, setAssets] = useState<Asset[]>([]), [selected, setSelected] = useState(''), [url, setUrl] = useState('');
  useEffect(() => {
    let active = true;
    setUrl(''); setAssets([]); setSelected('');
    if (!account) return;
    try { setSelected(localStorage.getItem(key) || ''); setAssets(catalog(JSON.parse(localStorage.getItem('qc.curated.catalog') || '[]'))); } catch { /* Defaults remain usable. */ }
    api.get<Asset[]>('/founder-assets').then(({ data }) => {
      if (!active) return;
      const entries = catalog(data);
      setAssets(entries);
      try { localStorage.setItem('qc.curated.catalog', JSON.stringify(entries)); } catch { /* Online selection still works. */ }
    }).catch(() => {});
    const sync = async () => {
      if (!active || !account || useAuthStore.getState().user?.id !== account) return;
      try {
        const pending = localStorage.getItem(`${key}.pending`);
        if (pending !== null) {
          await api.put(`/founder-assets/choices/${kind}`, { assetId: pending || null });
          if (active && localStorage.getItem(`${key}.pending`) === pending) localStorage.removeItem(`${key}.pending`);
        } else {
          const { data } = await api.get('/founder-assets/choices');
          if (!active || useAuthStore.getState().user?.id !== account || localStorage.getItem(`${key}.pending`) !== null || !Array.isArray(data)) return;
          const choice = data.find(item => item.kind === kind);
          if (choice) { setSelected(choice.assetId || ''); localStorage.setItem(key, choice.assetId || ''); }
        }
      } catch { /* The durable pending choice remains for reconnect. */ }
    };
    void sync(); const timer = window.setInterval(() => void sync(), 60000);
    window.addEventListener('online', sync); window.addEventListener('qc:curated-choice', sync);
    return () => { active = false; clearInterval(timer); window.removeEventListener('online', sync); window.removeEventListener('qc:curated-choice', sync); };
  }, [key]);
  useEffect(() => {
    let active = true, objectUrl = '';
    setUrl('');
    if (!selected || !assets.some(asset => asset.id === selected && asset.kind === kind)) return;
    const address = `${String(api.defaults.baseURL).replace(/\/$/, '')}/founder-assets/${encodeURIComponent(selected)}/content`;
    void (async () => {
      try {
        const cache = await caches.open('qc-curated-assets-v1');
        let response: Response;
        try { response = await fetch(address); if (!response.ok) return; await cache.put(address, response.clone()); }
        catch { const saved = await cache.match(address); if (!saved) return; response = saved; }
        if (!active) return;
        objectUrl = URL.createObjectURL(await response.blob());
        if (active) setUrl(objectUrl); else URL.revokeObjectURL(objectUrl);
      } catch { if (active && navigator.onLine) setUrl(address); }
    })();
    return () => { active = false; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [assets, selected, kind]);
  return { assets: assets.filter(asset => asset.kind === kind), selected, url, choose(value: string) {
    setSelected(value); try { localStorage.setItem(key, value); localStorage.setItem(`${key}.pending`, value); window.dispatchEvent(new Event('qc:curated-choice')); } catch { /* This visit remains usable. */ }
  } };
}

export function BackgroundChoice({ value, label }: { value: ReturnType<typeof useCuratedBackground>; label: string }) {
  return <label className="flex items-center gap-2 text-xs text-slate-500">{label}<select aria-label={label} className="input max-w-48" value={value.selected} onChange={event => value.choose(event.target.value)}><option value="">الافتراضي</option>{value.assets.map(asset => <option key={asset.id} value={asset.id}>{asset.title}</option>)}</select></label>;
}
