import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { HonorRollRows, type HonorRollData } from '@/components/HonorRoll';
import { Button, Card, EmptyState, ErrorState, Input, LoadingState, PageHeader } from '@/components/ui';

const normalize = (value: string) => value.replace(/[\u064B-\u065F\u0670]/g, '').replace(/[أإآ]/g, 'ا').replace(/ى/g, 'ي').trim();
export default function StudentRankingPage() {
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const query = useQuery({
    queryKey: ['dashboard', 'student-ranking'],
    queryFn: async () => {
      const { data } = await api.get<HonorRollData>('/dashboard/student-ranking');
      if (!Array.isArray(data?.students)) throw new Error('تعذر تحميل ترتيب الطلاب');
      return data;
    },
    staleTime: 10_000, refetchInterval: 30_000, refetchOnWindowFocus: true, refetchOnReconnect: 'always',
  });
  const all = query.data?.students ?? [];
  const term = normalize(search);
  const rows = all.filter(student => !term || normalize([student.fullName, student.teacherName, student.circleName].join(' ')).includes(term));
  const pages = Math.max(1, Math.ceil(rows.length / 50));
  const currentPage = Math.min(page, pages);
  const start = (currentPage - 1) * 50;
  return <div dir="rtl" className="space-y-5">
    <PageHeader title="ترتيب الطلاب" subtitle="جميع طلاب المدرسة من الأعلى نقاطًا إلى الأقل" breadcrumb={<Link to="/">الرئيسية</Link>} />
    <Card>
      <div className="flex flex-wrap items-end justify-between gap-4"><Input label="ابحث عن طالب أو شيخ أو حلقة" placeholder="اكتب الاسم هنا" value={search} onChange={event => { setSearch(event.target.value); setPage(1); }} className="w-full sm:max-w-md" /><div className="rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-900">إجمالي الطلاب: <strong>{all.length}</strong></div></div>
      <p className="mt-3 text-xs leading-6 text-slate-500">يشمل الترتيب جميع الطلاب المسجلين، حتى من لم يحصل على نقاط بعد. يتغير تلقائيًا مع النقاط، وعند التساوي يتساوى المركز وتُرتب الأسماء أبجديًا. البحث يحتفظ بمركز الطالب على مستوى المدرسة.</p>
      {!navigator.onLine && <p role="status" className="mt-2 text-xs text-amber-700">آخر ترتيب محفوظ على الجهاز؛ يتحدث عند الاتصال.</p>}
    </Card>
    {query.isLoading ? <LoadingState rows={6} /> : query.isError && !query.data ? <ErrorState message="تعذر تحميل ترتيب الطلاب" onRetry={() => void query.refetch()} /> : <Card>
      {query.isError && <p role="status" className="mb-3 text-sm text-amber-700">تعذر تحديث الترتيب؛ المعروض آخر نسخة محفوظة.</p>}
      {rows.length ? <HonorRollRows students={rows.slice(start, start + 50)} label="ترتيب جميع الطلاب" /> : <EmptyState title={term ? 'لا يوجد طلاب مطابقون للبحث' : 'لا يوجد طلاب مسجلون بعد'} />}
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm text-slate-500"><span>{rows.length ? `${start + 1}–${Math.min(start + 50, rows.length)} من ${rows.length}` : '٠ نتائج'}</span>{pages > 1 && <div className="flex items-center gap-3"><Button size="sm" variant="secondary" disabled={currentPage <= 1} onClick={() => setPage(currentPage - 1)}>السابق</Button><span>صفحة {currentPage} من {pages}</span><Button size="sm" variant="secondary" disabled={currentPage >= pages} onClick={() => setPage(currentPage + 1)}>التالي</Button></div>}</div>
    </Card>}
  </div>;
}
