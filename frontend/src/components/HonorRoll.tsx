import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Button, EmptyState, LoadingState } from '@/components/ui';
import { IconAward, IconUsers } from '@/components/ui/Icons';

export interface HonorStudent { id: string; fullName: string; points: number; rank: number; circleName: string; teacherName: string | null }
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
  const [online, setOnline] = useState(() => navigator.onLine);
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    window.addEventListener('online', update); window.addEventListener('offline', update);
    return () => { window.removeEventListener('online', update); window.removeEventListener('offline', update); };
  }, []);
  const query = useQuery({
    queryKey: ['dashboard', 'honor-roll'],
    queryFn: async () => {
      const { data } = await api.get<HonorRollData>('/dashboard/honor-roll');
      if (!Array.isArray(data?.students)) throw new Error('تعذر تحميل لوحة الشرف');
      return data;
    },
    staleTime: 10_000, refetchInterval: online ? 30_000 : false, refetchOnWindowFocus: true, refetchOnReconnect: 'always',
  });
  const students = query.data?.students ?? [];
  return <section aria-labelledby="honor-roll-title" className="mb-3 overflow-hidden rounded-2xl border border-[#ddd5bf] bg-[#fffcf5] shadow-sm" dir="rtl">
    <header className="relative overflow-hidden bg-[#123f32] px-4 py-2.5 text-white sm:px-5">
      <div aria-hidden="true" className="pointer-events-none absolute -left-16 -top-32 h-64 w-64 rounded-full border-[24px] border-white/[.03]" />
      <div className="relative flex items-center gap-3"><span className="grid h-9 w-9 shrink-0 place-items-center rounded-2xl border border-[#d3ba73]/40 bg-[#d3ba73]/10 text-[#ead494]"><IconAward size={21} /></span><div className="min-w-0 flex-1"><h2 id="honor-roll-title" className="text-base font-extrabold sm:text-lg">لوحة شرف المدرسة</h2></div><span className="rounded-full border border-white/15 px-3 py-1.5 text-xs text-emerald-50">أفضل ١٠ طلاب</span></div>
    </header>
    <div className="p-3 sm:p-4">
      {query.isLoading ? <LoadingState rows={3} /> : !query.data && query.isError ? <div role="status" className="space-y-3 py-4 text-center"><p className="text-sm text-slate-600">تعذر تحميل لوحة الشرف</p><Button variant="secondary" size="sm" onClick={() => void query.refetch()}>إعادة المحاولة</Button></div> : !students.length ? <EmptyState title="ننتظر نجوم لوحة الشرف" message="تظهر أسماء الطلاب عند حصولهم على النقاط." icon={<IconAward size={28} />} /> : <>
        <HonorRollRows students={students} />
      </>}
      <footer className="mt-2 flex flex-wrap items-center justify-between gap-2 border-t border-[#e6e6db] pt-3 text-[11px] leading-5 text-slate-500"><span>{online ? 'يتغير الترتيب تلقائيًا حسب مجموع النقاط' : 'آخر ترتيب محفوظ · يتحدث عند الاتصال'}</span>{query.data?.updatedAt && <span>آخر تحديث: {new Intl.DateTimeFormat('ar', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Riyadh' }).format(new Date(query.data.updatedAt))}</span>}<span className="w-full">عند تساوي النقاط يتساوى المركز، وتُرتب الأسماء أبجديًا.</span>{query.isError && query.data && <span role="status" className="text-amber-700">تعذر تحديث الترتيب؛ المعروض آخر نسخة محفوظة.</span>}</footer>
      <div className="mt-2 flex justify-end"><Link to="/student-ranking" aria-label="عرض جميع الطلاب" title="عرض جميع الطلاب" className="inline-flex min-h-10 items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-semibold text-emerald-800 hover:bg-emerald-50"><IconUsers size={16} /><span>عرض الجميع</span></Link></div>
    </div>
  </section>;
}

export function HonorRollRows({ students, label = 'ترتيب لوحة الشرف' }: { students: readonly HonorStudent[]; label?: string }) {
  return <ol aria-label={label} className="space-y-1.5">
    {students.map(student => <li key={student.id} data-student-id={student.id} className={`flex items-center gap-3 rounded-xl border px-3 py-2 sm:gap-4 sm:px-5 ${student.rank === 1 ? 'border-[#d3b76c] bg-[#fff7de]' : student.rank === 2 ? 'border-slate-300 bg-slate-50' : student.rank === 3 ? 'border-[#e3cbb6] bg-[#fffaf5]' : 'border-[#e6e6db] bg-white'}`}>
      <Medal rank={student.rank} /><div className="grid min-w-0 flex-1 grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] items-center gap-2 sm:gap-5"><div className="min-w-0"><h3 className="break-words text-xs font-extrabold text-[#173e32] sm:text-base">{student.fullName}</h3><p className="mt-1 text-[10px] leading-5 text-slate-500 sm:text-xs">{student.circleName}</p></div><p className="min-w-0 break-words text-[11px] leading-6 text-slate-600 sm:text-sm">الشيخ: {student.teacherName ?? 'لم يُحدد بعد'}</p><div className="shrink-0 text-center"><strong className="block text-sm font-extrabold tabular-nums text-[#17634b] sm:text-xl">{number.format(student.points)}</strong><span className="text-[10px] text-slate-500">نقطة</span></div></div>
    </li>)}
  </ol>;
}

export function CircleHonorRoll() {
  const [selectedCircle, setSelectedCircle] = useState('');
  const circlesQuery = useQuery({
    queryKey: ['dashboard', 'honor-roll', 'circles'],
    queryFn: async () => {
      const { data } = await api.get<{ id: string; name: string }[]>('/dashboard/honor-roll/circles');
      if (!Array.isArray(data)) throw new Error('تعذر تحميل قائمة الحلقات');
      return data.filter(circle => typeof circle?.id === 'string' && typeof circle?.name === 'string');
    },
  });
  const circles = circlesQuery.data ?? [];
  const activeCircle = circles.some(circle => circle.id === selectedCircle) ? selectedCircle : circles[0]?.id;
  const ranking = useQuery({
    queryKey: ['dashboard', 'honor-roll', 'circle', activeCircle],
    queryFn: async () => {
      const { data } = await api.get<HonorRollData>('/dashboard/honor-roll/circle', { params: { circleId: activeCircle } });
      if (!Array.isArray(data?.students)) throw new Error('تعذر تحميل ترتيب الحلقة');
      return data;
    },
    enabled: !!activeCircle,
    staleTime: 10_000,
    refetchInterval: 30_000,
  });
  return <section aria-labelledby="circle-honor-roll-title" className="mb-3 overflow-hidden rounded-2xl border border-[#ddd5bf] bg-[#fffcf5] shadow-sm" dir="rtl">
    <header className="flex flex-wrap items-center justify-between gap-2 bg-[#123f32] px-4 py-2.5 text-white sm:px-5">
      <div className="flex items-center gap-2">
        <span className="grid h-9 w-9 place-items-center rounded-xl bg-[#d3ba73]/10 text-[#ead494]"><IconAward size={21} /></span>
        <h2 id="circle-honor-roll-title" className="text-base font-extrabold sm:text-lg">لوحة شرف الحلقة</h2>
      </div>
      {circles.length > 1 ? <select aria-label="اختر الحلقة للوحة الشرف" value={activeCircle ?? ''} onChange={event => setSelectedCircle(event.target.value)} className="max-w-full rounded-lg border border-white/20 bg-[#205846] px-2 py-1.5 text-sm text-white">
        {circles.map(circle => <option key={circle.id} value={circle.id}>{circle.name}</option>)}
      </select> : circles.length === 1 ? <span className="text-sm text-emerald-50">{circles[0].name}</span> : null}
    </header>
    <div className="p-3 sm:p-4">
      {circlesQuery.isLoading || (activeCircle && ranking.isLoading) ? <LoadingState rows={3} /> :
        circlesQuery.isError || ranking.isError ? <div role="status" className="text-sm text-red-700">تعذر تحميل لوحة شرف الحلقة <Button variant="secondary" size="sm" onClick={() => { void circlesQuery.refetch(); void ranking.refetch(); }}>إعادة المحاولة</Button></div> :
        !activeCircle ? <EmptyState title="لا توجد حلقة متاحة" message="تظهر لوحة الحلقة عند ربط حسابك بحلقة." icon={<IconAward size={28} />} /> :
        !ranking.data?.students?.length ? <EmptyState title="لا توجد نقاط بعد" message="تظهر أسماء طلاب الحلقة عند حصولهم على النقاط." icon={<IconAward size={28} />} /> :
        <HonorRollRows students={ranking.data.students} label="ترتيب لوحة شرف الحلقة" />}
    </div>
  </section>;
}
