import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { api, apiError } from '@/lib/api';
import { Button, Card, ErrorState, Input, LoadingState, PageHeader, Textarea } from '@/components/ui';
import { phoneError } from '@/lib/validation';
const labels: Record<string, string> = { fullName: 'الاسم الكامل', birthDate: 'تاريخ الميلاد', nationalId: 'رقم الهوية', fatherNationalId: 'رقم هوية ولي الأمر', address: 'العنوان', guardianName: 'اسم ولي الأمر', guardianPhone: 'جوال ولي الأمر', guardianRelation: 'صلة القرابة', phone: 'الجوال', email: 'البريد الإلكتروني', qualification: 'المؤهل العلمي', specialization: 'التخصص' };
const fieldLabel = (key: string, kind: string) => key === 'nationalId' ? kind === 'STUDENT' ? 'رقم هوية الطالب' : 'رقم هوية المحفظ' : labels[key];
const studentFields = ['fullName', 'birthDate', 'nationalId', 'fatherNationalId', 'address', 'guardianName', 'guardianPhone', 'guardianRelation'];
const teacherFields = ['fullName', 'birthDate', 'nationalId', 'address', 'phone', 'email', 'qualification', 'specialization'];
const statusLabels: Record<string, string> = { PENDING: 'بانتظار مراجعة الإدارة', APPROVED: 'تم اعتماد البيانات', REJECTED: 'مرفوض' };

export function ProfileVerification() {
  const client = useQueryClient();
  const query = useQuery({ queryKey: ['profile-reviews', 'me'], queryFn: async () => {
    const remote = (await api.get('/profile-reviews/me')).data;
    // A recently acknowledged review can be absent from an older server read.
    // Preserve locally confirmed pending requests until the server catches up.
    const { get, accountId } = await import('@/lib/offline-engine');
    const account = accountId();
    const local = (await get('profileReviews')).filter(row => row.requesterId === account && row.status === 'PENDING');
    const requests = [...(remote.requests || [])];
    for (const review of local) if (!requests.some((row: any) => row.id === review.id)) requests.unshift(review);
    return { ...remote, requests };
  } });
  const [draft, setDraft] = useState<Record<string, string> | null>(null);
  const save = useMutation({ mutationFn: (patch: Record<string, string>) => api.post('/profile-reviews', { patch }),
    onSuccess: async ({ data }) => { setDraft(null); await client.invalidateQueries({ queryKey: ['profile-reviews'] }); toast.success(data.synced === 0 ? 'حُفظ الطلب على الجهاز وسيُرسل عند الاتصال' : 'أُرسل الطلب لمراجعة الإدارة'); }, onError: error => toast.error(apiError(error)) });
  if (query.isLoading) return <LoadingState rows={3} />;
  if (query.isError || !query.data) return <ErrorState message="تعذر تحميل بيانات التحقق؛ اتصل مرة واحدة لتنزيل ملفك" onRetry={() => query.refetch()} />;
  const { profile, kind, requests = [] } = query.data;
  const fields = kind === 'STUDENT' ? studentFields : teacherFields;
  const pending = requests.find((request: any) => request.status === 'PENDING');
  const submit = (event: FormEvent) => {
    event.preventDefault();
    let patch = Object.fromEntries(Object.entries(draft || {}).filter(([key, value]) => value.trim() !== String(profile[key] || '')).map(([key, value]) => [key, value.trim()]));
    // First-time verification may confirm an already complete profile without edits.
    if (!Object.keys(patch).length) patch = Object.fromEntries(fields.map(key => [key, String(draft?.[key] || '').trim()]));
    for (const key of ['phone', 'guardianPhone']) if (patch[key] && phoneError(patch[key])) { toast.error(phoneError(patch[key])); return; }
    save.mutate(patch);
  };
  return <div className="space-y-5"><Card title="تحقق من بياناتي" action={!draft && !pending && <Button onClick={() => setDraft(Object.fromEntries(fields.map(key => [key, String(profile[key] || '')])))}>تعديل بياناتي</Button>}>
    <p className="mb-4 text-sm text-slate-500">تراجع الإدارة طلبك قبل اعتماده في ملفك.</p>
    {pending && <p role="status" className="mb-4 rounded-xl bg-amber-50 p-3 text-sm text-amber-900">{pending.synced === 0 ? 'الطلب محفوظ على الجهاز بانتظار الإرسال' : 'طلبك بانتظار مراجعة الإدارة'}</p>}
    {draft ? <form onSubmit={submit} className="space-y-4"><div className="grid gap-4 sm:grid-cols-2">{fields.map(key => <Input key={key} label={fieldLabel(key, kind)} value={draft[key] || ''} type={key === 'birthDate' ? 'date' : key === 'email' ? 'email' : ['phone', 'guardianPhone'].includes(key) ? 'tel' : 'text'} required={kind === 'STUDENT' || ['fullName', 'nationalId', 'phone', 'address'].includes(key)} maxLength={key === 'address' ? 250 : 150} max={key === 'birthDate' ? new Date().toISOString().slice(0, 10) : undefined} onChange={event => setDraft({ ...draft, [key]: event.target.value })} />)}</div>
      <div className="flex gap-2"><Button type="submit" loading={save.isPending}>إرسال للتحقق</Button><Button variant="secondary" disabled={save.isPending} onClick={() => setDraft(null)}>إلغاء</Button></div></form>
      : <dl className="grid gap-3 sm:grid-cols-2">{fields.map(key => <div key={key} className="rounded-xl border border-slate-100 p-3"><dt className="text-xs text-slate-500">{fieldLabel(key, kind)}</dt><dd className="mt-1 break-words text-sm font-semibold">{profile[key] || 'غير مكتمل'}</dd></div>)}</dl>}
  </Card><Card title="طلبات التحقق">{requests.length ? <div className="space-y-3">{requests.map((request: any) => <article key={request.id} className="rounded-xl border p-3 text-sm"><strong>{statusLabels[request.status] || request.status}</strong><span className="ms-2 text-slate-500">{new Date(request.createdAt).toLocaleDateString('ar')}</span>
    {request.reason && <p className="mt-2">{request.status === 'REJECTED' ? 'سبب الرفض: ' : 'ملاحظة: '}{request.reason}</p>}
    <dl className="mt-2 grid gap-2 sm:grid-cols-2">{Object.entries(request.patch || {}).map(([key, value]) => <div key={key}><dt className="text-xs text-slate-500">{fieldLabel(key, kind)}</dt><dd className="break-words">{String(value || '—')}</dd></div>)}</dl>
  </article>)}</div> : <p className="text-sm text-slate-500">لم تقدم طلب تحقق بعد.</p>}</Card></div>;
}
export default function ProfileVerificationPage() { return <><PageHeader title="تحقق من بياناتي" /><ProfileVerification /></>; }

export function ProfileReviewsPage({ kind }: { kind: 'STUDENT' | 'TEACHER' }) {
  const query = useQuery({ queryKey: ['profile-reviews', kind], queryFn: async () => {
    const data: any[] = []; let page = 1;
    for (;;) { const result = (await api.get('/profile-reviews', { params: { kind, page } })).data; data.push(...result.data); if (!result.meta?.hasNextPage) break; page++; }
    data.sort((a, b) => Number(b.status === 'PENDING') - Number(a.status === 'PENDING') || String(b.createdAt).localeCompare(String(a.createdAt)));
    return { data };
  } });
  const client = useQueryClient(); const [reasons, setReasons] = useState<Record<string, string>>({});
  const decide = useMutation({ mutationFn: ({ id, status }: { id: string; status: string }) => api.patch(`/profile-reviews/${id}/decision`, { status, reason: reasons[id] || undefined }), onSuccess: async ({ data }) => { await client.invalidateQueries({ queryKey: ['profile-reviews'] }); await client.invalidateQueries({ queryKey: ['students'] }); await client.invalidateQueries({ queryKey: ['teachers'] }); toast.success(data.synced === 0 ? 'حُفظ القرار وينتظر المزامنة؛ الملف لم يتغير بعد' : 'تم حفظ القرار'); }, onError: error => toast.error(apiError(error)) });
  return <><PageHeader title={kind === 'STUDENT' ? 'تحقق من بيانات الطالب' : 'تحقق من بيانات المحفظ'} />
    {query.isLoading ? <LoadingState rows={4} /> : query.isError ? <ErrorState message="تعذر تحميل الطلبات" onRetry={() => query.refetch()} /> : <div className="space-y-4">{query.data?.data?.length ? query.data.data.map((request: any) => <Card key={request.id} title={request.patch.fullName || request.base?.fullName || 'طلب تحقق'}>
      <p className="mb-3 text-sm font-semibold">{statusLabels[request.status]}{request.synced === 0 && ' — القرار بانتظار المزامنة'}</p>
      {request.syncError && <p role="alert" className="mb-3 text-sm text-red-700">{request.syncError}</p>}
      <div className="overflow-x-auto"><table className="w-full text-right text-sm"><thead><tr><th className="p-2">الحقل</th><th className="p-2">المعتمد عند تقديم الطلب</th><th className="p-2">البيانات المقترحة</th></tr></thead><tbody>{Object.entries(request.patch).map(([key, value]) => <tr key={key} className="border-t"><td className="p-2">{fieldLabel(key, kind)}</td><td className="p-2 break-words">{request.base?.[key] || '—'}</td><td className="p-2 break-words font-semibold">{String(value || '—')}</td></tr>)}</tbody></table></div>
      {request.status === 'PENDING' ? <div className="mt-4 space-y-3"><Textarea label="سبب الرفض / ملاحظة" maxLength={1000} value={reasons[request.id] || ''} onChange={event => setReasons({ ...reasons, [request.id]: event.target.value })} /><div className="flex gap-2"><Button loading={decide.isPending} disabled={request.synced === 0 && !request.syncError} onClick={() => decide.mutate({ id: request.id, status: 'APPROVED' })}>تأكيد واعتماد</Button><Button variant="secondary" disabled={decide.isPending || request.synced === 0 && !request.syncError || !reasons[request.id]?.trim()} onClick={() => decide.mutate({ id: request.id, status: 'REJECTED' })}>رفض الطلب</Button></div></div> : request.reason && <p className="mt-3 text-sm">{request.reason}</p>}
    </Card>) : <Card>لا توجد طلبات تحقق.</Card>}</div>}</>;
}
