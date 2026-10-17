import { useEffect, useState } from 'react';
import { cachedImage } from '@/lib/offline-images';
import { useAuthStore } from '@/store/auth';
export function useCachedImage(src?: string | null) {
  const [cached, setCached] = useState<string>();
  const account = useAuthStore((state) => state.user?.id);
  useEffect(() => {
    let active = true; let objectUrl: string | undefined; setCached(undefined);
    if (src && account) void cachedImage(src).then((blob) => { if (blob && active) { objectUrl = URL.createObjectURL(blob); setCached(objectUrl); } }).catch(() => undefined);
    return () => { active = false; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [src, account]);
  const bundled = src?.startsWith('/brand-') || src?.startsWith('/assets/') || /^(data:|blob:)/.test(src || '');
  return cached || (account && !bundled ? undefined : src);
}
