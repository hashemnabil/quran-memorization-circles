import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { api, apiError } from '@/lib/api';
import { Button, Card, Input, LoadingState, PageHeader } from '@/components/ui';

const kinds: Record<string,string> = { JUZ_COMPLETION:'إنجاز جزء', QURAN_COMPLETION:'ختم المصحف', TAJWEED_COURSE:'نجاح في دورة أحكام', SHARIA_COURSE:'نجاح في دورة شريعة', COURSE_COMPLETION:'نجاح في دورة مخصصة', HONOR:'تكريم' };
const statuses: Record<string,string> = { PENDING:'قيد المراجعة', APPROVED:'مقبول - قيد التجهيز', REJECTED:'مرفوض', READY:'جاهز للتنزيل' };

function escapeCertificateText(value: unknown) {
  return String(value ?? '').replace(/[&<>"']/g, function (ch) {
    return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' } as Record<string, string>)[ch];
  });
}
function buildPrintableCertificate(studentName: string, title: string, kind: string, date: string) {
  const kindLabels: Record<string, string> = { JUZ_COMPLETION:'إنجاز جزء', QURAN_COMPLETION:'ختم المصحف', TAJWEED_COURSE:'نجاح في دورة أحكام', SHARIA_COURSE:'نجاح في دورة شريعة', COURSE_COMPLETION:'نجاح في دورة مخصصة', HONOR:'تكريم' };
  const html = '<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>' + escapeCertificateText(title) + '</title><style>' +
    '@page{size:A4 landscape;margin:10mm}*{box-sizing:border-box}body{margin:0;font-family:Tahoma,Arial,sans-serif;color:#183b32}.sheet{height:190mm;border:8px double #b28b42;padding:13mm;display:flex;align-items:center;justify-content:center;text-align:center}.inner{border:1px solid #d8bd7c;width:100%;height:100%;padding:12mm;display:flex;flex-direction:column;align-items:center;justify-content:space-around}.heading{font-size:38px;color:#9b762f;margin:0}.name{font-size:36px;font-weight:bold;border-bottom:2px solid #b28b42;padding:0 22px 8px;min-width:55%;margin:8px 0}.kind{font-size:22px;line-height:1.8}.signatures{display:flex;justify-content:space-between;width:85%;font-size:15px}.signatures span{border-top:1px solid #9b762f;padding-top:7px;min-width:150px}@media screen{body{padding:20px;background:#eee}.sheet{background:white;max-width:1100px;margin:auto}}@media print{body{padding:0}}' +
    '</style></head><body><main class="sheet"><section class="inner"><div>حلقات تحفيظ القرآن الكريم</div><h1 class="heading">شهادة تقدير وإنجاز</h1><div>تُمنح هذه الشهادة إلى</div><div class="name">' + escapeCertificateText(studentName) + '</div><div class="kind">وذلك تقديرًا لـ <strong>' + escapeCertificateText(kindLabels[kind] || kind) + '</strong><br>سائلين الله له دوام التوفيق والثبات على كتابه الكريم</div><div>تاريخ الإصدار: ' + escapeCertificateText(date) + '</div><div class="signatures"><span>إدارة الحلقات</span><span>الختم والتوقيع</span></div></section></main><script>window.addEventListener("load",function(){setTimeout(function(){window.print()},500)});</script></body></html>';
  return 'data:text/html;charset=utf-8,' + encodeURIComponent(html);
}

export default function CertificatesAdminPage() {
  const qc=useQueryClient();
  const [name,setName]=useState('');
  const [kind,setKind]=useState('JUZ_COMPLETION');
  const [sourceType,setSourceType]=useState('BUILDER');
  const [fileUrl,setFileUrl]=useState('');
  const [design,setDesign]=useState('{"orientation":"landscape","fields":["studentName","date"]}');
  const [decisionNotes,setDecisionNotes]=useState<Record<string,string>>({});
  const [fileUrls,setFileUrls]=useState<Record<string,string>>({});
  const [issueKind,setIssueKind]=useState('JUZ_COMPLETION');
  const [issueTitle,setIssueTitle]=useState('شهادة إنجاز');
  const [issueDate,setIssueDate]=useState(new Date().toISOString().slice(0,10));
  const [selectedStudentIds,setSelectedStudentIds]=useState<string[]>([]);
  const [selectedTemplateId,setSelectedTemplateId]=useState('');
  const templates=useQuery({queryKey:['certificates','templates'],queryFn:async()=>(await api.get<any[]>('/certificates/templates')).data});
  const requests=useQuery({queryKey:['certificates','requests'],queryFn:async()=>(await api.get<any[]>('/certificates/requests')).data});
  const students=useQuery({queryKey:['certificates','students'],queryFn:async()=>{const r=await api.get<any>('/students',{params:{page:1,limit:100}});return (r.data?.data ?? []) as Array<{id:string;fullName:string;code?:string}>;}});
  const refresh=async()=>{await qc.invalidateQueries({queryKey:['certificates']});};
  const create=useMutation({mutationFn:()=>api.post('/certificates/templates',{name,kind,sourceType,fileUrl:fileUrl||undefined,design:JSON.parse(design)}),onSuccess:async()=>{toast.success('تم حفظ القالب');setName('');await refresh();},onError:e=>toast.error(apiError(e))});
  const deactivate=useMutation({mutationFn:(id:string)=>api.patch('/certificates/templates/'+id+'/deactivate'),onSuccess:refresh,onError:e=>toast.error(apiError(e))});
  const decide=useMutation({mutationFn:({id,status}:{id:string;status:string})=>api.patch('/certificates/requests/'+id+'/decision',{status,decisionNote:decisionNotes[id]||undefined,fileUrl:fileUrls[id]||undefined}),onSuccess:async()=>{toast.success('تم تحديث الطلب');await refresh();},onError:e=>toast.error(apiError(e))});

  const issue=useMutation({mutationFn:async()=>{
    const chosen=(students.data ?? []).filter((s:any)=>selectedStudentIds.includes(s.id));
    if(!chosen.length) throw new Error('اختر طالبًا واحدًا على الأقل');
    const urls:Array<{url:string;name:string}>=[];
    for(const student of chosen){
      const url=buildPrintableCertificate(student.fullName,issueTitle,issueKind,issueDate);
      await api.post('/certificates/issue',{studentId:student.id,templateId:selectedTemplateId||undefined,kind:issueKind,title:issueTitle,details:{issueDate,studentName:student.fullName},fileUrl:url});
      urls.push({url,name:student.fullName});
    }
    return urls;
  },onSuccess:async(urls)=>{toast.success('تم إصدار '+urls.length+' شهادة. ستُفتح نافذة الطباعة الآن.');window.open(urls[0].url,'_blank');setSelectedStudentIds([]);await refresh();},onError:e=>toast.error(e instanceof Error?e.message:apiError(e))});

  return <div className="space-y-6" dir="rtl">
    <PageHeader title="الشهادات والتقارير" subtitle="إدارة قوالب الشهادات ومراجعة طلبات الطلاب." />

    <Card title="إصدار شهادة للطباعة">
      <p className="mb-4 text-sm text-slate-600">اختر نوع الشهادة والطلاب، ثم أصدرها. من نافذة الطباعة اختر «حفظ بتنسيق PDF» أو اطبع مباشرة.</p>
      <form className="grid gap-4 md:grid-cols-2" onSubmit={e=>{e.preventDefault();issue.mutate();}}>
        <label className="grid gap-1 text-sm font-medium">قالب محفوظ<select className="rounded-lg border border-slate-300 bg-white p-2.5" value={selectedTemplateId} onChange={e=>{setSelectedTemplateId(e.target.value);const t=templates.data?.find((x:any)=>x.id===e.target.value);if(t)setIssueKind(t.kind);}}><option value="">التصميم الافتراضي</option>{(templates.data??[]).map((t:any)=><option key={t.id} value={t.id}>{t.name}</option>)}</select></label>
        <label className="grid gap-1 text-sm font-medium">نوع الشهادة<select className="rounded-lg border border-slate-300 bg-white p-2.5" value={issueKind} onChange={e=>setIssueKind(e.target.value)}>{Object.entries(kinds).map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></label>
        <Input label="عنوان الشهادة" value={issueTitle} onChange={e=>setIssueTitle(e.target.value)} required />
        <Input label="تاريخ الإصدار" type="date" value={issueDate} onChange={e=>setIssueDate(e.target.value)} required />
        <div className="md:col-span-2 rounded-xl border p-3">
          <div className="mb-3 flex items-center justify-between gap-2"><p className="font-semibold">الطلاب المحددون: {selectedStudentIds.length}</p><button type="button" className="text-sm text-primary-700 underline" onClick={()=>setSelectedStudentIds(selectedStudentIds.length===(students.data??[]).length?[]:(students.data??[]).map((s:any)=>s.id))}>تحديد الكل / إلغاء التحديد</button></div>
          {students.isLoading?<LoadingState/>:students.isError?<p className="text-sm text-red-600">تعذر تحميل الطلاب.</p>:<div className="grid max-h-56 gap-2 overflow-y-auto sm:grid-cols-2">{(students.data??[]).map((s:any)=><label key={s.id} className="flex items-center gap-2 rounded-lg bg-slate-50 p-2 text-sm"><input type="checkbox" checked={selectedStudentIds.includes(s.id)} onChange={e=>setSelectedStudentIds(old=>e.target.checked?[...old,s.id]:old.filter(id=>id!==s.id))}/><span>{s.fullName}{s.code?' ('+s.code+')':''}</span></label>)}</div>}
        </div>
        <div><Button type="submit" disabled={issue.isPending||!selectedStudentIds.length||!issueTitle.trim()}>{issue.isPending?'جارٍ إصدار الشهادات...':'إصدار الشهادات وفتح الطباعة'}</Button></div>
      </form>
    </Card>

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
