import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { api, apiError } from '@/lib/api';
import { Button, Card, Input, LoadingState, PageHeader } from '@/components/ui';

type Activity = { id: string; type: string; title: string; description: string; activityDate: string; workUrl?: string | null; createdAt: string; createdBy?: { fullName: string } };
const types: Record<string, string> = {
  REPORT_FILLING: 'تعبئة تقارير',
  PHOTOGRAPHY: 'تصوير',
  PUBLISHING: 'نشر',
  EDITING: 'مونتاج',
  DESIGN: 'تصميم',
};

export default function MediaActivitiesPage() {
  const qc = useQueryClient();
  const [type, setType] = useState('PHOTOGRAPHY');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [activityDate, setActivityDate] = useState(new Date().toISOString().slice(0, 10));
  const [workUrl, setWorkUrl] = useState('');
  const activities = useQuery({ queryKey: ['media-activities'], queryFn: async () => (await api.get<Activity[]>('/media-activities')).data });
  const create = useMutation({
    mutationFn: async () => (await api.post('/media-activities', { type, title, description, activityDate, workUrl: workUrl.trim() || undefined })).data,
    onSuccess: async () => { toast.success('تم حفظ النشاط الإعلامي'); setTitle(''); setDescription(''); setWorkUrl(''); await qc.invalidateQueries({ queryKey: ['media-activities'] }); },
    onError: e => toast.error(apiError(e)),
  });
  const remove = useMutation({
    mutationFn: (id: string) => api.delete('/media-activities/' + id),
    onSuccess: async () => { toast.success('تم حذف السجل'); await qc.invalidateQueries({ queryKey: ['media-activities'] }); },
    onError: e => toast.error(apiError(e)),
  });

  return <div className="space-y-6" dir="rtl">
    <PageHeader title="سجل الإعلام" subtitle="سجّل الأعمال الإعلامية مع وصف واضح وتاريخ التنفيذ ورابط العمل المنشور إن وجد." />
    <Card title="إضافة نشاط إعلامي">
      <form className="grid gap-4 md:grid-cols-2" onSubmit={e => { e.preventDefault(); create.mutate(); }}>
        <label className="grid gap-1 text-sm font-medium">نوع العمل
          <select className="rounded-lg border border-slate-300 bg-white p-2.5" value={type} onChange={e => setType(e.target.value)}>
            {Object.entries(types).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label>
        <Input label="عنوان العمل" value={title} onChange={e => setTitle(e.target.value)} required placeholder="مثال: تصوير حفل تكريم الطلاب" />
        <Input label="تاريخ التنفيذ" type="date" value={activityDate} onChange={e => setActivityDate(e.target.value)} required />
        <Input label="رابط العمل (اختياري)" value={workUrl} onChange={e => setWorkUrl(e.target.value)} placeholder="رابط المنشور أو الملف" />
        <label className="grid gap-1 text-sm font-medium md:col-span-2">شو تم تصويره أو تصميمه أو نشره أو مونتاجه؟
          <textarea className="min-h-28 rounded-lg border border-slate-300 p-3" value={description} onChange={e => setDescription(e.target.value)} required placeholder="اكتب تفاصيل العمل، المكان أو المناسبة، والمخرجات..." />
        </label>
        <div><Button type="submit" disabled={create.isPending || !title.trim() || !description.trim()}>{create.isPending ? 'جارٍ الحفظ...' : 'حفظ النشاط'}</Button></div>
      </form>
    </Card>
    <Card title="سجل الأعمال">
      {activities.isLoading ? <LoadingState /> : activities.isError ? <p className="text-sm text-red-600">تعذر تحميل سجل الإعلام.</p> : activities.data?.length ? <div className="space-y-3">
        {activities.data.map(a => <article key={a.id} className="rounded-xl border border-slate-200 p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="mb-2 flex flex-wrap items-center gap-2"><span className="rounded-full bg-primary-50 px-3 py-1 text-xs font-semibold text-primary-800">{types[a.type] || a.type}</span><span className="text-xs text-slate-500">{new Date(a.activityDate).toLocaleDateString('ar')}</span></div>
              <h3 className="font-bold text-slate-900">{a.title}</h3>
              <p className="mt-2 whitespace-pre-wrap text-sm leading-7 text-slate-600">{a.description}</p>
              <p className="mt-2 text-xs text-slate-400">أضافه: {a.createdBy?.fullName || '—'}</p>
              {a.workUrl && <a className="mt-2 inline-block text-sm text-primary-700 underline" href={a.workUrl} target="_blank" rel="noreferrer">فتح رابط العمل</a>}
            </div>
            <Button variant="secondary" onClick={() => { if (window.confirm('هل تريد حذف هذا السجل؟')) remove.mutate(a.id); }} disabled={remove.isPending}>حذف</Button>
          </div>
        </article>)}
      </div> : <p className="text-sm text-slate-500">لا توجد أعمال مسجلة حتى الآن.</p>}
    </Card>
  </div>;
}
