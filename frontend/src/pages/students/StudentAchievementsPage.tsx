import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api, apiError } from '@/lib/api';
import { useAuthStore } from '@/store/auth';
import { Card, PageHeader, LoadingState, ErrorState, Select } from '@/components/ui';
import type { PaginatedResponse, Student } from '@/types';

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
      <p className="mt-3 text-sm text-slate-500">تفاصيل السور والقلب القرآني ستُعرض بعد ربطها بسجلات الحفظ على مستوى السورة؛ لا نلوّن السور بناءً على عدد الأجزاء فقط.</p>
      <Link className="mt-4 inline-flex rounded-xl bg-emerald-800 px-4 py-2 font-bold text-white" to={`/students/${current.id}`}>فتح ملف الطالب</Link>
    </Card>}
  </div>;
}
