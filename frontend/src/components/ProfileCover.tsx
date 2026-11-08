import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { api, apiError, syncQueuedCover } from '@/lib/api';
import { queueCover, readPendingCover } from '@/lib/pending-cover';
import { useAuthStore } from '@/store/auth';
import { IconCamera } from '@/components/ui/Icons';
import CommunityImage from '@/pages/community/CommunityImage';

export default function ProfileCover({ mediaId, editable }: { mediaId?: string | null; editable: boolean }) {
  const account = useAuthStore(state => state.user?.id);
  const client = useQueryClient();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false), [pendingPreview, setPendingPreview] = useState({ account: '', url: '' });
  const preview = editable && pendingPreview.account === account ? pendingPreview.url : '';
  useEffect(() => {
    if (!editable || !account) return;
    let active = true, url = '', generation = 0, hadPending = false;
    const refresh = async () => {
      const version = ++generation;
      const pending = await readPendingCover(account);
      if (!active || version !== generation) return;
      if (url) URL.revokeObjectURL(url);
      url = pending ? URL.createObjectURL(pending.blob) : ''; setPendingPreview({ account, url });
      if (hadPending && !pending) void client.invalidateQueries({ queryKey: ['community', 'profile'] });
      hadPending = !!pending;
    };
    const changed = () => { void refresh().catch(() => undefined); }; changed();
    window.addEventListener('halaqat:changed', changed);
    return () => { active = false; if (url) URL.revokeObjectURL(url); window.removeEventListener('halaqat:changed', changed); };
  }, [account, editable, client]);
  const retry = async () => {
    await syncQueuedCover();
    if (account && !await readPendingCover(account)) void client.invalidateQueries({ queryKey: ['community', 'profile'] });
  };
  const pick = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]; event.target.value = ''; if (!file || !account) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) { toast.error('اختر صورة JPEG أو PNG أو WebP'); return; }
    if (file.size > 20 * 1024 * 1024) { toast.error('اختر صورة أصغر من 20 ميجابايت'); return; }
    setBusy(true); const url = URL.createObjectURL(file);
    try {
      const image = new Image(); image.src = url; await image.decode();
      const canvas = document.createElement('canvas'); canvas.width = 1600; canvas.height = 600;
      const context = canvas.getContext('2d'); if (!context) throw new Error('تعذر تجهيز الصورة');
      const scale = Math.max(1600 / image.naturalWidth, 600 / image.naturalHeight);
      context.drawImage(image, (1600 - image.naturalWidth * scale) / 2, (600 - image.naturalHeight * scale) / 2, image.naturalWidth * scale, image.naturalHeight * scale);
      const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(value => value ? resolve(value) : reject(new Error('تعذر تجهيز الصورة')), 'image/jpeg', 0.85));
      if (useAuthStore.getState().user?.id !== account) return;
      await queueCover(account, blob);
      try { await retry(); if (!await readPendingCover(account)) toast.success('تم تحديث غلاف الملف الشخصي'); else toast('حُفظ الغلاف على الجهاز بانتظار الاتصال'); }
      catch { toast('حُفظ الغلاف؛ ستتم محاولة رفعه عند الاتصال'); }
    } catch (error) { toast.error(apiError(error, 'تعذر تغيير الغلاف')); }
    finally { URL.revokeObjectURL(url); setBusy(false); }
  };
  return <>
    {preview ? <img src={preview} alt="معاينة غلاف الملف الشخصي" className="absolute inset-0 h-full w-full object-cover" /> : mediaId && <CommunityImage key={mediaId} id={mediaId} alt="غلاف الملف الشخصي" className="absolute inset-0 h-full w-full object-cover" />}
    {(preview || mediaId) && <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-black/25" />}
    {editable && <div className="absolute bottom-3 left-3 z-10 flex max-w-[70%] flex-wrap items-center gap-2">
      <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" aria-label="اختيار غلاف الملف الشخصي" onChange={event => void pick(event)} />
      <button type="button" disabled={busy || !!preview} onClick={() => input.current?.click()} className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-white px-3 py-2 text-xs font-bold text-emerald-900 shadow-sm disabled:opacity-60"><IconCamera size={16} />{busy ? 'جارٍ حفظ الغلاف…' : 'تغيير الغلاف'}</button>
      {mediaId && !preview && <button type="button" disabled={busy} className="rounded-lg bg-white/95 px-3 py-2 text-xs text-slate-600" onClick={async () => { setBusy(true); try { await api.delete('/community/profile-cover'); await client.invalidateQueries({ queryKey: ['community', 'profile'] }); toast.success('تمت إزالة الغلاف'); } catch (error) { toast.error(apiError(error, 'تعذر إزالة الغلاف')); } finally { setBusy(false); } }}>إزالة الغلاف</button>}
      {preview && <button type="button" disabled={busy} className="rounded-lg bg-white/95 px-3 py-2 text-xs text-amber-800" onClick={async () => { setBusy(true); try { await retry(); } catch (error) { toast.error(apiError(error, 'الغلاف محفوظ؛ تعذر رفعه الآن')); } finally { setBusy(false); } }}>الغلاف بانتظار المزامنة · إعادة المحاولة</button>}
    </div>}
  </>;
}
