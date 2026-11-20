import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { useAuthStore } from '@/store/auth';
import { Modal } from '@/components/ui';

export type Asset = { id: string; title: string; kind: string; mime?: string };
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
          setSelected(pending);
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

export const assetContentUrl=(id:string)=>`${String(api.defaults.baseURL).replace(/\/$/,'')}/founder-assets/${encodeURIComponent(id)}/content`;
export async function libraryAssetBlob(id:string):Promise<Blob>{
  const address=assetContentUrl(id);
  const cache=typeof caches==='undefined'?undefined:await caches.open('qc-curated-assets-v1').catch(()=>undefined);
  let response:Response;
  try{response=await fetch(address);}
  catch(error){const saved=await cache?.match(address);if(saved)return saved.blob();throw error;}
  if(!response.ok)throw new Error('تعذر تحميل الملف؛ حاول مرة أخرى');
  if(cache)void cache.put(address,response.clone()).catch(()=>undefined);
  return response.blob();
}
export function BackgroundChoice({ value, label }: { value: ReturnType<typeof useCuratedBackground>; label: string }) {
  const [open,setOpen]=useState(false);
  return <>
    <button type="button" aria-label={label} aria-haspopup="dialog" onClick={()=>setOpen(true)} className="relative grid h-9 w-9 shrink-0 place-items-center overflow-hidden rounded-lg border border-white/70 bg-white/95 text-emerald-800 shadow-sm transition hover:bg-emerald-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-500">
      {value.url&&<img src={value.url} alt="" className="absolute inset-0 h-full w-full object-cover"/>}
      <span aria-hidden="true" className="relative grid h-6 w-6 place-items-center rounded-md bg-white/90 text-xl leading-none">+</span>
    </button>
    <Modal open={open} onClose={()=>setOpen(false)} title={`اختيار ${label}`} size="lg">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <button type="button" aria-pressed={!value.selected} onClick={()=>{value.choose('');setOpen(false);}} className={`overflow-hidden rounded-xl border-2 text-start ${!value.selected?'border-emerald-600':'border-slate-200'}`}><span className="block h-28 bg-gradient-to-br from-emerald-100 to-amber-50"/><span className="block p-3 text-sm font-bold">الافتراضية</span></button>
        {value.assets.map(asset=><button type="button" key={asset.id} aria-pressed={value.selected===asset.id} onClick={()=>{value.choose(asset.id);setOpen(false);}} className={`overflow-hidden rounded-xl border-2 text-start ${value.selected===asset.id?'border-emerald-600':'border-slate-200 hover:border-emerald-300'}`}><img src={asset.id===value.selected&&value.url?value.url:assetContentUrl(asset.id)} alt={asset.title} loading="lazy" className="h-28 w-full bg-slate-50 object-cover"/><span className="block p-3 text-sm font-bold">{asset.title}{value.selected===asset.id&&<span className="ms-2 text-xs text-emerald-700">محددة</span>}</span></button>)}
      </div>
      {!value.assets.length&&<p className="mt-4 text-sm text-slate-500">لا توجد صور إضافية متاحة حاليًا.</p>}
    </Modal>
  </>;
}
