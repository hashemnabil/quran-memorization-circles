import {RankingFilters} from '@/components/RankingFilters';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Button, EmptyState, LoadingState } from '@/components/ui';
import { IconAward, IconUsers } from '@/components/ui/Icons';

export interface HonorStudent { id: string; fullName: string; points: number; rank: number; circleName: string; teacherName: string | null; sources?:{recitation:number;attendance:number;achievement:number} }
export interface HonorRollData { updatedAt: string; students: HonorStudent[] }
const number = new Intl.NumberFormat('ar', { maximumFractionDigits: 2 });

function Medal({ rank, large = false }: { rank: number; large?: boolean }) {
  const colors = rank === 1 ? ['#d5a739', '#fff0b8', '#8b6415'] : rank === 2 ? ['#94a3b8', '#f1f5f9', '#475569'] : rank === 3 ? ['#bb8051', '#fae4d1', '#7c4928'] : ['#8ba99a', '#edf5ef', '#285942'];
  return <svg role="img" aria-label={`ميدالية المركز ${number.format(rank)}`} viewBox="0 0 64 76" className={large ? 'h-20 w-16 shrink-0' : 'h-12 w-10 shrink-0'}>
    <path d="M14 4h13l10 25-12 6z" fill="#1d684f" /><path d="M37 4h13L39 35l-12-6z" fill="#3e8a70" />
    <circle cx="32" cy="46" r="26" fill={colors[0]} /><circle cx="32" cy="46" r="21" fill={colors[1]} stroke={colors[2]} strokeWidth=".8" />
    <path d="M18 52q-8-12 0-21M46 52q8-12 0-21" fill="none" stroke={colors[0]} strokeWidth="2" strokeLinecap="round" />
    <text x="32" y="53" textAnchor="middle" fontSize="21" fontWeight="800" fill={colors[2]}>{number.format(rank)}</text>
  </svg>;
}

export default function HonorRoll() {
  const [period,setPeriod]=useState('all');const [rankingCircle,setRankingCircle]=useState('');
  const [online, setOnline] = useState(() => navigator.onLine);
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    window.addEventListener('online', update); window.addEventListener('offline', update);
    return () => { window.removeEventListener('online', update); window.removeEventListener('offline', update); };
  }, []);
  const query = useQuery({
    queryKey: ['dashboard', 'honor-roll', period, rankingCircle],
    queryFn: async () => {
      const { data } = await api.get<HonorRollData>('/dashboard/honor-roll',{params:{period,circleId:rankingCircle||undefined}});
      if (!Array.isArray(data?.students)) throw new Error('تعذر تحميل لوحة الشرف');
      return data;
    },
    staleTime: 10_000, refetchInterval: online ? 30_000 : false, refetchOnWindowFocus: true, refetchOnReconnect: 'always',
  });
  const students = query.data?.students ?? [];
  return <section aria-labelledby="honor-roll-title" className="mb-6 overflow-hidden rounded-3xl border border-[#ddd5bf] bg-[#fffcf5] shadow-sm" dir="rtl">
    <header className="relative overflow-hidden bg-[#123f32] px-5 py-5 text-white sm:px-7">
      <div aria-hidden="true" className="pointer-events-none absolute -left-16 -top-32 h-64 w-64 rounded-full border-[24px] border-white/[.03]" />
      <div className="relative flex items-center gap-3"><span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl border border-[#d3ba73]/40 bg-[#d3ba73]/10 text-[#ead494]"><IconAward size={28} /></span><div className="min-w-0 flex-1"><p className="mb-1 text-[11px] font-bold tracking-wider text-[#dccb99]">نجوم المدرسة</p><h2 id="honor-roll-title" className="text-xl font-extrabold sm:text-2xl">لوحة الشرف</h2></div><span className="rounded-full border border-white/15 px-3 py-1.5 text-xs text-emerald-50">أفضل ١٠ طلاب</span></div>
      <p className="relative mt-3 text-sm leading-6 text-emerald-50/85">أعلى الطلاب نقاطًا من جميع الحلقات</p>
    </header>
    <div className="p-4 sm:p-6"><RankingFilters period={period} circleId={rankingCircle} onChange={(p,c)=>{setPeriod(p);setRankingCircle(c)}}/>
      {query.isLoading ? <LoadingState rows={3} /> : !query.data && query.isError ? <div role="status" className="space-y-3 py-4 text-center"><p className="text-sm text-slate-600">تعذر تحميل لوحة الشرف</p><Button variant="secondary" size="sm" onClick={() => void query.refetch()}>إعادة المحاولة</Button></div> : !students.length ? <EmptyState title="ننتظر نجوم لوحة الشرف" message="تظهر أسماء الطلاب عند حصولهم على النقاط." icon={<IconAward size={28} />} /> : <>
        <HonorRollRows students={students} />
      </>}
      <footer className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-[#e6e6db] pt-3 text-[11px] leading-5 text-slate-500"><span>{online ? 'يتغير الترتيب تلقائيًا حسب مجموع النقاط' : 'آخر ترتيب محفوظ · يتحدث عند الاتصال'}</span>{query.data?.updatedAt && <span>آخر تحديث: {new Intl.DateTimeFormat('ar', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Riyadh' }).format(new Date(query.data.updatedAt))}</span>}<span className="w-full">عند تساوي النقاط يتساوى المركز، وتُرتب الأسماء أبجديًا.</span>{query.isError && query.data && <span role="status" className="text-amber-700">تعذر تحديث الترتيب؛ المعروض آخر نسخة محفوظة.</span>}</footer>
      <div className="mt-2 flex justify-end"><Link to="/student-ranking" aria-label="عرض جميع الطلاب" title="عرض جميع الطلاب" className="inline-flex min-h-10 items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-semibold text-emerald-800 hover:bg-emerald-50"><IconUsers size={16} /><span>عرض الجميع</span></Link></div>
    </div>
  </section>;
}

export function HonorRollRows({ students, label = 'ترتيب لوحة الشرف' }: { students: readonly HonorStudent[]; label?: string }) {
  return <ol aria-label={label} className="space-y-2">
    {students.map(student => <li key={student.id} data-student-id={student.id} className={`flex items-center gap-3 rounded-2xl border px-3 py-3 sm:gap-4 sm:px-5 ${student.rank === 1 ? 'border-[#d3b76c] bg-[#fff7de]' : student.rank === 2 ? 'border-slate-300 bg-slate-50' : student.rank === 3 ? 'border-[#e3cbb6] bg-[#fffaf5]' : 'border-[#e6e6db] bg-white'}`}>
      <Medal rank={student.rank} /><div className="grid min-w-0 flex-1 grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] items-center gap-2 sm:gap-5"><div className="min-w-0"><h3 className="break-words text-xs font-extrabold text-[#173e32] sm:text-base">{student.fullName}</h3><p className="mt-1 text-[10px] leading-5 text-slate-500 sm:text-xs">{student.circleName}</p></div><p className="min-w-0 break-words text-[11px] leading-6 text-slate-600 sm:text-sm">الشيخ: {student.teacherName ?? 'لم يُحدد بعد'}</p><div className="shrink-0 text-center"><strong className="block text-sm font-extrabold tabular-nums text-[#17634b] sm:text-xl">{number.format(student.points)}</strong><span className="text-[10px] text-slate-500">نقطة</span>{student.sources&&<details className="mt-1 text-[10px]"><summary>تفاصيل النقاط</summary><p>تسميع {number.format(student.sources.recitation)} · حضور {number.format(student.sources.attendance)} · إنجاز {number.format(student.sources.achievement)}</p></details>}</div></div>
    </li>)}
  </ol>;
}
