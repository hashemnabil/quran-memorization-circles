import { ChangeEvent, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { api, apiError } from '@/lib/api';
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

  const save = async (url: string | null) => {
    setBusy(true);
    try {
      await api.patch(`/students/${studentId}/photo`, { photoUrl: url ?? '' });
      toast.success(url ? 'تم تحديث صورة الطالب' : 'تمت إزالة الصورة');
      onChanged?.(url);
      // Every list that carries the student shows the picture too.
      queryClient.invalidateQueries({ queryKey: ['parents'] });
      queryClient.invalidateQueries({ queryKey: ['students'] });
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

    setBusy(true);
    try {
      const body = new FormData();
      body.append('file', file);
      const { data } = await api.post('/uploads/avatar', body, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      await save(data.url);
    } catch (error) {
      toast.error(apiError(error, 'تعذر رفع الصورة'));
      setBusy(false);
    }
  };

  if (!editable) return <Avatar name={fullName} src={photoUrl} size={size} preview />;

  return (
    <div className="relative shrink-0">
      <Avatar name={fullName} src={photoUrl} size={size} preview />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={busy}
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
      {photoUrl && !busy && (
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
