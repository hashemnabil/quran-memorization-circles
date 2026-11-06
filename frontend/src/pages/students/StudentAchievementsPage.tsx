import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api, apiError } from '@/lib/api';
import { useAuthStore } from '@/store/auth';
import { Card, PageHeader, LoadingState, ErrorState, Select } from '@/components/ui';
import type { PaginatedResponse, Student } from '@/types';
import { exportLocalPdf } from '@/lib/local-pdf';
import { saveDeviceFile } from '@/lib/save-device-file';

const parts = (value: unknown) => Math.max(0, Math.min(30, Number(value) || 0));

export default function StudentAchievementsPage() {
  const user = useAuthStore(state => state.user);
  const [search, setSearch] = useState('');
  const [circleId, setCircleId] = useState('');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Student | null>(null);
  const circles = useQuery({
    queryKey: ['achievements', 'circles'],
    queryFn: async () => (await api.get<any[]>('/circles/options')).data,
  });
  const students = useQuery({
    queryKey: ['achievements', 'students', search, circleId, page],
    queryFn: async () => (await api.get<PaginatedResponse<Student>>('/students', {
      params: { page, limit: 20, search: search || undefined, circleId: circleId || undefined },
    })).data,
  });
  const rows = students.data?.data ?? [];
  const current = useMemo(() => selected && rows.find(row => row.id === selected.id) || selected, [selected, rows]);
  const count = students.data?.meta?.total ?? rows.length;
  const surahs = useQuery({ queryKey: ['achievements','surahs'], queryFn: async () => (await api.get<Array<{number:number;name:string;ayahs:number}>>('/recitations/surahs')).data });
  const detail = useQuery({ queryKey: ['achievements','student',current?.id], queryFn: async () => (await api.get<Student>('/students/'+current!.id)).data, enabled: !!current?.id });
  const completed = new Set((detail.data?.surahCompletions ?? []).map(item => item.surah));
  const completedCount = surahs.data?.filter(item => completed.has(item.name)).length ?? 0;
  const exportReport = async () => {
    const student = detail.data;
    if (!student) return;
    const title = 'تقرير إنجاز الطالب';
    const report = [
      { البيان: 'الطالب', القيمة: student.fullName },
      { البيان: 'الحلقة', القيمة: student.circle?.name ?? '—' },
      { البيان: 'الأجزاء المحفوظة', القيمة: parts(student.memorizedParts) + ' من 30' },
      { البيان: 'السور المكتملة', القيمة: completedCount + ' من 114' },
      ...(surahs.data ?? []).filter(item => completed.has(item.name)).map(item => ({ البيان: 'سورة مكتملة', القيمة: item.name })),
    ];
    await saveDeviceFile(await exportLocalPdf(title, report), 'تقرير-إنجاز-' + student.fullName + '.pdf');
  };
  return <div dir="rtl" className="space-y-5">
    <PageHeader title="إنجازات الطلاب" subtitle={user?.role === 'TEACHER' ? 'متابعة إنجازات طلاب حلقاتك' : 'متابعة إنجازات طلاب المدرسة حسب الحلقة والطالب'} />
    <Card>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm font-bold text-slate-700">ابحث عن طالب
          <input className="mt-1 w-full rounded-xl border border-slate-300 p-3" value={search} onChange={event => { setSearch(event.target.value); setPage(1); setSelected(null); }} placeholder="اسم الطالب" />
        </label>
        <label className="text-sm font-bold text-slate-700">الحلقة
          <Select value={circleId} onChange={event => { setCircleId(event.target.value); setPage(1); setSelected(null); }}>
            <option value="">كل الحلقات المتاحة</option>
            {(circles.data ?? []).map(circle => <option key={circle.id} value={circle.id}>{circle.name}</option>)}
          </Select>
        </label>
      </div>
      <p className="mt-4 text-sm text-slate-500">الطلاب في نتائج البحث: {count}. التقدم المعروض يعتمد على الأجزاء المحفوظة المسجلة، ولا يحتسب سورًا مكتملة دون سجل يؤكد ذلك.</p>
    </Card>
    {students.isLoading ? <LoadingState /> : students.isError ? <ErrorState message={apiError(students.error, 'تعذّر تحميل إنجازات الطلاب')} onRetry={() => void students.refetch()} /> :
      <Card><div className="space-y-2">
        {rows.length === 0 && <p className="p-6 text-center text-slate-500">لا يوجد طلاب مطابقون للبحث.</p>}
        {rows.map(student => <button type="button" key={student.id} onClick={() => setSelected(student)}
          className={`w-full rounded-2xl border p-4 text-right transition hover:border-emerald-600 ${current?.id === student.id ? 'border-emerald-600 bg-emerald-50' : 'border-slate-200'}`}>
          <div className="flex items-center justify-between gap-3"><strong>{student.fullName}</strong><span className="text-sm font-bold text-emerald-800">{parts(student.memorizedParts)} / 30 جزءًا</span></div>
          <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-emerald-600" style={{ width: `${parts(student.memorizedParts) / 30 * 100}%` }} /></div>
          <span className="mt-2 block text-xs text-slate-500">{student.circle?.name ?? 'بدون حلقة'} · {Math.round(parts(student.memorizedParts) / 30 * 100)}٪ من الأجزاء</span>
        </button>)}
      </div>
      <div className="mt-4 flex items-center justify-between gap-3"><button className="rounded-xl border px-4 py-2 disabled:opacity-40" disabled={page === 1} onClick={() => setPage(value => value - 1)}>السابق</button><span>صفحة {page}</span><button className="rounded-xl border px-4 py-2 disabled:opacity-40" disabled={!students.data?.meta?.hasNextPage} onClick={() => setPage(value => value + 1)}>التالي</button></div>
      </Card>}
    {current && <Card>
      <h2 className="text-lg font-extrabold">إنجاز {current.fullName}</h2>
      <p className="mt-2 text-slate-600">الأجزاء المحفوظة: <strong>{parts(current.memorizedParts)} من 30</strong></p>
      <div className="mt-3 h-3 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-emerald-600" style={{ width: `${parts(current.memorizedParts) / 30 * 100}%` }} /></div>
      <div className="mt-6">
        <h3 className="text-center text-xl font-extrabold text-rose-700">قلبي القرآني</h3>
        <p className="mt-1 text-center text-sm text-slate-600">{completedCount} / 114 سورة مكتملة</p>
        {detail.isLoading || surahs.isLoading ? <LoadingState /> : detail.isError || surahs.isError ? <ErrorState message="تعذّر تحميل السور المكتملة" onRetry={() => { void detail.refetch(); void surahs.refetch(); }} /> :
          <div className="mx-auto mt-4 grid max-w-xl grid-cols-9 gap-1.5" aria-label="القلب القرآني: السور المكتملة">
            {(surahs.data ?? []).map((item, index) => {
              const done = completed.has(item.name);
              const x = (index % 9 - 4) / 4.5;
              const y = (Math.floor(index / 9) - 5.8) / 6.5;
              const inside = Math.pow(x*x+y*y-1, 3)-x*x*Math.pow(y,3) <= 0;
              return <div key={item.number} title={item.name + ' — ' + (done ? 'مكتملة' : 'غير مكتملة')} className={'flex aspect-square min-w-0 items-center justify-center rounded-md border text-[9px] leading-tight sm:text-[11px] ' + (done ? 'border-rose-600 bg-rose-600 text-white' : 'border-slate-200 bg-slate-100 text-slate-600')} style={{ opacity: inside ? 1 : .32 }}>{item.name}</div>;
            })}
          </div>}
        <p className="mt-3 text-center text-xs text-slate-500">الأحمر للسور المثبت إتمامها في سجل الطالب، والرمادي للسور الأخرى.</p>
      </div>
      <button type="button" onClick={() => void exportReport()} disabled={!detail.data || !surahs.data} className="mt-4 rounded-xl bg-emerald-800 px-4 py-2 font-bold text-white disabled:opacity-50">تصدير تقرير الإنجاز PDF</button>
      <Link className="mt-4 inline-flex rounded-xl bg-emerald-800 px-4 py-2 font-bold text-white" to={`/students/${current.id}`}>فتح ملف الطالب</Link>
    </Card>}
  </div>;
}
