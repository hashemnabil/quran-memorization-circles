import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useAuthStore } from '@/store/auth';
import { Button, Card, PageHeader, Select, StatCard } from '@/components/ui';
import { IconClipboard } from '@/components/ui/Icons';

type ReportType = 'attendance'|'recitations'|'exams'|'student'|'circles'|'students'|'courses'|'courseStudents'|'courseAttendance';
type ReportData = { type: ReportType; rows?: Record<string, unknown>[]; student?: Record<string,unknown>; attendance?: Record<string,unknown>[]; recitations?: Record<string,unknown>[]; exams?: Record<string,unknown>[]; stats: Record<string,number> };
const formatReportValue = (value: unknown): string => {
 if (value === null || value === undefined || value === '') return '—';
 if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}(?:T.*)?$/.test(value)) {
  const [year, month, day] = value.slice(0, 10).split('-');
  return `${day}/${month}/${year}`;
 }
 return String(value);
};
const reports: {id:ReportType;title:string;description:string}[] = [
 {id:'attendance',title:'الحضور والغياب',description:'متابعة الحضور والغياب بعذر أو دون عذر'},
 {id:'recitations',title:'التسميع اليومي',description:'مقدار التسميع والتقييم والأخطاء والنقاط'},
 {id:'exams',title:'الاختبارات والنتائج',description:'الاختبارات المجدولة والدرجات والنتائج'},
 {id:'student',title:'الملف الشامل للطالب',description:'بيانات الطالب وسجل الحضور والتسميع والاختبارات'},
 {id:'circles',title:'إحصائيات الحلقات والمعلمين',description:'أعداد الطلاب وسجلات النشاط والمعلمون المسندون'},
 {id:'students',title:'سجل الطلاب',description:'كل الطلاب مع رقم الهوية وتاريخ الميلاد وتصدير Excel'},
 {id:'courses',title:'حلقات الدورات',description:'قائمة الدورات والمحاضرين وأعداد المسجلين والحضور'},
 {id:'courseStudents',title:'طلاب الدورات',description:'تصدير المسجلين في دورة محددة وبياناتهم الأساسية'},
 {id:'courseAttendance',title:'حضور وغياب الدورات',description:'سجل حضور وغياب الطلاب في دورة محددة حسب التاريخ'},
];
export default function ReportsPage() {
 const user=useAuthStore(s=>s.user);
 const [type,setType]=useState<ReportType>('attendance');
 const [from,setFrom]=useState('');
 const [to,setTo]=useState('');
 const [circleId,setCircleId]=useState('');
 const [courseId,setCourseId]=useState('');
 const [teacherId,setTeacherId]=useState('');
 const [studentId,setStudentId]=useState('');
 const [search,setSearch]=useState('');
 const [status,setStatus]=useState('');
 const [evaluation,setEvaluation]=useState('');
 const [refresh,setRefresh]=useState(0);
 const {data:circles=[]}=useQuery({queryKey:['reports','circles-options'],queryFn:async()=> (await api.get<any[]>('/circles/options')).data});
 const {data:courseResponse}=useQuery({queryKey:['reports','courses-options'],queryFn:async()=> (await api.get<any>('/courses',{params:{limit:500}})).data});
 const courses=(courseResponse?.data??courseResponse??[]) as any[];
 const {data:students}=useQuery({queryKey:['reports','students'],queryFn:async()=> (await api.get<any>('/students',{params:{limit:100}})).data});
 const {data:teachers}=useQuery({queryKey:['reports','teachers'],queryFn:async()=> (await api.get<any>('/teachers',{params:{limit:100}})).data,enabled:user?.role==='ADMIN'||user?.role==='SUPERVISOR'});
 const params=useMemo(()=>({type,from:from||undefined,to:to||undefined,circleId:circleId||undefined,courseId:courseId||undefined,teacherId:teacherId||undefined,studentId:studentId||undefined,search:search||undefined,status:status||undefined,evaluation:evaluation||undefined,_refresh:refresh}),[type,from,to,circleId,courseId,teacherId,studentId,search,status,evaluation,refresh]);
 const {data,isLoading,isError}=useQuery({queryKey:['reports',params],queryFn:async()=> (await api.get<ReportData>('/reports',{params})).data, enabled:type!=='student'||!!studentId});
 const statLabels: Record<string,string> = { total:'إجمالي السجلات', present:'الحضور', absent:'الغياب', excused:'الغياب بعذر', pages:'مجموع الصفحات', points:'مجموع النقاط', students:'عدد الطلاب', passed:'ناجح', failed:'راسب', average:'متوسط العلامات', circles:'عدد الحلقات', attendance:'سجلات الحضور', recitations:'سجلات التسميع', active:'منتظمون', suspended:'موقوفون', activity:'برنامج النشاط' };
 const statEntries=Object.entries(data?.stats??{}).map(([key,value])=>[statLabels[key]??key,value] as [string,number]);
 const rows: Record<string, unknown>[] = type==='student' ? (data?.attendance??[]).map(r=>({المجموعة:'الحضور',...r})).concat((data?.recitations??[]).map(r=>({المجموعة:'التسميع',...r})),(data?.exams??[]).map(r=>({المجموعة:'الاختبارات',...r}))) : (data?.rows??[]);
 const columns=rows.length?Object.keys(rows[0]):[];
 const exportReport=async()=>{
  let url: string | undefined;
  try {
   const response=await api.get('/reports/export',{params:{...params,_refresh:undefined},responseType:'blob',timeout:120000});
   if (!(response.data instanceof Blob) || response.data.size === 0) throw new Error('الملف المستلم فارغ أو غير صالح');
   url=URL.createObjectURL(response.data);
   const a=document.createElement('a');
   a.href=url;
   a.download=`${({attendance:'تقرير_الحضور_والغياب',recitations:'تقرير_التسميع_اليومي',exams:'تقرير_الاختبارات',student:'الملف_الشامل_للطالب',circles:'إحصائيات_الحلقات',students:'سجل_الطلاب',courses:'حلقات_الدورات',courseStudents:'طلاب_الدورات',courseAttendance:'حضور_وغياب_الدورات'} as Record<string,string>)[type]??'تقرير'}.xlsx`;
   a.style.display='none';
   document.body.appendChild(a);
   a.click();
   a.remove();
   window.setTimeout(()=>{if(url) URL.revokeObjectURL(url);},1000);
  } catch(error) {
   if(url) URL.revokeObjectURL(url);
   console.error('Excel export failed:',error);
   let message='تعذّر تصدير ملف Excel. حاول مرة أخرى.';
   const err=error as {response?:{status?:number;data?:unknown};code?:string;message?:string};
   if(err.code==='ECONNABORTED') {
    message='استغرق تجهيز ملف Excel وقتًا أطول من المتوقع. جرّب تقريرًا بفلاتر أضيق.';
   } else if(err.response?.data instanceof Blob) {
    try {
     const body=await err.response.data.text();
     const parsed=JSON.parse(body) as {message?:string|string[]};
     if(parsed.message) message=Array.isArray(parsed.message)?parsed.message.join('، '):parsed.message;
     else if(err.response.status===401) message='انتهت جلسة الدخول. سجّل الدخول مجددًا ثم حاول التصدير.';
     else if(err.response.status===403) message='ليس لديك صلاحية لتصدير هذا التقرير.';
     else message=`فشل التصدير (رمز الخطأ ${err.response.status??'غير معروف'}).`;
    } catch {
     message=`فشل التصدير من الخادم (رمز الخطأ ${err.response.status??'غير معروف'}).`;
    }
   } else if(!err.response) {
    message='تعذّر الاتصال بالخادم. تحقق من الاتصال وحاول مرة أخرى.';
   }
   window.alert(message);
  }
 };
 return <div dir="rtl" className="space-y-6">
  <PageHeader title="التقارير" subtitle="تقارير موثوقة من قاعدة بيانات المدرسة مع تصدير Excel." />
  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">{reports.map(r=><button key={r.id} onClick={()=>setType(r.id)} className={`rounded-2xl border p-4 text-right transition hover:-translate-y-0.5 hover:shadow-md ${type===r.id?'border-primary-700 bg-primary-50 ring-1 ring-primary-700':'border-slate-200 bg-white'}`}><span className="mb-2 inline-flex rounded-xl bg-primary-100 p-2 text-primary-800"><IconClipboard size={20}/></span><div className="font-bold text-slate-900">{r.title}</div><p className="mt-1 text-sm text-slate-500">{r.description}</p></button>)}</div>
  <Card><div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
   {!['circles','students','courses','courseStudents'].includes(type)&&<label className="text-sm font-semibold text-slate-700">من تاريخ<input type="date" value={from} onChange={e=>setFrom(e.target.value)} className="mt-1 w-full rounded-xl border border-slate-300 p-2.5"/></label>}
   {!['circles','students','courses','courseStudents'].includes(type)&&<label className="text-sm font-semibold text-slate-700">إلى تاريخ<input type="date" value={to} onChange={e=>setTo(e.target.value)} className="mt-1 w-full rounded-xl border border-slate-300 p-2.5"/></label>}
   {['attendance','recitations','exams','students'].includes(type)&&<label className="text-sm font-semibold text-slate-700">الحلقة<Select value={circleId} onChange={e=>setCircleId(e.target.value)}><option value="">كل الحلقات المتاحة</option>{circles.map((c:any)=><option key={c.id} value={c.id}>{c.name}</option>)}</Select></label>}
   {['courseStudents','courseAttendance'].includes(type)&&<label className="text-sm font-semibold text-slate-700">الدورة<Select value={courseId} onChange={e=>setCourseId(e.target.value)}><option value="">اختر الدورة</option>{courses.map((c:any)=><option key={c.id} value={c.id}>{c.name}</option>)}</Select></label>}
      {type==='students'&&<label className="text-sm font-semibold text-slate-700">بحث الطالب<input value={search} onChange={e=>setSearch(e.target.value)} placeholder="الاسم أو رقم الطالب أو الهوية" className="mt-1 w-full rounded-xl border border-slate-300 p-2.5"/></label>}
   {type==='students'&&<label className="text-sm font-semibold text-slate-700">الحالة<Select value={status} onChange={e=>setStatus(e.target.value)}><option value="">كل الحالات</option><option value="ACTIVE">منتظم</option><option value="SUSPENDED">موقوف</option><option value="ACTIVITY">محوّل لبرنامج النشاط</option><option value="GRADUATED">متخرج</option><option value="WITHDRAWN">منسحب</option></Select></label>}
   {type==='students'&&<label className="text-sm font-semibold text-slate-700">التقييم<Select value={evaluation} onChange={e=>setEvaluation(e.target.value)}><option value="">كل التقييمات</option><option value="EXCELLENT">ممتاز</option><option value="VERY_GOOD">جيد جداً</option><option value="GOOD">جيد</option><option value="ACCEPTABLE">مقبول</option><option value="UNSATISFACTORY">غير مرضٍ</option></Select></label>}
   {type==='recitations'&&<label className="text-sm font-semibold text-slate-700">المعلم<Select value={teacherId} onChange={e=>setTeacherId(e.target.value)}><option value="">كل المعلمين</option>{((teachers?.data??teachers??[]) as any[]).map((t:any)=><option key={t.id} value={t.id}>{t.user?.fullName??t.fullName}</option>)}</Select></label>}
   {type==='student'&&<label className="text-sm font-semibold text-slate-700">الطالب<Select value={studentId} onChange={e=>setStudentId(e.target.value)}><option value="">اختر الطالب</option>{((students?.data??[]) as any[]).map((s:any)=><option key={s.id} value={s.id}>{s.fullName}</option>)}</Select></label>}
   <div className="flex items-end gap-2"><Button onClick={()=>setRefresh(v=>v+1)}>تحديث التقرير</Button><Button variant="secondary" onClick={exportReport} disabled={(type==='student'&&!studentId)||(['courseStudents','courseAttendance'].includes(type)&&!courseId)}>تصدير Excel</Button></div>
  </div></Card>
  <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{statEntries.map(([key,value])=><StatCard key={key} label={key} value={value}/>)}</div>
  <Card><div className="mb-4 flex items-center justify-between gap-3"><h2 className="font-bold text-slate-900">{reports.find(r=>r.id===type)?.title}</h2><span className="text-sm text-slate-500">{rows.length} سجل</span></div>
   {isLoading?<p className="p-8 text-center text-slate-500">جارٍ تحميل التقرير…</p>:isError?<p className="p-8 text-center text-red-600">تعذّر تحميل التقرير. تحقق من الصلاحيات والاتصال بالخادم.</p>:type==='student'&&!studentId?<p className="p-8 text-center text-slate-500">اختر طالبًا لعرض ملفه الشامل.</p>:(['courseStudents','courseAttendance'].includes(type)&&!courseId)?<p className="p-8 text-center text-slate-500">اختر الدورة أولاً لعرض التقرير.</p>:!rows.length?<p className="p-8 text-center text-slate-500">لا توجد نتائج للفلاتر المحددة.</p>:<div className="overflow-x-auto"><table className="min-w-full text-sm"><thead><tr className="bg-slate-50 text-right">{columns.map(c=><th key={c} className="whitespace-nowrap px-4 py-3 font-bold text-slate-600">{c}</th>)}</tr></thead><tbody>{rows.map((row,i)=><tr key={i} className="border-t border-slate-100">{columns.map(c=><td key={c} className="whitespace-nowrap px-4 py-3 text-slate-700">{formatReportValue(row[c])}</td>)}</tr>)}</tbody></table></div>}
  </Card>
 </div>;
}
