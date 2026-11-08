import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { useAuthStore } from '@/store/auth';

/** Authenticated fetch: restricted images never get a public URL or disk cache. */
export default function CommunityImage({ id, className, alt = 'صورة مرفقة' }: { id: string; className?: string; alt?: string }) {
  const account = useAuthStore(state => state.user?.id);
  const [src, setSrc] = useState(''), [failed, setFailed] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    let objectUrl = '';
    setSrc(''); setFailed(false);
    void api.get<Blob>('/community/media/' + encodeURIComponent(id), { responseType: 'blob', signal: controller.signal }).then(result => {
      if (controller.signal.aborted || useAuthStore.getState().user?.id !== account) return;
      objectUrl = URL.createObjectURL(result.data); setSrc(objectUrl);
    }).catch(() => { if (!controller.signal.aborted) setFailed(true); });
    return () => { controller.abort(); if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [id, account]);
  return src ? <img src={src} alt={alt} className={className ?? 'max-h-[32rem] w-full rounded-xl object-contain'}/> : <p className="relative p-3 text-sm" role="status">{failed ? 'الصورة غير متاحة؛ تحقق من الاتصال والصلاحيات' : 'تحميل الصورة…'}</p>;
}
