import { notifyWriteSuccess } from '@/lib/write-feedback';
import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { api, apiError } from '@/lib/api';
import { useAuthStore } from '@/store/auth';
import { Button, Card, Input, PageHeader, Select } from '@/components/ui';
import { todayInput } from '@/lib/format';

type Student = { id: string; fullName: string; code?: string; circleId?: string | null };
type Permission = { id: string; studentId: string; date: string; reason: string; status: string; decisionNote?: string | null; student?: Student; requester?: { fullName: string } };

export default function AbsencePermissionsPage() {
  const user = useAuthStore(state => state.user)!;
  const admin = user.role === 'ADMIN';
  const ownStudent = user.role === 'STUDENT';
  const qc = useQueryClient();
  const [studentId, setStudentId] = useState('');
  const [date, setDate] = useState(todayInput());
  const [reason, setReason] = useState('');
  const [durationMinutes, setDurationMinutes] = useState(1);
  const [summonsTitle, setSummonsTitle] = useState('استدعاء ولي أمر مع إنذار');
  const [summonsBody, setSummonsBody] = useState('');

  const studentsQuery = useQuery({ queryKey: ['absence-permissions','students'], enabled: !ownStudent,
    queryFn: async () => { const all: Student[] = []; for (let page = 1; page <= 50; page++) { const result = (await api.get('/students', { params: { limit: 100, page } })).data; all.push(...(result.data || [])); if (!result.meta?.hasNextPage) break; } return { data: all }; } });
  const students: Student[] = useMemo(() => studentsQuery.data?.data || [], [studentsQuery.data]);
  const meQuery = useQuery({ queryKey: ['absence-permissions','me'], enabled: ownStudent, queryFn: async () => (await api.get('/students/me')).data });
  const own = meQuery.data?.student || meQuery.data;
  const permissionQuery = useQuery<Permission[]>({ queryKey: ['attendance','absence-permissions'], queryFn: async () => (await api.get('/attendance/absence-permissions')).data });
  const summonsQuery = useQuery<any[]>({ queryKey: ['attendance','summons'], enabled: admin, queryFn: async () => (await api.get('/attendance/summons')).data });
  const refresh = async () => { await qc.invalidateQueries({ queryKey: ['attendance','absence-permissions'] }); await qc.invalidateQueries({ queryKey: ['attendance','summons'] }); await qc.invalidateQueries({ queryKey: ['attendance'] }); };

  const request = useMutation({ networkMode: 'always', mutationFn: () => api.post('/attendance/absence-permissions', { studentId: own?.id, date, reason, durationMinutes }), onSuccess: async (_offlineWriteResult) => { notifyWriteSuccess(_offlineWriteResult, 'تم إرسال طلب الإذن للإدارة'); setReason(''); await refresh(); }, onError: error => toast.error(apiError(error)) });
  const decide = useMutation({ networkMode: 'always', mutationFn: ({ id, action }: { id: string; action: 'approve'|'reject' }) => api.patch(`/attendance/absence-permissions/${id}/${action}`, {}), onSuccess: refresh, onError: error => toast.error(apiError(error)) });
  const summon = useMutation({ networkMode: 'always', mutationFn: () => api.post('/attendance/summons', { studentId, title: summonsTitle, body: summonsBody }), onSuccess: async (_offlineWriteResult) => { notifyWriteSuccess(_offlineWriteResult, 'تم حفظ الاستدعاء وإرسال إشعار لولي الأمر'); setSummonsBody(''); await refresh(); }, onError: error => toast.error(apiError(error)) });

  return <div dir="rtl" className="space-y-5">
    <PageHeader title="طلبات إذن الغياب" subtitle="يُسجّل الغياب بعذر في كشف الحضور بعد موافقة الإدارة." />
    {ownStudent && <Card><form className="grid gap-4 md:grid-cols-2" onSubmit={event => { event.preventDefault(); request.mutate(); }}>
      <label className="text-sm font-semibold">مدة الإذن بالأيام<select className="input mt-1" value={durationMinutes} onChange={event => setDurationMinutes(Number(event.target.value))}>{[1,2,3,4,5,6,7].map(days => <option key={days} value={days}>{days} أيام</option>)}</select></label>
      {!ownStudent && <label className="text-sm font-semibold">الطالب<Select value={studentId} onChange={event => setStudentId(event.target.value)} required><option value="">اختر الطالب</option>{students.map(student => <option key={student.id} value={student.id}>{student.fullName} — {student.code}</option>)}</Select></label>}
      <label className="text-sm font-semibold">تاريخ الغياب<Input type="date" min={todayInput()} value={date} onChange={event => setDate(event.target.value)} required /></label>
      <label className="text-sm font-semibold md:col-span-2">سبب طلب الإذن<textarea className="mt-1 w-full rounded-xl border border-slate-300 p-3" rows={3} maxLength={500} value={reason} onChange={event => setReason(event.target.value)} required /></label>
      <div><Button type="submit" disabled={request.isPending || !reason.trim() || (!ownStudent && !studentId)}>{request.isPending ? 'جارٍ الإرسال…' : 'إرسال طلب الإذن'}</Button></div>
    </form></Card>}

    {admin && <Card><h2 className="mb-4 text-lg font-bold">استدعاء ولي أمر مع إنذار</h2><form className="grid gap-4 md:grid-cols-2" onSubmit={event => { event.preventDefault(); summon.mutate(); }}>
      <label className="text-sm font-semibold">الطالب<Select value={studentId} onChange={event => setStudentId(event.target.value)} required><option value="">اختر الطالب</option>{students.map(student => <option key={student.id} value={student.id}>{student.fullName} — {student.code}</option>)}</Select></label>
      <label className="text-sm font-semibold">عنوان الاستدعاء<Input value={summonsTitle} onChange={event => setSummonsTitle(event.target.value)} required maxLength={120} /></label>
      <label className="text-sm font-semibold md:col-span-2">تفاصيل الإنذار<textarea className="mt-1 w-full rounded-xl border border-slate-300 p-3" rows={3} value={summonsBody} onChange={event => setSummonsBody(event.target.value)} required maxLength={1000} /></label>
      <div><Button type="submit" disabled={summon.isPending || !studentId || !summonsBody.trim()}>{summon.isPending ? 'جارٍ الإرسال…' : 'إرسال الاستدعاء'}</Button></div>
    </form></Card>}

    <Card><h2 className="mb-3 text-lg font-bold">طلبات الإذن</h2><div className="space-y-3">{(permissionQuery.data || []).map(item => <article key={item.id} className="rounded-xl border border-slate-200 p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><strong>{item.student?.fullName || (ownStudent ? own?.fullName : item.studentId)}</strong><p className="text-sm text-slate-600">{String(item.date).slice(0,10)} · {item.reason}</p><p className="text-xs text-slate-500">مقدم الطلب: {item.requester?.fullName || '—'}</p></div><span className="rounded-full bg-slate-100 px-3 py-1 text-sm">{item.status === 'PENDING' ? 'بانتظار الإدارة' : item.status === 'APPROVED' ? 'موافق عليه' : 'مرفوض'}</span></div>{item.status === 'PENDING' && admin && <div className="mt-3 flex gap-2"><Button disabled={decide.isPending} onClick={() => decide.mutate({ id: item.id, action: 'approve' })}>موافقة وتسجيل بعذر</Button><Button variant="secondary" disabled={decide.isPending} onClick={() => decide.mutate({ id: item.id, action: 'reject' })}>رفض</Button></div>}{item.decisionNote && <p className="mt-2 text-sm">ملاحظة الإدارة: {item.decisionNote}</p>}</article>)}{permissionQuery.data?.length === 0 && <p className="text-sm text-slate-500">لا توجد طلبات إذن.</p>}</div></Card>

    {admin && <Card><h2 className="mb-3 text-lg font-bold">سجل الاستدعاءات</h2><div className="space-y-2">{(summonsQuery.data || []).map(row => <div key={row.id} className="rounded-lg bg-slate-50 p-3"><strong>{row.student?.fullName}</strong><p>{row.title}: {row.body}</p><small className="text-slate-500">{new Date(row.createdAt).toLocaleString('ar')}</small></div>)}{summonsQuery.data?.length === 0 && <p className="text-sm text-slate-500">لا يوجد استدعاءات محفوظة.</p>}</div></Card>}
  </div>;
}
