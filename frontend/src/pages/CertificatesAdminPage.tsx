import { useRef, useState } from 'react';
import { PDFDocument } from 'pdf-lib';
import JSZip from 'jszip';
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
async function buildPrintableCertificate(studentName: string, title: string, kind: string, date: string, templateUrl?: string) {
  const kindLabels: Record<string, string> = { JUZ_COMPLETION:'إنجاز جزء', QURAN_COMPLETION:'ختم المصحف', TAJWEED_COURSE:'نجاح في دورة أحكام', SHARIA_COURSE:'نجاح في دورة شريعة', COURSE_COMPLETION:'نجاح في دورة مخصصة', HONOR:'تكريم' };
  let pdf: PDFDocument;
  if (templateUrl?.startsWith('data:application/pdf;base64,')) {
    const raw = atob(templateUrl.split(',')[1]);
    const bytes = Uint8Array.from(raw, ch => ch.charCodeAt(0));
    pdf = await PDFDocument.load(bytes);
  } else {
    pdf = await PDFDocument.create();
    pdf.addPage([842, 595]);
  }
  const page = pdf.getPages()[0];
  if (!page) throw new Error('ملف القالب لا يحتوي على صفحات');
  const { width, height } = page.getSize();
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1200, Math.round(width * 2));
  canvas.height = Math.max(800, Math.round(height * 2));
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('تعذر تجهيز نص الشهادة');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.direction = 'rtl';
  ctx.textAlign = 'center';
  ctx.fillStyle = '#173d32';
  const center = canvas.width / 2;
  ctx.font = 'bold 34px Tahoma, Arial, sans-serif';
  ctx.fillText('شهادة تقدير وإنجاز', center, canvas.height * 0.35);
  ctx.font = '24px Tahoma, Arial, sans-serif';
  ctx.fillText('تُمنح هذه الشهادة إلى', center, canvas.height * 0.44);
  ctx.font = 'bold 38px Tahoma, Arial, sans-serif';
  ctx.fillText(studentName, center, canvas.height * 0.53, canvas.width * 0.78);
  ctx.font = '24px Tahoma, Arial, sans-serif';
  ctx.fillText('وذلك تقديرًا لـ ' + (kindLabels[kind] || kind), center, canvas.height * 0.63);
  ctx.font = '19px Tahoma, Arial, sans-serif';
  ctx.fillText(title, center, canvas.height * 0.70, canvas.width * 0.8);
  ctx.fillText('تاريخ الإصدار: ' + date, center, canvas.height * 0.78);
  const png = await pdf.embedPng(await new Promise<Uint8Array>((resolve, reject) => canvas.toBlob(async blob => {
    if (!blob) { reject(new Error('تعذر تجهيز صورة النص')); return; }
    resolve(new Uint8Array(await blob.arrayBuffer()));
  }, 'image/png')));
  page.drawImage(png, { x: 0, y: 0, width, height });
  const bytes = await pdf.save();
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  return 'data:application/pdf;base64,' + btoa(binary);
}

async function buildMonthlyReportPdf(student: any, from: string, to: string, templateUrl?: string) {
  let pdf: PDFDocument;
  if (templateUrl?.startsWith('data:application/pdf;base64,')) {
    const raw = atob(templateUrl.split(',')[1]);
    pdf = await PDFDocument.load(Uint8Array.from(raw, ch => ch.charCodeAt(0)));
  } else {
    pdf = await PDFDocument.create();
    pdf.addPage([842, 595]);
  }
  const page = pdf.getPages()[0];
  if (!page) throw new Error('ملف القالب لا يحتوي على صفحات');
  const { width, height } = page.getSize();
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1400, Math.round(width * 2));
  canvas.height = Math.max(950, Math.round(height * 2));
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('تعذر تجهيز التقرير');
  ctx.direction = 'rtl'; ctx.textAlign = 'center'; ctx.fillStyle = '#173d32';
  const x = canvas.width / 2;
  const lines: Array<[string, number, string]> = [
    ['التقرير الشهري لحلقات تحفيظ القرآن الكريم', 0.22, 'bold 32px Tahoma, Arial'],
    ['اسم الطالب: ' + student.fullName + '  |  الرقم: ' + student.code, 0.32, 'bold 25px Tahoma, Arial'],
    ['الحلقة: ' + student.circleName, 0.39, '23px Tahoma, Arial'],
    ['الفترة: ' + from + ' إلى ' + to, 0.46, '22px Tahoma, Arial'],
    ['الحضور: ' + student.attendance.present + ' | الغياب: ' + student.attendance.absent + ' | بعذر: ' + student.attendance.excused + ' | سجلات: ' + student.attendance.recorded, 0.55, '21px Tahoma, Arial'],
    ['جلسات التسميع: ' + student.recitations.sessions + ' | الصفحات: ' + Number(student.recitations.pages).toFixed(1), 0.63, '21px Tahoma, Arial'],
    ['النقاط: ' + Number(student.recitations.points).toFixed(1) + ' | الأخطاء: ' + student.recitations.mistakes + ' | التنبيهات: ' + student.recitations.warnings, 0.70, '21px Tahoma, Arial'],
    ['التقييم العام: ' + (student.evaluation || 'غير محدد'), 0.78, 'bold 22px Tahoma, Arial'],
    ['ملاحظات التقييم: ' + (student.evaluationNote || 'لا توجد'), 0.85, '19px Tahoma, Arial'],
  ];
  for (const [text, ratio, font] of lines) { ctx.font = font; ctx.fillText(text, x, canvas.height * ratio, canvas.width * 0.9); }
  const png = await pdf.embedPng(await new Promise<Uint8Array>((resolve, reject) => canvas.toBlob(async blob => {
    if (!blob) { reject(new Error('تعذر تجهيز التقرير')); return; }
    resolve(new Uint8Array(await blob.arrayBuffer()));
  }, 'image/png')));
  page.drawImage(png, { x: 0, y: 0, width, height });
  const bytes = await pdf.save();
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return 'data:application/pdf;base64,' + btoa(binary);
}

export default function CertificatesAdminPage() {
  const qc=useQueryClient();
  const printWindowRef = useRef<Window | null>(null);
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
  const [reportStudentIds,setReportStudentIds]=useState<string[]>([]);
  const [reportFrom,setReportFrom]=useState(new Date(new Date().getFullYear(),new Date().getMonth(),1).toISOString().slice(0,10));
  const [reportTo,setReportTo]=useState(new Date().toISOString().slice(0,10));
  const [selectedTemplateId,setSelectedTemplateId]=useState('');
  const reportData=useQuery({queryKey:['certificates','monthly-report-data',reportFrom,reportTo],queryFn:async()=>(await api.get<any[]>('/certificates/monthly-report-data',{params:{from:reportFrom,to:reportTo}})).data,enabled:Boolean(reportFrom&&reportTo&&reportFrom<=reportTo)});
  const issued=useQuery({queryKey:['certificates','issued'],queryFn:async()=>(await api.get<any[]>('/certificates/issued')).data});
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
    const template=(templates.data??[]).find((t:any)=>t.id===selectedTemplateId);
    for(const student of chosen){
      const url=await buildPrintableCertificate(student.fullName,issueTitle,issueKind,issueDate,template?.fileUrl||undefined);
      await api.post('/certificates/issue',{studentId:student.id,templateId:selectedTemplateId||undefined,kind:issueKind,title:issueTitle,details:{issueDate,studentName:student.fullName},fileUrl:url});
      urls.push({url,name:student.fullName});
    }
    return urls;
  },onSuccess:async(urls)=>{const printWindow=printWindowRef.current;printWindowRef.current=null;try{const zip=new JSZip();for(const item of urls){const raw=atob(item.url.split(',')[1]);const bytes=Uint8Array.from(raw,ch=>ch.charCodeAt(0));zip.file(item.name.replace(/[\\\\/:*?\"<>|]/g,'_')+'.pdf',bytes);}const blob=await zip.generateAsync({type:'blob'});const downloadUrl=URL.createObjectURL(blob);const a=document.createElement('a');a.href=downloadUrl;a.download='الشهادات-'+issueDate+'.zip';document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(downloadUrl),30000);if(printWindow&&!printWindow.closed)printWindow.close();toast.success('تم إصدار وتنزيل '+urls.length+' شهادة PDF.');}catch{if(printWindow&&!printWindow.closed)printWindow.close();toast.error('تم حفظ السجلات، لكن تعذر تجهيز ملف التنزيل الجماعي.');}setSelectedStudentIds([]);await refresh();},onError:e=>{if(printWindowRef.current&&!printWindowRef.current.closed)printWindowRef.current.close();printWindowRef.current=null;toast.error(e instanceof Error?e.message:apiError(e));}});

  return <div className="space-y-6" dir="rtl">
    <PageHeader title="الشهادات والتقارير" subtitle="إدارة قوالب الشهادات ومراجعة طلبات الطلاب." />

    <Card title="إصدار شهادة للطباعة">
      <p className="mb-4 text-sm text-slate-600">اختر نوع الشهادة والطلاب، ثم أصدرها. من نافذة الطباعة اختر «حفظ بتنسيق PDF» أو اطبع مباشرة.</p>
      <form className="grid gap-4 md:grid-cols-2" onSubmit={e=>{e.preventDefault();const printWindow=window.open('about:blank','_blank');if(!printWindow){toast.error('المتصفح منع نافذة الطباعة. اسمح بالنوافذ المنبثقة لهذا الموقع ثم أعد المحاولة.');return;}printWindowRef.current=printWindow;issue.mutate();}}>
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
        <label className="grid gap-1 text-sm font-medium">رفع قالب PDF من الجهاز<input type="file" accept="application/pdf,.pdf" className="rounded-lg border border-slate-300 bg-white p-2.5" onChange={e=>{const file=e.target.files?.[0];if(!file)return;if(file.type!=='application/pdf'){toast.error('اختر ملف PDF فقط');return;}if(file.size>5*1024*1024){toast.error('حجم القالب يجب ألا يتجاوز 5 ميغابايت');return;}const reader=new FileReader();reader.onload=()=>setFileUrl(String(reader.result||''));reader.readAsDataURL(file);}} />{fileUrl.startsWith('data:application/pdf;base64,')&&<a className="text-primary-700 underline" href={fileUrl} target="_blank" rel="noreferrer">معاينة قالب PDF المرفوع</a>}</label>
        <label className="md:col-span-2 grid gap-1 text-sm font-medium">إعدادات التصميم (JSON)<textarea className="min-h-24 rounded-lg border border-slate-300 p-3 font-mono text-sm" value={design} onChange={e=>setDesign(e.target.value)} /></label>
        <div><Button type="submit" disabled={create.isPending}>{create.isPending?'جارٍ الحفظ...':'حفظ القالب'}</Button></div>
      </form>
    </Card>
    <Card title="القوالب النشطة">
      {templates.isLoading?<LoadingState/>:templates.data?.length?<div className="divide-y">{templates.data.map(t=><div key={t.id} className="flex flex-wrap items-center justify-between gap-3 py-3"><div><p className="font-semibold">{t.name}</p><p className="text-sm text-slate-500">{kinds[t.kind]||t.kind} · {t.sourceType==='UPLOAD'?'مرفوع':'مصمم'}</p></div><Button variant="secondary" onClick={()=>deactivate.mutate(t.id)}>إيقاف القالب</Button></div>)}</div>:<p className="text-sm text-slate-500">لا توجد قوالب.</p>}
    </Card>

    <Card title="التقارير الشهرية التلقائية">
      <p className="mb-3 text-sm text-slate-600">تُجمع بيانات الحضور والتسميع والتقييم المسجلة في النظام للفترة المحددة، ويُنشأ PDF مستقل لكل طالب وينشر في حسابه، مع تنزيل جماعي ZIP.</p>
      <div className="grid gap-3 md:grid-cols-2">
        <Input label="من تاريخ" type="date" value={reportFrom} onChange={e=>setReportFrom(e.target.value)} required />
        <Input label="إلى تاريخ" type="date" value={reportTo} onChange={e=>setReportTo(e.target.value)} required />
      </div>
      {reportData.isLoading?<LoadingState/>:reportData.isError?<p className="mt-3 text-sm text-red-600">تعذر تحميل بيانات التقرير.</p>:<div className="mt-4">
        <div className="mb-3 flex items-center justify-between gap-2"><p className="font-semibold">الطلاب: {reportData.data?.length??0} · المحدد: {reportStudentIds.length}</p><button type="button" className="text-sm text-primary-700 underline" onClick={()=>setReportStudentIds(reportStudentIds.length===(reportData.data??[]).length?[]:(reportData.data??[]).map((s:any)=>s.id))}>تحديد الكل / إلغاء التحديد</button></div>
        <div className="grid max-h-56 gap-2 overflow-y-auto sm:grid-cols-2">{(reportData.data??[]).map((s:any)=><label key={s.id} className="flex items-center gap-2 rounded-lg bg-slate-50 p-2 text-sm"><input type="checkbox" checked={reportStudentIds.includes(s.id)} onChange={e=>setReportStudentIds(old=>e.target.checked?[...old,s.id]:old.filter(id=>id!==s.id))}/><span>{s.fullName} — {s.circleName}</span></label>)}</div>
        <Button className="mt-4" disabled={!reportStudentIds.length||!reportFrom||!reportTo||reportFrom>reportTo} onClick={async()=>{const chosen=(reportData.data??[]).filter((s:any)=>reportStudentIds.includes(s.id));const zip=new JSZip();let saved=0;try{for(const student of chosen){const fileUrl=await buildMonthlyReportPdf(student,reportFrom,reportTo);await api.post('/certificates/monthly-reports/issue',{studentId:student.id,from:reportFrom,to:reportTo,fileUrl,reportDraft:{studentCode:student.code,circleName:student.circleName,attendance:student.attendance,recitations:student.recitations,evaluation:student.evaluation,evaluationNote:student.evaluationNote}});const raw=atob(fileUrl.split(',')[1]);zip.file((student.fullName||student.code).replace(/[\\\\/:*?"<>|]/g,'_')+'.pdf',Uint8Array.from(raw,ch=>ch.charCodeAt(0)));saved++;}const blob=await zip.generateAsync({type:'blob'});const href=URL.createObjectURL(blob);const a=document.createElement('a');a.href=href;a.download='التقارير-'+reportFrom+'-'+reportTo+'.zip';document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(href),30000);toast.success('تم نشر '+saved+' تقرير وتنزيلها بملف ZIP');setReportStudentIds([]);await refresh();}catch(e){toast.error('تم نشر '+saved+' تقرير قبل حدوث خطأ. أعد المحاولة للطلاب المتبقين؛ لن تُحذف التقارير المنشورة.');await refresh();}}}>إنشاء التقارير ونشرها وتنزيل ZIP</Button>
      </div>}
    </Card>
    <Card title="الشهادات الصادرة">
      {issued.isLoading?<LoadingState/>:issued.isError?<p className="text-sm text-red-600">تعذر تحميل الشهادات الصادرة.</p>:issued.data?.length?<div className="divide-y">{issued.data.map((item:any)=><div key={item.id} className="flex flex-wrap items-center justify-between gap-3 py-3"><div><p className="font-semibold">{item.title} — {item.student?.fullName}</p><p className="text-sm text-slate-500">{item.student?.circle?.name||'بدون حلقة'} · {new Date(item.issuedAt).toLocaleDateString('ar')}</p></div><a className="text-primary-700 underline" href={item.fileUrl} download={item.title+'.pdf'}>تنزيل PDF</a></div>)}</div>:<p className="text-sm text-slate-500">لا توجد شهادات صادرة.</p>}
    </Card>
    <Card title="طلبات الطلاب">
      {requests.isLoading?<LoadingState/>:requests.data?.length?<div className="space-y-4">{requests.data.map(r=><div key={r.id} className="rounded-xl border p-4"><div className="flex flex-wrap justify-between gap-2"><div><p className="font-semibold">{r.student?.fullName} — {r.kind==='CERTIFICATE'?(kinds[r.certificateKind]||'شهادة'):'تقرير شهري'}</p><p className="text-sm text-slate-500">الحالة: {statuses[r.status]||r.status} · {new Date(r.createdAt).toLocaleDateString('ar')}</p><p className="text-sm">{r.courseName||''} {r.periodFrom?new Date(r.periodFrom).toLocaleDateString('ar'):''} {r.periodTo?' — '+new Date(r.periodTo).toLocaleDateString('ar'):''}</p></div></div>{r.status!=='READY'&&r.status!=='REJECTED'&&<div className="mt-3 grid gap-3 md:grid-cols-2"><Input label="ملاحظة القرار" value={decisionNotes[r.id]||''} onChange={e=>setDecisionNotes(old=>({...old,[r.id]:e.target.value}))}/><Input label="رابط الملف النهائي عند النشر" value={fileUrls[r.id]||''} onChange={e=>setFileUrls(old=>({...old,[r.id]:e.target.value}))}/><div className="flex flex-wrap gap-2 md:col-span-2"><Button variant="secondary" onClick={()=>decide.mutate({id:r.id,status:'APPROVED'})}>موافقة</Button><Button variant="secondary" onClick={()=>decide.mutate({id:r.id,status:'REJECTED'})}>رفض</Button><Button onClick={()=>decide.mutate({id:r.id,status:'READY'})}>نشر الملف للطالب</Button></div></div>}</div>)}</div>:<p className="text-sm text-slate-500">لا توجد طلبات.</p>}
    </Card>
  </div>;
}
