import { useEffect, useState } from 'react';
import { cachedImage } from '@/lib/offline-images';
import { useAuthStore } from '@/store/auth';
export function useCachedImage(src?: string | null) {
  const [cached, setCached] = useState<string>();
  const account = useAuthStore((state) => state.user?.id);
  useEffect(() => {
    let active = true; let objectUrl: string | undefined; setCached(undefined);
    let loading = false;
    const load = async () => {
      if (!src || !account || loading || !active) return;
      loading = true;
      try {
        const blob = await cachedImage(src, account);
        if (blob && active) {
          const next = URL.createObjectURL(blob);
          setCached(next);
          if (objectUrl) URL.revokeObjectURL(objectUrl);
          objectUrl = next;
        }
      } catch { /* Keep the placeholder; retry when connectivity returns. */ }
      finally { loading = false; }
    };
    void load();
    window.addEventListener('online', load);
    return () => { active = false; window.removeEventListener('online', load); if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [src, account]);
  const bundled = src?.startsWith('/brand-') || src?.startsWith('/assets/') || /^(data:|blob:)/.test(src || '');
  return bundled ? src : cached;
}
