import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api, apiError } from '@/lib/api';
import { useDebounce } from '@/hooks/useDebounce';
import { formatDate } from '@/lib/format';
import {
  Avatar,
  Badge,
  Card,
  EmptyState,
  ErrorState,
  LoadingState,
  PageHeader,
  Pagination,
  SearchInput,
  StatCard,
} from '@/components/ui';
import { IconCircleGroup, IconUsers } from '@/components/ui/Icons';
import type { PaginatedResponse, StaffMember } from '@/types';

/**
 * Supervisors get their own page, like the teachers and parents do.
 *
 * The point of the page is the double role: a supervisor may run a circle of
 * their own *and* oversee others, and both attachments are shown side by side
 * so it is obvious which is which.
 */
export default function SupervisorsPage() {
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const debounced = useDebounce(search, 350);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['users', 'staff', 'supervisors', { debounced, page }],
    queryFn: async () =>
      (
        await api.get<PaginatedResponse<StaffMember>>('/users/staff', {
          params: { role: 'SUPERVISOR', search: debounced || undefined, page, limit: 20 },
        })
      ).data,
  });

  const rows = data?.data ?? [];
  const supervising = rows.reduce((n, s) => n + (s.supervisedCircles?.length ?? 0), 0);
  const teaching = rows.filter((s) =>
    (s.circles ?? []).some((c) => c.relation !== 'SUPERVISOR'),
  ).length;

  return (
    <div className="space-y-5">
      <PageHeader
        title="المشرفون"
        subtitle="المشرف قد يُسند إليه حلقة خاصة به إلى جانب إشرافه على حلقات أخرى"
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard label="عدد المشرفين" value={data?.meta.total ?? 0} icon={<IconUsers size={20} />} />
        <StatCard
          label="حلقات تحت الإشراف"
          value={supervising}
          icon={<IconCircleGroup size={20} />}
          tone="purple"
        />
        <StatCard
          label="مشرفون يُدرّسون حلقاتهم"
          value={teaching}
          icon={<IconCircleGroup size={20} />}
          tone="sky"
        />
      </div>

      <Card>
        <SearchInput
          value={search}
          onChange={(v) => {
            setSearch(v);
            setPage(1);
          }}
          placeholder="ابحث بالاسم أو اسم المستخدم أو الجوال..."
        />
      </Card>

      {isLoading ? (
        <LoadingState />
      ) : error ? (
        <ErrorState message={apiError(error, 'تعذر تحميل المشرفين')} onRetry={refetch} />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={<IconUsers size={30} />}
          title="لا يوجد مشرفون"
          message="يمكن إضافة مشرف من صفحة المستخدمين بتحديد الدور «مشرف»."
        />
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-2">
            {rows.map((person) => {
              const own = (person.circles ?? []).filter((c) => c.relation !== 'SUPERVISOR');
              const supervised = person.supervisedCircles ?? [];
              return (
                <Card key={person.id}>
                  <div className="flex items-start gap-3">
                    <Avatar name={person.fullName} src={person.avatarUrl} size={44} preview />
                    <div className="min-w-0 flex-1">
                      <span className="block truncate font-bold text-slate-800">{person.fullName}</span>
                      <span className="numeric block text-xs text-slate-400" dir="ltr">
                        {person.username}
                      </span>
                      {person.jobTitle && (
                        <span className="mt-0.5 block text-xs text-slate-500">{person.jobTitle}</span>
                      )}
                    </div>
                    <Badge
                      className={person.isActive ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-600'}
                    >
                      {person.isActive ? 'نشط' : 'موقوف'}
                    </Badge>
                  </div>

                  <dl className="mt-4 space-y-3 text-sm">
                    <div>
                      <dt className="mb-1 text-xs text-slate-400">حلقات يشرف عليها</dt>
                      <dd className="flex flex-wrap gap-1">
                        {supervised.length ? (
                          supervised.map((c) => (
                            <Link key={c.id} to={`/circles/${c.id}`}>
                              <Badge className="bg-indigo-100 text-indigo-800">{c.name}</Badge>
                            </Link>
                          ))
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </dd>
                    </div>

                    <div>
                      <dt className="mb-1 text-xs text-slate-400">حلقته الخاصة (كمعلم)</dt>
                      <dd className="flex flex-wrap gap-1">
                        {own.length ? (
                          own.map((c) => (
                            <Link key={c.id} to={`/circles/${c.id}`}>
                              <Badge className="bg-sky-100 text-sky-800">{c.name}</Badge>
                            </Link>
                          ))
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </dd>
                    </div>

                    <div className="flex items-center justify-between border-t border-slate-100 pt-2.5">
                      <span className="text-xs text-slate-400">الجوال</span>
                      <span className="numeric text-slate-700" dir="ltr">
                        {person.phone ?? '—'}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-slate-400">آخر دخول</span>
                      <span className="text-slate-700">
                        {person.lastLoginAt ? formatDate(person.lastLoginAt) : 'لم يسجّل الدخول بعد'}
                      </span>
                    </div>
                  </dl>
                </Card>
              );
            })}
          </div>

          {data && (
            <Pagination
              page={data.meta.page}
              totalPages={data.meta.totalPages}
              total={data.meta.total}
              onChange={setPage}
            />
          )}
        </>
      )}
    </div>
  );
}
