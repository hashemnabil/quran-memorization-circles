import { ChangeEvent, useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { apiError, syncQueuedStudentPhotos } from '@/lib/api';
import { discardStudentPhoto, queueStudentPhoto, readStudentPhoto, type PendingStudentPhoto } from '@/lib/pending-student-photos';
import { useAuthStore } from '@/store/auth';
import { Avatar, Spinner } from '@/components/ui';
import { IconCamera } from '@/components/ui/Icons';

/**
 * A student's picture, optionally editable.
 *
 * A student has no account of their own, so the photo belongs to the record
 * rather than to a login. Guardians set it from the parent portal — the common
 * case, and the reason this exists — and staff can set it from the student
 * file; `PATCH /students/:id/photo` scopes a parent to their own children.
 */
export function StudentPhoto({
  studentId,
  fullName,
  photoUrl,
  size = 48,
  editable,
  onChanged,
}: {
  studentId: string;
  fullName: string;
  photoUrl?: string | null;
  size?: number;
  /** Shows the camera badge. Off in lists, where the picture is just a picture. */
  editable?: boolean;
  onChanged?: (photoUrl: string | null) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);
  const account = useAuthStore(state => state.user?.id);
  const [draft, setDraft] = useState<PendingStudentPhoto>();
  const [preview, setPreview] = useState<string>();
  useEffect(() => {
    let active = true, generation = 0;
    let objectUrl: string | undefined;
    const refresh = async () => {
      const version = ++generation;
      const pending = account ? await readStudentPhoto(account, studentId) : undefined;
      if (!active || version !== generation) return;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      objectUrl = pending?.blob ? URL.createObjectURL(pending.blob) : undefined;
      setDraft(pending); setPreview(objectUrl);
    };
    const changed = () => { void refresh().catch(() => undefined); };
    changed(); window.addEventListener('halaqat:changed', changed);
    return () => { active = false; if (objectUrl) URL.revokeObjectURL(objectUrl); window.removeEventListener('halaqat:changed', changed); };
  }, [account, studentId]);

  const synchronize = async () => {
    await syncQueuedStudentPhotos();
    if (account && useAuthStore.getState().user?.id === account && !(await readStudentPhoto(account, studentId))) {
      await queryClient.invalidateQueries({ queryKey: ['parents'] });
      await queryClient.invalidateQueries({ queryKey: ['students'] });
    }
  };

  const save = async (blob: Blob | null) => {
    setBusy(true);
    try {
      if (!account) throw new Error('يلزم تسجيل الدخول');
      await queueStudentPhoto(account, studentId, blob);
      toast(blob ? 'حُفظت صورة الطالب؛ بانتظار تأكيد الخادم' : 'حُفظ طلب إزالة الصورة؛ بانتظار تأكيد الخادم');
      try {
        await synchronize();
        if (!(await readStudentPhoto(account, studentId)) && useAuthStore.getState().user?.id === account) {
          if (!blob) onChanged?.(null);
          toast.success('تمت مزامنة صورة الطالب');
        }
      } catch { toast('الصورة محفوظة؛ تعذرت المزامنة الآن'); }
    } catch (error) {
      toast.error(apiError(error, 'تعذر حفظ الصورة'));
    } finally {
      setBusy(false);
    }
  };

  const pick = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    // Reset first so choosing the same file twice still fires a change.
    e.target.value = '';
    if (!file) return;

    await save(file);
  };

  const displayedPhoto = draft ? (draft.blob ? preview : null) : photoUrl;
  if (!editable) return <Avatar name={fullName} src={displayedPhoto} size={size} preview />;

  return (
    <div className="relative shrink-0">
      <Avatar name={fullName} src={displayedPhoto} size={size} preview />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={busy || !!draft}
        className="absolute -bottom-1 -left-1 grid h-7 w-7 place-items-center rounded-full bg-primary-600 text-white shadow-md ring-2 ring-white transition hover:bg-primary-700 disabled:opacity-60"
        title={photoUrl ? 'تغيير صورة الطالب' : 'إضافة صورة للطالب'}
        aria-label={photoUrl ? 'تغيير صورة الطالب' : 'إضافة صورة للطالب'}
      >
        {busy ? <Spinner size={13} /> : <IconCamera size={14} />}
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif"
        onChange={pick}
        className="hidden"
      />
      {draft && <div className="mt-2 max-w-32 text-center text-[10px] text-amber-700" role="status">
        {draft.error ? 'تعذرت المزامنة؛ الصورة محفوظة' : 'بانتظار المزامنة'}
        <button type="button" disabled={busy} className="block w-full underline" onClick={async () => { setBusy(true); try { await synchronize(); } catch (error) { toast.error(apiError(error, 'تعذرت مزامنة الصورة')); } finally { setBusy(false); } }}>إعادة المحاولة</button>
        <button type="button" disabled={busy} className="block w-full underline" onClick={async () => { if (!account || !window.confirm('إلغاء الطلب المحفوظ على هذا الجهاز؟ قد تكون الصورة وصلت للخادم بالفعل.')) return; setBusy(true); try { await discardStudentPhoto(account, studentId, draft.id); } catch (error) { toast.error(apiError(error, 'تعذر إلغاء الطلب')); } finally { setBusy(false); } }}>إلغاء الطلب المحلي</button>
      </div>}
      {photoUrl && !busy && !draft && (
        <button
          type="button"
          onClick={() => save(null)}
          className="absolute -top-1 -left-1 grid h-5 w-5 place-items-center rounded-full bg-white text-[11px] font-bold text-slate-400 shadow ring-1 ring-slate-200 transition hover:text-red-600"
          title="إزالة الصورة"
          aria-label="إزالة صورة الطالب"
        >
          ×
        </button>
      )}
    </div>
  );
}
