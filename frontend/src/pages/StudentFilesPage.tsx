import PdfDownloadLink from '@/components/PdfDownloadLink';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { api, apiError } from '@/lib/api';
import { Button, Card, Input, LoadingState, PageHeader } from '@/components/ui';

type FileItem = { id: string; kind: string; certificateKind?: string | null; courseName?: string | null; periodFrom?: string | null; periodTo?: string | null; status: string; decisionNote?: string | null; fileUrl?: string | null; createdAt: string };
const kinds: Record<string,string> = { JUZ_COMPLETION:'إنجاز جزء', TAJWEED_COURSE:'نجاح في دورة أحكام', SHARIA_COURSE:'نجاح في دورة شريعة', COURSE_COMPLETION:'نجاح في دورة' };
const statusLabels: Record<string,string> = { PENDING:'قيد المراجعة', APPROVED:'مقبول - قيد التجهيز', REJECTED:'مرفوض', READY:'جاهز للتنزيل' };

export default function StudentFilesPage() {
  const qc = useQueryClient();
  const [requestType, setRequestType] = useState<'CERTIFICATE'|'MONTHLY_REPORT'>('CERTIFICATE');
  const [certificateKind, setCertificateKind] = useState('JUZ_COMPLETION');
  const [courseName, setCourseName] = useState('');
  const [periodFrom, setPeriodFrom] = useState('');
  const [periodTo, setPeriodTo] = useState('');
  const [requestNote, setRequestNote] = useState('');
  const requests = useQuery({ queryKey:['student-files','requests'], queryFn: async () => (await api.get<FileItem[]>('/certificates/requests/mine')).data });
  const certificates = useQuery({ queryKey:['student-files','certificates'], queryFn: async () => (await api.get<any[]>('/certificates/mine')).data });
  const create = useMutation({
    mutationFn: () => api.post('/certificates/requests', { kind: requestType, ...(requestType === 'CERTIFICATE' ? { certificateKind, courseName: courseName || undefined } : { periodFrom, periodTo }), requestNote }),
    onSuccess: async () => { toast.success('تم إرسال الطلب للإدارة'); setRequestNote(''); await qc.invalidateQueries({ queryKey:['student-files'] }); },
    onError: (e) => toast.error(apiError(e)),
  });
  return <div className="space-y-6" dir="rtl">
    <PageHeader title="ملفاتي" subtitle="شهاداتك وتقاريرك وطلباتك الخاصة." />
    <Card title="طلب شهادة أو تقرير">
      <form className="grid gap-4 md:grid-cols-2" onSubmit={(e) => { e.preventDefault(); if (requestType === 'MONTHLY_REPORT' && (!periodFrom || !periodTo || periodFrom > periodTo)) { toast.error('حدد فترة صحيحة للتقرير'); return; } create.mutate(); }}>
        <label className="grid gap-1 text-sm font-medium">نوع الطلب<select className="rounded-lg border border-slate-300 bg-white p-2.5" value={requestType} onChange={e => setRequestType(e.target.value as any)}><option value="CERTIFICATE">طلب شهادة</option><option value="MONTHLY_REPORT">طلب تقرير شهري</option></select></label>
        {requestType === 'CERTIFICATE' ? <>
          <label className="grid gap-1 text-sm font-medium">نوع الشهادة<select className="rounded-lg border border-slate-300 bg-white p-2.5" value={certificateKind} onChange={e => setCertificateKind(e.target.value)}>{Object.entries(kinds).map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></label>
          {['TAJWEED_COURSE','SHARIA_COURSE','COURSE_COMPLETION'].includes(certificateKind) && <Input label="اسم الدورة" value={courseName} onChange={e=>setCourseName(e.target.value)} required />}
        </> : <>
          <Input label="من تاريخ" type="date" value={periodFrom} onChange={e=>setPeriodFrom(e.target.value)} required />
          <Input label="إلى تاريخ" type="date" value={periodTo} onChange={e=>setPeriodTo(e.target.value)} required />
        </>}
        <div className="md:col-span-2"><Input label="ملاحظة (اختياري)" value={requestNote} onChange={e=>setRequestNote(e.target.value)} /></div>
        <div><Button type="submit" disabled={create.isPending}>{create.isPending ? 'جارٍ الإرسال...' : 'إرسال الطلب'}</Button></div>
      </form>
    </Card>
    <Card title="شهاداتي">
      {certificates.isLoading ? <LoadingState /> : certificates.data?.length ? <div className="divide-y">{certificates.data.map((c:any)=><div key={c.id} className="flex flex-wrap items-center justify-between gap-3 py-3"><div><p className="font-semibold">{c.title}</p><p className="text-sm text-slate-500">{new Date(c.issuedAt).toLocaleDateString('ar')}</p></div><PdfDownloadLink url={c.fileUrl} title={c.title}>تنزيل الشهادة</PdfDownloadLink></div>)}</div> : <p className="text-sm text-slate-500">لا توجد شهادات منشورة حتى الآن.</p>}
    </Card>
    <Card title="طلباتي">
      {requests.isLoading ? <LoadingState /> : requests.data?.length ? <div className="divide-y">{requests.data.map(r=><div key={r.id} className="flex flex-wrap items-start justify-between gap-3 py-3"><div><p className="font-semibold">{r.kind === 'CERTIFICATE' ? kinds[r.certificateKind || ''] || 'طلب شهادة' : 'تقرير شهري'}</p><p className="text-sm text-slate-500">{r.periodFrom ? new Date(r.periodFrom).toLocaleDateString('ar') : ''}{r.periodTo ? ' — '+new Date(r.periodTo).toLocaleDateString('ar') : ''}</p>{r.decisionNote && <p className="mt-1 text-sm">{r.decisionNote}</p>}</div><div className="text-sm"><span className="rounded-full bg-slate-100 px-3 py-1">{statusLabels[r.status] || r.status}</span>{r.status === 'READY' && r.fileUrl && <p className="mt-2"><PdfDownloadLink url={r.fileUrl}>تنزيل الملف</PdfDownloadLink></p>}</div></div>)}</div> : <p className="text-sm text-slate-500">ما عندك طلبات لحد الآن.</p>}
    </Card>
  </div>;
}
