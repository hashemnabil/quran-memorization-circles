import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Button, EmptyState, LoadingState } from '@/components/ui';
import { IconAward } from '@/components/ui/Icons';

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
  return <section aria-labelledby="honor-roll-title" className="mb-6 overflow-hidden rounded-3xl border border-[#ddd5bf] bg-[#fffcf5] shadow-sm" dir="rtl">
    <header className="relative overflow-hidden bg-[#123f32] px-5 py-5 text-white sm:px-7">
      <div aria-hidden="true" className="pointer-events-none absolute -left-16 -top-32 h-64 w-64 rounded-full border-[24px] border-white/[.03]" />
      <div className="relative flex items-center gap-3"><span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl border border-[#d3ba73]/40 bg-[#d3ba73]/10 text-[#ead494]"><IconAward size={28} /></span><div className="min-w-0 flex-1"><p className="mb-1 text-[11px] font-bold tracking-wider text-[#dccb99]">نجوم المدرسة</p><h2 id="honor-roll-title" className="text-xl font-extrabold sm:text-2xl">لوحة الشرف</h2></div><span className="rounded-full border border-white/15 px-3 py-1.5 text-xs text-emerald-50">أفضل ١٠ طلاب</span></div>
      <p className="relative mt-3 text-sm leading-6 text-emerald-50/85">أعلى الطلاب نقاطًا من جميع الحلقات</p>
    </header>
    <div className="p-4 sm:p-6">
      {query.isLoading ? <LoadingState rows={3} /> : !query.data && query.isError ? <div role="status" className="space-y-3 py-4 text-center"><p className="text-sm text-slate-600">تعذر تحميل لوحة الشرف</p><Button variant="secondary" size="sm" onClick={() => void query.refetch()}>إعادة المحاولة</Button></div> : !students.length ? <EmptyState title="ننتظر نجوم لوحة الشرف" message="تظهر أسماء الطلاب عند حصولهم على النقاط." icon={<IconAward size={28} />} /> : <>
        <ol aria-label="المراتب الأولى" className="grid gap-3 sm:grid-cols-3">
          {students.slice(0, 3).map((student, index) => <li key={student.id} data-student-id={student.id} className={`flex min-w-0 flex-col items-center rounded-2xl border px-4 py-5 text-center ${index === 0 ? 'border-[#d3b76c] bg-[#fff7de] sm:order-2' : index === 1 ? 'border-slate-200 bg-white sm:order-1' : 'border-[#e3cbb6] bg-[#fffaf5] sm:order-3'}`}>
            <Medal rank={student.rank} large /><h3 className="mt-2 break-words text-base font-extrabold text-[#173e32]">{student.fullName}</h3><p className="mt-1 text-xs leading-6 text-slate-500">{student.circleName}</p><p className="mt-1 text-xs leading-6 text-slate-600">الشيخ: {student.teacherName ?? 'لم يُحدد بعد'}</p><div className="mt-3 rounded-full bg-white/90 px-4 py-1.5"><strong className="text-xl font-extrabold tabular-nums text-[#17634b]">{number.format(student.points)}</strong><span className="ms-1 text-xs text-slate-500">نقطة</span></div>
          </li>)}
        </ol>
        {students.length > 3 && <ol start={4} aria-label="بقية العشرة الأوائل" className="mt-4 divide-y divide-[#e6e6db] rounded-2xl border border-[#e6e6db] bg-white px-3 sm:px-5">
          {students.slice(3).map(student => <li key={student.id} data-student-id={student.id} className="flex items-center gap-3 py-3"><Medal rank={student.rank} /><div className="min-w-0 flex-1"><h3 className="break-words text-sm font-bold text-slate-800">{student.fullName}</h3><p className="mt-1 text-xs leading-5 text-slate-500">{student.circleName} · الشيخ: {student.teacherName ?? 'لم يُحدد بعد'}</p></div><div className="shrink-0 text-center"><strong className="block font-extrabold tabular-nums text-[#17634b]">{number.format(student.points)}</strong><span className="text-[11px] text-slate-400">نقطة</span></div></li>)}
        </ol>}
      </>}
      <footer className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-[#e6e6db] pt-3 text-[11px] leading-5 text-slate-500"><span>{online ? 'يتغير الترتيب تلقائيًا حسب مجموع النقاط' : 'آخر ترتيب محفوظ · يتحدث عند الاتصال'}</span>{query.data?.updatedAt && <span>آخر تحديث: {new Intl.DateTimeFormat('ar', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Riyadh' }).format(new Date(query.data.updatedAt))}</span>}<span className="w-full">عند تساوي النقاط يتساوى المركز، وتُرتب الأسماء أبجديًا.</span>{query.isError && query.data && <span role="status" className="text-amber-700">تعذر تحديث الترتيب؛ المعروض آخر نسخة محفوظة.</span>}</footer>
    </div>
  </section>;
}
