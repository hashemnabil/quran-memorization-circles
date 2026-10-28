import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { api, apiError } from '@/lib/api';
import { notifyWriteSuccess } from '@/lib/write-feedback';
import { Button, Card, Input, PageHeader, Select, Textarea, ErrorState, LoadingState } from '@/components/ui';
export default function GuardianSummonsPage() {
  const client = useQueryClient();
  const [studentId, setStudentId] = useState('');
  const [title, setTitle] = useState('استدعاء ولي أمر مع إنذار');
  const [body, setBody] = useState('');
  const students = useQuery<any[]>({ queryKey: ['summons', 'students'], queryFn: async () => { const rows: any[] = []; for (let page = 1; ; page++) { const result = (await api.get('/students', { params: { page, limit: 100 } })).data; rows.push(...result.data); if (!result.meta?.hasNextPage) return rows; } } });
  const records = useQuery<any[]>({ queryKey: ['attendance','summons'], queryFn: async () => (await api.get('/attendance/summons')).data });
  const save = useMutation({ networkMode: 'always', mutationFn: () => api.post('/attendance/summons', { studentId, title, body }), onSuccess: async result => { notifyWriteSuccess(result, 'تم إرسال الاستدعاء'); setBody(''); await client.invalidateQueries({ queryKey: ['attendance','summons'] }); }, onError: error => toast.error(apiError(error)) });
  return <div className="space-y-5"><PageHeader title="استدعاءات أولياء الأمور" subtitle="إجراء إداري منفصل عن طلبات إذن الغياب الشخصية" /><Card><form className="grid gap-4 sm:grid-cols-2" onSubmit={event => { event.preventDefault(); save.mutate(); }}><Select label="الطالب" required value={studentId} onChange={event => setStudentId(event.target.value)}><option value="">اختر الطالب</option>{(students.data || []).map(row => <option key={row.id} value={row.id}>{row.fullName} — {row.code}</option>)}</Select><Input label="عنوان الاستدعاء" maxLength={120} required value={title} onChange={event => setTitle(event.target.value)} /><div className="sm:col-span-2"><Textarea label="تفاصيل الإنذار" required maxLength={1000} value={body} onChange={event => setBody(event.target.value)} /></div><Button type="submit" loading={save.isPending} disabled={!studentId || !body.trim()}>إرسال الاستدعاء</Button></form></Card><Card title="سجل الاستدعاءات">{records.isLoading ? <LoadingState /> : records.isError ? <ErrorState message="تعذر تحميل الاستدعاءات" onRetry={() => records.refetch()} /> : records.data?.length ? records.data.map(row => <article key={row.id} className="mb-3 rounded-xl border p-4"><strong>{row.student?.fullName} · {row.title}</strong><p className="my-2 whitespace-pre-wrap text-sm">{row.body}</p><small>{new Date(row.createdAt).toLocaleString('ar')}</small></article>) : <p>لا توجد استدعاءات سابقة.</p>}</Card></div>;
}
