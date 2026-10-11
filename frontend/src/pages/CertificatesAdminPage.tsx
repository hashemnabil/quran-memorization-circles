import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { api, apiError } from '@/lib/api';
import { Button, Card, Input, LoadingState, PageHeader } from '@/components/ui';

const kinds: Record<string,string> = { JUZ_COMPLETION:'إنجاز جزء', QURAN_COMPLETION:'ختم المصحف', TAJWEED_COURSE:'نجاح في دورة أحكام', SHARIA_COURSE:'نجاح في دورة شريعة', COURSE_COMPLETION:'نجاح في دورة مخصصة', HONOR:'تكريم' };
const statuses: Record<string,string> = { PENDING:'قيد المراجعة', APPROVED:'مقبول - قيد التجهيز', REJECTED:'مرفوض', READY:'جاهز للتنزيل' };
export default function CertificatesAdminPage() {
  const qc=useQueryClient();
  const [name,setName]=useState('');
  const [kind,setKind]=useState('JUZ_COMPLETION');
  const [sourceType,setSourceType]=useState('BUILDER');
  const [fileUrl,setFileUrl]=useState('');
  const [design,setDesign]=useState('{"orientation":"landscape","fields":["studentName","date"]}');
  const [decisionNotes,setDecisionNotes]=useState<Record<string,string>>({});
  const [fileUrls,setFileUrls]=useState<Record<string,string>>({});
  const templates=useQuery({queryKey:['certificates','templates'],queryFn:async()=>(await api.get<any[]>('/certificates/templates')).data});
  const requests=useQuery({queryKey:['certificates','requests'],queryFn:async()=>(await api.get<any[]>('/certificates/requests')).data});
  const refresh=async()=>{await qc.invalidateQueries({queryKey:['certificates']});};
  const create=useMutation({mutationFn:()=>api.post('/certificates/templates',{name,kind,sourceType,fileUrl:fileUrl||undefined,design:JSON.parse(design)}),onSuccess:async()=>{toast.success('تم حفظ القالب');setName('');await refresh();},onError:e=>toast.error(apiError(e))});
  const deactivate=useMutation({mutationFn:(id:string)=>api.patch('/certificates/templates/'+id+'/deactivate'),onSuccess:refresh,onError:e=>toast.error(apiError(e))});
  const decide=useMutation({mutationFn:({id,status}:{id:string;status:string})=>api.patch('/certificates/requests/'+id+'/decision',{status,decisionNote:decisionNotes[id]||undefined,fileUrl:fileUrls[id]||undefined}),onSuccess:async()=>{toast.success('تم تحديث الطلب');await refresh();},onError:e=>toast.error(apiError(e))});
  return <div className="space-y-6" dir="rtl">
    <PageHeader title="الشهادات والتقارير" subtitle="إدارة قوالب الشهادات ومراجعة طلبات الطلاب." />
    <Card title="إضافة قالب">
      <form className="grid gap-4 md:grid-cols-2" onSubmit={e=>{e.preventDefault();try{JSON.parse(design);create.mutate();}catch{toast.error('صيغة إعدادات التصميم JSON غير صحيحة');}}}>
        <Input label="اسم القالب" value={name} onChange={e=>setName(e.target.value)} required />
        <label className="grid gap-1 text-sm font-medium">نوع الشهادة<select className="rounded-lg border border-slate-300 bg-white p-2.5" value={kind} onChange={e=>setKind(e.target.value)}>{Object.entries(kinds).map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></label>
        <label className="grid gap-1 text-sm font-medium">طريقة القالب<select className="rounded-lg border border-slate-300 bg-white p-2.5" value={sourceType} onChange={e=>setSourceType(e.target.value)}><option value="BUILDER">تصميم داخل الموقع (إعدادات أولية)</option><option value="UPLOAD">قالب مرفوع</option></select></label>
        <Input label="رابط ملف القالب (إن وجد)" value={fileUrl} onChange={e=>setFileUrl(e.target.value)} placeholder="https://..." />
        <label className="md:col-span-2 grid gap-1 text-sm font-medium">إعدادات التصميم (JSON)<textarea className="min-h-24 rounded-lg border border-slate-300 p-3 font-mono text-sm" value={design} onChange={e=>setDesign(e.target.value)} /></label>
        <div><Button type="submit" disabled={create.isPending}>{create.isPending?'جارٍ الحفظ...':'حفظ القالب'}</Button></div>
      </form>
    </Card>
    <Card title="القوالب النشطة">
      {templates.isLoading?<LoadingState/>:templates.data?.length?<div className="divide-y">{templates.data.map(t=><div key={t.id} className="flex flex-wrap items-center justify-between gap-3 py-3"><div><p className="font-semibold">{t.name}</p><p className="text-sm text-slate-500">{kinds[t.kind]||t.kind} · {t.sourceType==='UPLOAD'?'مرفوع':'مصمم'}</p></div><Button variant="secondary" onClick={()=>deactivate.mutate(t.id)}>إيقاف القالب</Button></div>)}</div>:<p className="text-sm text-slate-500">لا توجد قوالب.</p>}
    </Card>
    <Card title="طلبات الطلاب">
      {requests.isLoading?<LoadingState/>:requests.data?.length?<div className="space-y-4">{requests.data.map(r=><div key={r.id} className="rounded-xl border p-4"><div className="flex flex-wrap justify-between gap-2"><div><p className="font-semibold">{r.student?.fullName} — {r.kind==='CERTIFICATE'?(kinds[r.certificateKind]||'شهادة'):'تقرير شهري'}</p><p className="text-sm text-slate-500">الحالة: {statuses[r.status]||r.status} · {new Date(r.createdAt).toLocaleDateString('ar')}</p><p className="text-sm">{r.courseName||''} {r.periodFrom?new Date(r.periodFrom).toLocaleDateString('ar'):''} {r.periodTo?' — '+new Date(r.periodTo).toLocaleDateString('ar'):''}</p></div></div>{r.status!=='READY'&&r.status!=='REJECTED'&&<div className="mt-3 grid gap-3 md:grid-cols-2"><Input label="ملاحظة القرار" value={decisionNotes[r.id]||''} onChange={e=>setDecisionNotes(old=>({...old,[r.id]:e.target.value}))}/><Input label="رابط الملف النهائي عند النشر" value={fileUrls[r.id]||''} onChange={e=>setFileUrls(old=>({...old,[r.id]:e.target.value}))}/><div className="flex flex-wrap gap-2 md:col-span-2"><Button variant="secondary" onClick={()=>decide.mutate({id:r.id,status:'APPROVED'})}>موافقة</Button><Button variant="secondary" onClick={()=>decide.mutate({id:r.id,status:'REJECTED'})}>رفض</Button><Button onClick={()=>decide.mutate({id:r.id,status:'READY'})}>نشر الملف للطالب</Button></div></div>}</div>)}</div>:<p className="text-sm text-slate-500">لا توجد طلبات.</p>}
    </Card>
  </div>;
}
