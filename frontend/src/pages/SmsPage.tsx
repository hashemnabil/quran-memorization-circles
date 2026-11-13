import { useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { api, apiError } from '@/lib/api';
import { Button, Card, PageHeader, Textarea } from '@/components/ui';

type Row = Record<string, string>;
type Message = { phone: string; title: string; text: string; error?: string; name?: string };
const labels: Record<string,string> = { CANCELLED:'ألغيت: تغيرت بيانات الدخول', QUEUED:'في الطابور', PROCESSING:'قيد المعالجة', ACCEPTED:'قبلها المزوّد (الوصول غير مؤكد)', FAILED:'فشلت', UNKNOWN:'النتيجة غير مؤكدة؛ راجع المزوّد' };
const phone = (s: string) => { let n = s.replace(/[٠-٩]/g,c=>String(c.charCodeAt(0)-1632)).replace(/[\s()+.-]/g,'').replace(/^00/,''); if (/^05[69]\d{7}$/.test(n)) n='970'+n.slice(1); if (/^5[69]\d{7}$/.test(n)) n='970'+n; return n; };
export function StudentCommunications({ initialKind = 'NOTICE' }: { initialKind?: string }) {
  const [students,setStudents] = useState<any[]>([]), [selected,setSelected] = useState<string[]>([]);
  const [recipientsError,setRecipientsError] = useState('');
  const [kind,setKind] = useState(initialKind), [channel,setChannel] = useState('APP'), [circle,setCircle] = useState(''), [all,setAll] = useState(false);
  const [reason,setReason] = useState(''), [reasons,setReasons] = useState<Row>({}), [date,setDate] = useState(''), [time,setTime] = useState('');
  const [preview,setPreview] = useState<Message[]>([]), [busy,setBusy] = useState(false);
  const request = useRef<{ body:string; key:string }>();
  useEffect(() => {
    let active = true;
    void api.get('/sms/recipients').then(response => {
      if (!Array.isArray(response.data) || response.data.some(student => !student || typeof student.id !== 'string' || typeof student.fullName !== 'string')) {
        throw new Error('Invalid SMS recipient response');
      }
      if (active) setStudents(response.data);
    }).catch(() => {
      if (active) setRecipientsError('تعذر تحميل مستلمي الرسائل. يلزم اتصال بالخادم وخدمة SMS متاحة؛ يمكنك استخدام نموذج الإشعارات المعتاد.');
    });
    return () => { active = false; };
  }, []);
  const data = {kind,channel,studentIds:selected,circleId:circle || undefined,all,reason,reasons,date,time};
  const reset = () => setPreview([]);
  const send = async () => {
    if (!window.confirm('تأكيد إرسال الرسائل المعروضة بالقناة المختارة؟')) return;
    const body=JSON.stringify({...data,preview}); if(request.current?.body!==body) request.current={body,key:crypto.randomUUID()};
    setBusy(true);
    try { await api.post('/sms/communications',{...data,preview,confirm:true,requestKey:request.current!.key}); toast.success('تم حفظ العملية؛ راجع سجل SMS لمتابعة المعالجة'); setPreview([]); }
    catch(e){toast.error(apiError(e));} finally{setBusy(false);}
  };
  return <Card title="إشعار أو إنذار أو استدعاء لأولياء الأمور"><div className="space-y-3" onChange={reset}>
    {recipientsError && <p role="alert" className="text-red-700">{recipientsError}</p>}
    <div className="grid gap-3 sm:grid-cols-2"><label>النوع<select className="block w-full rounded border p-2" value={kind} onChange={e=>setKind(e.target.value)}><option value="NOTICE">إشعار</option><option value="WARNING">إنذار</option><option value="SUMMONS">استدعاء</option><option value="CREDENTIALS">إصدار وإرسال بيانات دخول مؤقتة</option></select></label>
    <label>قناة الإرسال<select className="block w-full rounded border p-2" value={channel} onChange={e=>setChannel(e.target.value)}><option value="APP">داخل التطبيق فقط</option><option value="SMS">SMS فقط لولي الأمر</option><option value="BOTH">التطبيق وSMS</option></select></label></div>
    <label className="block"><input type="checkbox" checked={all} onChange={e=>{setAll(e.target.checked);setCircle('');setSelected([]);}}/> جميع الطلاب</label>
    {!all && <><label>حلقة مستلمي الرسائل<select className="block w-full rounded border p-2" value={circle} onChange={e=>{setCircle(e.target.value);setSelected([]);}}><option value="">اختيار طلاب محددين</option>{Array.from(new Map(students.filter(s=>s.circleId).map(s=>[s.circleId,s.circle?.name||s.circleId])).entries()).map(([id,name])=><option key={id} value={id}>{name}</option>)}</select></label>
    {!circle && <label className="block">اختر طالبًا أو عدة طلاب<select multiple className="block h-44 w-full rounded border p-2" value={selected} onChange={e=>setSelected(Array.from(e.target.selectedOptions,o=>o.value))}>{students.map(s=><option key={s.id} value={s.id}>{s.fullName}</option>)}</select></label>}</>}
    <Textarea label="محتوى الإشعار أو السبب الموحد" maxLength={1000} value={reason} onChange={e=>setReason(e.target.value)}/>
    {(all ? students : circle ? students.filter(s=>s.circleId===circle) : students.filter(s=>selected.includes(s.id))).map(s=><label className="block text-sm" key={s.id}>{s.fullName} — سبب خاص (اختياري)<input className="block w-full rounded border p-2" value={reasons[s.id]||''} maxLength={1000} onChange={e=>setReasons({...reasons,[s.id]:e.target.value})}/></label>)}
    {kind==='SUMMONS' && <div className="flex gap-3"><input aria-label="تاريخ الاستدعاء" type="date" value={date} onChange={e=>setDate(e.target.value)}/><input aria-label="وقت الاستدعاء" type="time" value={time} onChange={e=>setTime(e.target.value)}/></div>}
    <Button disabled={busy || !!recipientsError || !students.length} onClick={()=>{setBusy(true); void api.post('/sms/preview',data).then(r=>setPreview(r.data)).catch(e=>toast.error(apiError(e))).finally(()=>setBusy(false));}}>معاينة جميع الرسائل</Button>
    {!!preview.length && <><p>عدد المستلمين: {preview.length}</p><div className="max-h-96 space-y-2 overflow-auto">{preview.map((m,i)=><article className="rounded border p-3" key={i}><strong>{m.name} · {m.phone}</strong><p className="whitespace-pre-wrap">{m.text}</p><p role="alert" className="text-red-700">{m.error}</p></article>)}</div><Button disabled={busy||preview.some(m=>!!m.error)} onClick={()=>void send()}>تأكيد الإرسال</Button></>}
  </div></Card>;
}
export default function SmsPage() {
  const [rows,setRows] = useState<Row[]>([]), [columns,setColumns] = useState<string[]>([]), [phoneColumn,setPhoneColumn] = useState('');
  const [template,setTemplate] = useState('ولي الأمر المحترم، بخصوص الطالب {الاسم}: {الملاحظة}.'), [overrides,setOverrides] = useState<Record<number,string>>({});
  const [templates,setTemplates] = useState<Row>({}), [history,setHistory] = useState<any[]>([]), [campaign,setCampaign] = useState(''), [states,setStates] = useState<any[]>([]), [busy,setBusy] = useState(false);
  const request = useRef<{body:string;key:string}>();
  const load = () => api.get('/sms/campaigns').then(r=>setHistory(r.data));
  useEffect(()=>{void api.get('/sms/templates').then(r=>setTemplates(r.data)).catch(e=>toast.error(apiError(e))); void load().catch(e=>toast.error(apiError(e)));},[]);
  useEffect(()=>{ if(!campaign)return; const update=()=>void api.get('/sms/campaigns/'+campaign).then(r=>setStates(r.data)).catch(()=>undefined); update(); const timer=setInterval(update,4000); return()=>clearInterval(timer);},[campaign]);
  const seen=new Set<string>();
  const messages:Message[]=rows.map((row,i)=>{
    const missing:string[]=[];
    const text=overrides[i] ?? template.replace(/\{([^{}]+)\}/g,(_,name:string)=>{const v=row[name.trim()]; if(!v?.trim())missing.push(name); return v||'';});
    const n=phone(row[phoneColumn]||''); const duplicate=seen.has(n); seen.add(n);
    return {phone:n,text,title:'رسالة من المدرسة',error:!/^\d{8,15}$/.test(n)?'رقم غير صالح':duplicate?'رقم مكرر':missing.length?'حقول ناقصة: '+missing.join('، '):!text.trim()||text.length>1000?'نص غير صالح':''};
  });
  const upload=async(file?:File)=>{if(!file)return;setBusy(true);try{const form=new FormData();form.append('file',file); const r=await api.post('/sms/import',form,{headers:{'Content-Type':'multipart/form-data'}});setRows(r.data.rows);setColumns(r.data.columns);setPhoneColumn(r.data.columns.find((c:string)=>/هاتف|جوال|phone|mobile/i.test(c))||r.data.columns[0]);setOverrides({});}catch(e){toast.error(apiError(e));}finally{setBusy(false);}};
  const send=async()=>{if(!window.confirm(`تأكيد إرسال ${messages.length} رسالة SMS فعلية؟`))return;setBusy(true);const payload=messages.map(({error,...m})=>m);const body=JSON.stringify(payload);if(request.current?.body!==body)request.current={body,key:crypto.randomUUID()};try{const r=await api.post('/sms/send',{confirm:true,requestKey:request.current!.key,messages:payload});setCampaign(r.data.id);await load();toast.success('حُفظت الرسائل في طابور الإرسال');}catch(e){toast.error(apiError(e));}finally{setBusy(false);}};
  return <div dir="rtl" className="space-y-5"><PageHeader title="رسائل SMS" subtitle="الإرسال للإدارة فقط؛ قبول المزوّد لا يؤكد وصول الرسالة"/>
    <StudentCommunications/>
    <Card title="استيراد Excel أو CSV"><div className="space-y-3"><input aria-label="ملف المستلمين" type="file" accept=".xlsx,.xls,.csv" disabled={busy} onChange={e=>void upload(e.target.files?.[0])}/><p>حتى 5000 صف، 5 MB. لا تستورد كلمات المرور.</p>
    {!!columns.length && <label>عمود الهاتف<select className="block w-full rounded border p-2" value={phoneColumn} onChange={e=>setPhoneColumn(e.target.value)}>{columns.map(c=><option key={c}>{c}</option>)}</select></label>}
    <Textarea label="قالب الرسالة" value={template} onChange={e=>{setTemplate(e.target.value);setOverrides({});}}/><div className="flex flex-wrap gap-2">{columns.map(c=><button className="rounded border p-2" key={c} onClick={()=>{setTemplate(t=>t+' {'+c+'}');setOverrides({});}}>{'{'+c+'}'}</button>)}</div>
    <p>المستلمون: {rows.length} · الأخطاء: {messages.filter(m=>m.error).length} · التكلفة: غير متاحة من المزوّد</p>
    <div className="max-h-[32rem] space-y-3 overflow-auto">{messages.map((m,i)=><article className="space-y-2 rounded border p-3" key={i}><div className="grid gap-2 sm:grid-cols-2">{columns.map(c=><label key={c}>{c}<input className="block w-full rounded border p-2" value={rows[i][c]} onChange={e=>{setRows(r=>r.map((row,j)=>j===i?{...row,[c]:e.target.value}:row));setOverrides(o=>{const v={...o};delete v[i];return v;});}}/></label>)}</div><Textarea label={`رسالة ${i+1} — ${m.phone}`} value={m.text} onChange={e=>setOverrides({...overrides,[i]:e.target.value})}/><p role="alert" className="text-red-700">{m.error}</p></article>)}</div>
    <Button disabled={busy||!messages.length||messages.some(m=>!!m.error)} onClick={()=>void send()}>تأكيد وإضافة جميع الرسائل للطابور</Button></div></Card>
    <Card title="قوالب الإدارة"><div className="space-y-4">{Object.entries(templates).map(([kind,text])=><div key={kind}><Textarea label={kind==='NOTICE'?'الإشعار':kind==='WARNING'?'الإنذار':kind==='CREDENTIALS'?'بيانات الدخول المؤقتة':'الاستدعاء'} value={text} onChange={e=>setTemplates({...templates,[kind]:e.target.value})}/><Button onClick={()=>void api.patch('/sms/templates/'+kind,{text}).then(()=>toast.success('تم حفظ القالب')).catch(e=>toast.error(apiError(e)))}>حفظ القالب</Button></div>)}</div></Card>
    <Card title="سجل الرسائل"><div className="space-y-3"><Button onClick={()=>void load().catch(e=>toast.error(apiError(e)))}>تحديث السجل</Button><select aria-label="عملية الإرسال" className="block w-full rounded border p-2" value={campaign} onChange={e=>setCampaign(e.target.value)}><option value="">اختر عملية</option>{history.map(h=><option value={h.id} key={h.id}>{new Date(h.createdAt).toLocaleString('ar')} · {h._count.messages} SMS</option>)}</select>
    {campaign&&<Button onClick={()=>void api.post('/sms/campaigns/'+campaign+'/retry').then(r=>toast.success(`أعيدت جدولة ${r.data.count} رسالة فاشلة`)).catch(e=>toast.error(apiError(e)))}>إعادة الفاشلة فقط (حتى 3 محاولات)</Button>}
    <div className="max-h-96 space-y-2 overflow-auto">{states.map(s=><p className="rounded border p-2" key={s.id}>{s.phone} · {labels[s.status]||s.status} · محاولات: {s.attempts} {s.errorCode}</p>)}</div></div></Card>
  </div>;
}
