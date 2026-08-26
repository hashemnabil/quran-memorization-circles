import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api, apiError } from '@/lib/api';
import { useDebounce } from '@/hooks/useDebounce';
import { formatDate } from '@/lib/format';
import { EMPLOYMENT_LABELS, ROLE_COLORS, ROLE_LABELS } from '@/lib/labels';
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
  Select,
  StatCard,
} from '@/components/ui';
import { IconClipboard, IconUsers } from '@/components/ui/Icons';
import type { PaginatedResponse, Role, StaffMember } from '@/types';

/** Only the roles that actually work at the school appear here. */
const STAFF_ROLES: Role[] = ['ADMIN', 'SUPERVISOR', 'TEACHER', 'EXAM_COMMITTEE', 'SUPPORT'];

/**
 * The unified staff directory: teachers, supervisors, administrators, the exam
 * committee and technical support in one list, instead of a separate page per
 * category. A supervisor who also runs a circle shows both attachments, which
 * is the case the separate pages could never represent.
 */
export default function StaffPage() {
  const [search, setSearch] = useState('');
  const [role, setRole] = useState<Role | ''>('');
  const [page, setPage] = useState(1);
  const debounced = useDebounce(search, 350);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['users', 'staff', { debounced, role, page }],
    queryFn: async () =>
      (
        await api.get<PaginatedResponse<StaffMember>>('/users/staff', {
          params: { search: debounced || undefined, role: role || undefined, page, limit: 20 },
        })
      ).data,
  });

  const rows = data?.data ?? [];
  const countBy = (r: Role) => rows.filter((u) => u.role === r).length;

  return (
    <div className="space-y-5">
      <PageHeader
        title="دليل الكادر"
        subtitle="جميع منسوبي المدرسة من معلمين ومشرفين وإداريين ولجنة اختبارات في مكان واحد"
        action={
          <Link to="/staff/attendance" className="btn-secondary">
            <IconClipboard size={16} /> حضور الكادر
          </Link>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="إجمالي الكادر" value={data?.meta.total ?? 0} icon={<IconUsers size={20} />} />
        <StatCard label="المعلمون" value={countBy('TEACHER')} icon={<IconUsers size={20} />} tone="sky" />
        <StatCard label="المشرفون" value={countBy('SUPERVISOR')} icon={<IconUsers size={20} />} tone="purple" />
        <StatCard
          label="لجنة الاختبارات"
          value={countBy('EXAM_COMMITTEE')}
          icon={<IconUsers size={20} />}
          tone="amber"
        />
      </div>

      <Card>
        <div className="flex flex-wrap items-end gap-3">
          <SearchInput
            value={search}
            onChange={(v) => {
              setSearch(v);
              setPage(1);
            }}
            placeholder="ابحث بالاسم أو اسم المستخدم أو التخصص أو رقم الهوية..."
            className="min-w-[260px] flex-1"
          />
          <Select
            label="الدور"
            value={role}
            onChange={(e) => {
              setRole(e.target.value as Role | '');
              setPage(1);
            }}
            className="w-52"
          >
            <option value="">كل الأدوار</option>
            {STAFF_ROLES.map((r) => (
              <option key={r} value={r}>
                {ROLE_LABELS[r]}
              </option>
            ))}
          </Select>
        </div>
      </Card>

      {isLoading ? (
        <LoadingState />
      ) : error ? (
        <ErrorState message={apiError(error, 'تعذر تحميل دليل الكادر')} onRetry={refetch} />
      ) : rows.length === 0 ? (
        <EmptyState icon={<IconUsers size={30} />} title="لا توجد نتائج" />
      ) : (
        <>
          <Card padded={false}>
            <div className="overflow-x-auto">
              <table className="table">
                <thead>
                  <tr>
                    <th>الاسم</th>
                    <th>الدور</th>
                    <th>المسمى الوظيفي</th>
                    <th>التخصص</th>
                    <th>الحلقات</th>
                    <th>الدورات</th>
                    <th>الجوال</th>
                    <th>تاريخ المباشرة</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((person) => (
                    <tr key={person.id}>
                      <td>
                        <div className="flex items-center gap-2.5">
                          <Avatar name={person.fullName} src={person.avatarUrl} size={34} preview />
                          <div className="min-w-0">
                            <span className="block truncate font-semibold text-slate-700">
                              {person.fullName}
                            </span>
                            <span className="numeric block text-xs text-slate-400" dir="ltr">
                              {person.username}
                            </span>
                          </div>
                        </div>
                      </td>
                      <td>
                        <Badge className={ROLE_COLORS[person.role]}>{ROLE_LABELS[person.role]}</Badge>
                      </td>
                      <td className="text-slate-600">{person.jobTitle ?? '—'}</td>
                      <td className="text-slate-600">
                        {person.specialization ?? person.teacher?.specialization ?? '—'}
                      </td>
                      <td>
                        {person.circles?.length ? (
                          <div className="flex flex-wrap gap-1">
                            {person.circles.map((c) => (
                              <Badge
                                key={`${c.id}-${c.relation}`}
                                className={
                                  c.relation === 'SUPERVISOR'
                                    ? 'bg-indigo-100 text-indigo-800'
                                    : 'bg-sky-100 text-sky-800'
                                }
                              >
                                {c.name}
                                {c.relation === 'SUPERVISOR' ? ' (إشراف)' : ''}
                              </Badge>
                            ))}
                          </div>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>
                      <td>
                        {person.coursesInstructed?.length ? (
                          <span className="text-xs text-slate-600">
                            {person.coursesInstructed.map((c) => c.name).join('، ')}
                          </span>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>
                      <td className="numeric" dir="ltr">
                        {person.phone ?? '—'}
                      </td>
                      <td>
                        {person.teacher?.hireDate ? formatDate(person.teacher.hireDate) : '—'}
                        {person.teacher?.employmentType && (
                          <span className="block text-xs text-slate-400">
                            {EMPLOYMENT_LABELS[person.teacher.employmentType]}
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

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
