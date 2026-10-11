import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useAuthStore } from '@/store/auth';
import { Button, Card, PageHeader, Select, StatCard } from '@/components/ui';
import { IconClipboard } from '@/components/ui/Icons';

type ReportType = 'attendance'|'recitations'|'exams'|'student'|'circles';
type ReportData = { type: ReportType; rows?: Record<string, unknown>[]; student?: Record<string,unknown>; attendance?: Record<string,unknown>[]; recitations?: Record<string,unknown>[]; exams?: Record<string,unknown>[]; stats: Record<string,number> };
const reports: {id:ReportType;title:string;description:string}[] = [
 {id:'attendance',title:'الحضور والغياب',description:'متابعة الحضور والغياب بعذر أو دون عذر'},
 {id:'recitations',title:'التسميع اليومي',description:'مقدار التسميع والتقييم والأخطاء والنقاط'},
 {id:'exams',title:'الاختبارات والنتائج',description:'الاختبارات المجدولة والدرجات والنتائج'},
 {id:'student',title:'الملف الشامل للطالب',description:'بيانات الطالب وسجل الحضور والتسميع والاختبارات'},
 {id:'circles',title:'إحصائيات الحلقات والمعلمين',description:'أعداد الطلاب وسجلات النشاط والمعلمون المسندون'},
];
export default function ReportsPage() {
 const user=useAuthStore(s=>s.user);
 const [type,setType]=useState<ReportType>('attendance');
 const [from,setFrom]=useState('');
 const [to,setTo]=useState('');
 const [circleId,setCircleId]=useState('');
 const [teacherId,setTeacherId]=useState('');
 const [studentId,setStudentId]=useState('');
 const [refresh,setRefresh]=useState(0);
 const {data:circles=[]}=useQuery({queryKey:['reports','circles-options'],queryFn:async()=> (await api.get<any[]>('/circles/options')).data});
 const {data:students}=useQuery({queryKey:['reports','students'],queryFn:async()=> (await api.get<any>('/students',{params:{limit:100}})).data});
 const {data:teachers}=useQuery({queryKey:['reports','teachers'],queryFn:async()=> (await api.get<any>('/teachers',{params:{limit:100}})).data,enabled:user?.role==='ADMIN'||user?.role==='SUPERVISOR'});
 const params=useMemo(()=>({type,from:from||undefined,to:to||undefined,circleId:circleId||undefined,teacherId:teacherId||undefined,studentId:studentId||undefined,_refresh:refresh}),[type,from,to,circleId,teacherId,studentId,refresh]);
 const {data,isLoading,isError}=useQuery({queryKey:['reports',params],queryFn:async()=> (await api.get<ReportData>('/reports',{params})).data, enabled:type!=='student'||!!studentId});
 const statEntries=Object.entries(data?.stats??{});
 const rows=type==='student' ? (data?.attendance??[]).map(r=>({المجموعة:'الحضور',...r})).concat((data?.recitations??[]).map(r=>({المجموعة:'التسميع',...r})),(data?.exams??[]).map(r=>({المجموعة:'الاختبارات',...r}))) : (data?.rows??[]);
 const columns=rows.length?Object.keys(rows[0]):[];
 const exportReport=async()=>{try{const response=await api.get('/reports/export',{params:{...params,_refresh:undefined},responseType:'blob'});const url=URL.createObjectURL(response.data);const a=document.createElement('a');a.href=url;a.download=`report-${type}.xlsx`;a.click();URL.revokeObjectURL(url);}catch{ /* Axios interceptor/toast owns request errors. */ }};
 return <div dir="rtl" className="space-y-6">
  <PageHeader title="التقارير" description="تقارير موثوقة من قاعدة بيانات المدرسة مع تصدير Excel." />
  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">{reports.map(r=><button key={r.id} onClick={()=>setType(r.id)} className={`rounded-2xl border p-4 text-right transition hover:-translate-y-0.5 hover:shadow-md ${type===r.id?'border-primary-700 bg-primary-50 ring-1 ring-primary-700':'border-slate-200 bg-white'}`}><span className="mb-2 inline-flex rounded-xl bg-primary-100 p-2 text-primary-800"><IconClipboard size={20}/></span><div className="font-bold text-slate-900">{r.title}</div><p className="mt-1 text-sm text-slate-500">{r.description}</p></button>)}</div>
  <Card><div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
   {type!=='circles'&&<label className="text-sm font-semibold text-slate-700">من تاريخ<input type="date" value={from} onChange={e=>setFrom(e.target.value)} className="mt-1 w-full rounded-xl border border-slate-300 p-2.5"/></label>}
   {type!=='circles'&&<label className="text-sm font-semibold text-slate-700">إلى تاريخ<input type="date" value={to} onChange={e=>setTo(e.target.value)} className="mt-1 w-full rounded-xl border border-slate-300 p-2.5"/></label>}
   {type!=='student'&&type!=='circles'&&<label className="text-sm font-semibold text-slate-700">الحلقة<Select value={circleId} onChange={e=>setCircleId(e.target.value)}><option value="">كل الحلقات المتاحة</option>{circles.map((c:any)=><option key={c.id} value={c.id}>{c.name}</option>)}</Select></label>}
   {type==='recitations'&&<label className="text-sm font-semibold text-slate-700">المعلم<Select value={teacherId} onChange={e=>setTeacherId(e.target.value)}><option value="">كل المعلمين</option>{((teachers?.data??teachers??[]) as any[]).map((t:any)=><option key={t.id} value={t.id}>{t.user?.fullName??t.fullName}</option>)}</Select></label>}
   {type==='student'&&<label className="text-sm font-semibold text-slate-700">الطالب<Select value={studentId} onChange={e=>setStudentId(e.target.value)}><option value="">اختر الطالب</option>{((students?.data??[]) as any[]).map((s:any)=><option key={s.id} value={s.id}>{s.fullName}</option>)}</Select></label>}
   <div className="flex items-end gap-2"><Button onClick={()=>setRefresh(v=>v+1)}>تحديث التقرير</Button><Button variant="secondary" onClick={exportReport} disabled={type==='student'&&!studentId}>تصدير Excel</Button></div>
  </div></Card>
  <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{statEntries.map(([key,value])=><StatCard key={key} label={key} value={value}/>)}</div>
  <Card><div className="mb-4 flex items-center justify-between gap-3"><h2 className="font-bold text-slate-900">{reports.find(r=>r.id===type)?.title}</h2><span className="text-sm text-slate-500">{rows.length} سجل</span></div>
   {isLoading?<p className="p-8 text-center text-slate-500">جارٍ تحميل التقرير…</p>:isError?<p className="p-8 text-center text-red-600">تعذّر تحميل التقرير. تحقق من الصلاحيات والاتصال بالخادم.</p>:type==='student'&&!studentId?<p className="p-8 text-center text-slate-500">اختر طالبًا لعرض ملفه الشامل.</p>:!rows.length?<p className="p-8 text-center text-slate-500">لا توجد نتائج للفلاتر المحددة.</p>:<div className="overflow-x-auto"><table className="min-w-full text-sm"><thead><tr className="bg-slate-50 text-right">{columns.map(c=><th key={c} className="whitespace-nowrap px-4 py-3 font-bold text-slate-600">{c}</th>)}</tr></thead><tbody>{rows.map((row,i)=><tr key={i} className="border-t border-slate-100">{columns.map(c=><td key={c} className="whitespace-nowrap px-4 py-3 text-slate-700">{String(row[c]??'—')}</td>)}</tr>)}</tbody></table></div>}
  </Card>
 </div>;
}
