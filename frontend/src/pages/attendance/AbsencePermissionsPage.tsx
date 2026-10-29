import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { api, apiError } from '@/lib/api';
import { useAuthStore } from '@/store/auth';
import { Button, Card, Input, PageHeader, Textarea, ErrorState, LoadingState } from '@/components/ui';
import { todayInput } from '@/lib/format';
import { absencePeriod } from '@/lib/absence-period';
import { notifyWriteSuccess } from '@/lib/write-feedback';

type Permission = { id: string; requesterId: string; date: string; endDate?: string; durationMinutes?: number; reason: string; note?: string; status: string; synced?: number; pendingDecision?: string; decisionNote?: string; requester?: { fullName: string }; student?: { fullName: string } };
export default function AbsencePermissionsPage() {
  const user = useAuthStore(state => state.user)!;
  const admin = user.role === 'ADMIN';
  const client = useQueryClient();
  const [date, setDate] = useState(todayInput());
  const [endDate, setEndDate] = useState(todayInput());
  const [reason, setReason] = useState('');
  const [note, setNote] = useState('');
  const [tab, setTab] = useState<'mine' | 'review'>('mine');
  let days = 0; try { days = absencePeriod(date, endDate); } catch { /* Validate before submission. */ }
  const query = useQuery<Permission[]>({ queryKey: ['attendance', 'absence-permissions'], queryFn: async () => (await api.get('/attendance/absence-permissions')).data });
  const refresh = () => client.invalidateQueries({ queryKey: ['attendance'] });
  const request = useMutation({ networkMode: 'always', mutationFn: () => api.post('/attendance/absence-permissions', { date, endDate, reason, note: note.trim() || undefined }), onSuccess: async result => { notifyWriteSuccess(result, 'أُرسل طلبك إلى الإدارة'); setReason(''); setNote(''); await refresh(); }, onError: error => toast.error(apiError(error)) });
  const decide = useMutation({ networkMode: 'always', mutationFn: ({ id, action }: { id: string; action: 'approve' | 'reject' }) => api.patch(`/attendance/absence-permissions/${id}/${action}`, {}), onSuccess: async result => { notifyWriteSuccess(result, 'تم حفظ قرار الإدارة'); await refresh(); }, onError: error => toast.error(apiError(error)) });
  const rows = (query.data || []).filter(row => tab === 'review' && admin || row.requesterId === user.id);
  return <div dir="rtl" className="absence-page space-y-5">
    <PageHeader title="إذن الغياب" subtitle="طلب شخصي مستقل عن الملف الدراسي. لا يُعتمد الغياب بعذر إلا بعد موافقة الإدارة." />
    <Card><div className="mb-5 flex items-center justify-between gap-3"><div><h2 className="text-lg font-extrabold">طلب إذن لنفسي</h2><p className="mt-1 text-sm text-slate-500">{user.fullName} · يُسجل الطلب باسم حسابك تلقائياً</p></div><span className="rounded-full bg-emerald-50 px-3 py-2 text-sm font-bold text-emerald-800">{days ? `${days} يوم` : 'فترة غير صالحة'}</span></div>
      <form className="grid gap-4 sm:grid-cols-2" onSubmit={event => { event.preventDefault(); if (days) request.mutate(); }}>
        <Input label="من تاريخ" type="date" min={todayInput()} required value={date} onChange={event => { setDate(event.target.value); if (event.target.value > endDate) setEndDate(event.target.value); }} />
        <Input label="إلى تاريخ" type="date" min={date} required value={endDate} onChange={event => setEndDate(event.target.value)} />
        <div className="sm:col-span-2"><Textarea label="سبب الغياب" required maxLength={500} rows={3} value={reason} onChange={event => setReason(event.target.value)} /></div>
        <div className="sm:col-span-2"><Textarea label="ملاحظة (اختياري)" maxLength={1000} rows={2} value={note} onChange={event => setNote(event.target.value)} /></div>
        <div className="sm:col-span-2 flex flex-wrap items-center gap-3"><Button type="submit" loading={request.isPending} disabled={!days || !reason.trim()}>إرسال طلب الإذن</Button><p className="text-xs text-slate-500">عند انقطاع الاتصال يُحفظ الطلب على جهازك ويُرسل لاحقاً.</p></div>
      </form>
    </Card>
    {admin && <div className="flex flex-wrap gap-2"><Button variant={tab === 'mine' ? 'primary' : 'secondary'} onClick={() => setTab('mine')}>طلباتي</Button><Button variant={tab === 'review' ? 'primary' : 'secondary'} onClick={() => setTab('review')}>مراجعة طلبات المدرسة</Button><Link className="ms-auto self-center text-sm font-bold text-primary-700 underline" to="/guardian-summons">استدعاءات أولياء الأمور</Link></div>}
    <Card><h2 className="mb-4 text-lg font-extrabold">{tab === 'review' ? 'طلبات المدرسة' : 'حالة طلباتي والأذونات السابقة'}</h2>
      {query.isLoading ? <LoadingState /> : query.isError ? <ErrorState message="تعذر تحميل طلبات الإذن" onRetry={() => query.refetch()} /> : <div className="space-y-3">{rows.map(item => <article key={item.id} className="rounded-2xl border border-slate-200 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3"><strong>{item.requester?.fullName || item.student?.fullName || user.fullName}</strong><span className={`rounded-full px-3 py-1 text-xs font-bold ${item.status === 'APPROVED' ? 'bg-emerald-50 text-emerald-800' : item.status === 'REJECTED' ? 'bg-red-50 text-red-700' : 'bg-amber-50 text-amber-800'}`}>{item.synced === 0 ? item.pendingDecision ? 'قرار بانتظار تأكيد الخادم' : 'محفوظ على الجهاز · بانتظار الإرسال' : item.status === 'PENDING' ? 'بانتظار موافقة الإدارة' : item.status === 'APPROVED' ? 'موافق عليه' : 'مرفوض'}</span></div>
        <p className="my-2 text-sm font-semibold text-slate-600">من {item.date.slice(0,10)} إلى {(item.endDate || item.date).slice(0,10)} · {item.durationMinutes || 1} يوم</p><p className="whitespace-pre-wrap text-sm">السبب: {item.reason}</p>{item.note && <p className="mt-2 whitespace-pre-wrap text-sm text-slate-500">ملاحظة: {item.note}</p>}{item.decisionNote && <p className="mt-2 text-sm">رد الإدارة: {item.decisionNote}</p>}
        {admin && tab === 'review' && item.status === 'PENDING' && <div className="mt-4 flex gap-2"><Button disabled={decide.isPending} onClick={() => decide.mutate({ id: item.id, action: 'approve' })}>موافقة</Button><Button variant="secondary" disabled={decide.isPending} onClick={() => decide.mutate({ id: item.id, action: 'reject' })}>رفض</Button></div>}
      </article>)}{!rows.length && <p className="py-6 text-center text-sm text-slate-500">لا توجد طلبات إذن سابقة.</p>}</div>}
    </Card>
  </div>;
}
