import { useState, type FormEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { api, apiError } from '@/lib/api';
import { Button, Card, Input } from '@/components/ui';
import { IconCheck, IconEdit, IconUser } from '@/components/ui/Icons';
import { phoneError, PHONE_HINT } from '@/lib/validation';
import { useAuthStore } from '@/store/auth';

const fields = [
  ['fullName', 'الاسم الكامل', 'text', 150],
  ['birthDate', 'تاريخ الميلاد', 'date', 10],
  ['phone', 'جوال الطالب', 'tel', 20],
  ['address', 'العنوان', 'text', 250],
  ['guardianName', 'اسم ولي الأمر', 'text', 150],
  ['guardianPhone', 'جوال ولي الأمر', 'tel', 20],
  ['guardianRelation', 'صلة القرابة', 'text', 40],
] as const;

export default function StudentQuestionnaire({ profile }: { profile: any }) {
  const client = useQueryClient();
  const user = useAuthStore(state => state.user);
  const setUser = useAuthStore(state => state.setUser);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [initial, setInitial] = useState<Record<string, string>>({});
  const [error, setError] = useState('');
  const [dirty, setDirty] = useState(false);
  const requiredFields = ['fullName', 'birthDate', 'address', 'guardianName', 'guardianPhone', 'guardianRelation'];
  const completed = requiredFields.filter(field => profile[field]).length;
  const start = () => {
    const values = Object.fromEntries(fields.map(([key]) => [key, key === 'birthDate' ? String(profile[key] || '').slice(0, 10) : String(profile[key] || '')]));
    setDraft(values); setInitial(values);
    setError(''); setDirty(false); setEditing(true);
  };
  const save = useMutation({
    mutationFn: (payload: Record<string, string>) => api.patch('/students/me/questionnaire', payload),
    onSuccess: async ({ data }) => {
      client.setQueryData(['student', 'me'], (old: any) => ({ ...old, ...data }));
      if (user && data.fullName) setUser({ ...user, fullName: data.fullName, phone: data.phone });
      await client.invalidateQueries({ queryKey: ['students'] });
      toast.success(data.synced === 0 ? 'حُفظت البيانات على الجهاز وستصل للإدارة عند رجوع النت' : 'تم تحديث ملفك لدى الإدارة');
      setEditing(false); setDirty(false);
    },
    onError: failure => setError(apiError(failure)),
  });
  const change = (field: string, value: string) => { setDraft(current => ({ ...current, [field]: value })); setDirty(true); };
  const submit = (event: FormEvent) => {
    event.preventDefault(); setError('');
    const payload = Object.fromEntries(Object.entries(draft).map(([key, value]) => [key, value.trim()]));
    if (requiredFields.some(field => !payload[field])) { setError('أكمل الحقول المطلوبة قبل الحفظ'); return; }
    for (const field of ['phone', 'guardianPhone']) {
      const invalid = phoneError(payload[field]);
      if (invalid) { setError(invalid); return; }
    }
    if (payload.birthDate > new Date().toISOString().slice(0, 10)) { setError('تاريخ الميلاد لا يمكن أن يكون في المستقبل'); return; }
    // Background updates never turn untouched inputs into stale writes.
    const changed = Object.fromEntries(Object.entries(payload).filter(([key, value]) => value !== initial[key]));
    if (!Object.keys(changed).length) { setEditing(false); return; }
    save.mutate(changed);
  };
  return <Card className="mb-5" title={<span className="flex items-center gap-2"><IconUser /> استبيان بياناتي</span>} subtitle="تُحفظ إجاباتك في ملفك لدى الإدارة مباشرة، ويمكنك تحديثها من هنا." action={!editing && <Button variant="secondary" onClick={start}><IconEdit size={17} />{completed === requiredFields.length ? 'تعديل بياناتي' : 'إكمال بياناتي'}</Button>}>
    {!editing ? <><div className="mb-4 flex flex-wrap items-center justify-between gap-3 text-sm">
      <span className="text-slate-500">تم استكمال {completed} من {requiredFields.length} حقول أساسية</span>
      <span className="inline-flex items-center gap-1.5 text-primary-700"><IconCheck size={17} />{profile.synced === 0 ? 'محفوظة على الجهاز، بانتظار الإرسال' : 'مرتبطة بملف الطالب'}</span>
    </div><dl className="grid gap-3 sm:grid-cols-2">{fields.map(([key, label]) => <div key={key} className="rounded-xl border border-slate-100 px-3 py-2.5"><dt className="text-xs text-slate-500">{label}</dt><dd className="mt-1 break-words text-sm font-semibold text-slate-800">{key === 'birthDate' ? String(profile[key] || '').slice(0, 10) || 'غير مكتمل' : profile[key] || 'غير مكتمل'}</dd></div>)}</dl></> : <form onSubmit={submit} className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        {fields.map(([key, label, type, maxLength]) => <Input key={key} label={label} type={type} maxLength={maxLength} required={requiredFields.includes(key)} value={draft[key] || ''} onChange={event => change(key, event.target.value)} dir={type === 'tel' ? 'ltr' : undefined} hint={type === 'tel' ? PHONE_HINT : undefined} max={type === 'date' ? new Date().toISOString().slice(0, 10) : undefined} />)}
      </div>
      {error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      <div className="flex flex-wrap gap-2"><Button type="submit" loading={save.isPending} disabled={!dirty}>حفظ بياناتي</Button><Button variant="secondary" disabled={save.isPending} onClick={() => { if (!dirty || window.confirm('إلغاء التعديلات غير المحفوظة؟')) setEditing(false); }}>إلغاء</Button></div>
    </form>}
  </Card>;
}
