import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { formatDateTime } from '@/lib/format';
import { useDebounce } from '@/hooks/useDebounce';
import { Card, EmptyState, ErrorState, Input, LoadingState, PageHeader, Pagination, Select } from '@/components/ui';

export default function ActivityPage() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [sortOrder, setSortOrder] = useState('desc');
  const term = useDebounce(search, 250);
  const activity = useQuery({ queryKey: ['activity-history', page, term, sortOrder], queryFn: async () =>
    (await api.get('/dashboard/activity', { params: { page, limit: 50, search: term, sortBy: 'createdAt', sortOrder } })).data });
  return <div dir="rtl"><PageHeader title="سجل النشاط" action={<Link to="/" className="btn-secondary">العودة للرئيسية</Link>} />
    <Card><div className="mb-5 grid gap-4 sm:grid-cols-2">
      <Input label="البحث في النشاط أو اسم المستخدم" value={search} onChange={event => { setSearch(event.target.value); setPage(1); }} />
      <Select label="ترتيب النشاطات" value={sortOrder} onChange={event => { setSortOrder(event.target.value); setPage(1); }}><option value="desc">الأحدث أولًا</option><option value="asc">الأقدم أولًا — من بداية السجل</option></Select>
    </div><p className="mb-4 text-sm text-slate-500">كل النشاطات المحفوظة، دون تحديد فترة زمنية.</p>
    {activity.isLoading ? <LoadingState /> : activity.isError ? <ErrorState message="تعذر تحميل سجل النشاط" onRetry={() => activity.refetch()} /> : <>
      {activity.data?.data?.length ? <ul className="divide-y divide-slate-100">{activity.data.data.map((entry: any) => <li key={entry.id} className="py-4">
        <p className="break-words font-semibold text-slate-800">{entry.summary}</p><p className="mt-2 text-sm text-slate-500">{entry.user?.fullName || 'النظام'} — {formatDateTime(entry.createdAt)}</p>
      </li>)}</ul> : <EmptyState title="لا توجد نشاطات مطابقة" />}
      {activity.data?.meta && <Pagination page={page} total={activity.data.meta.total} totalPages={activity.data.meta.totalPages} onChange={setPage} />}
    </>}
    </Card></div>;
}
