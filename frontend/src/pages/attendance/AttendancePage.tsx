import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { api, apiError } from '@/lib/api';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorState,
  Input,
  LoadingState,
  PageHeader,
  Select,
  StatCard,
  Tabs,
  cx,
} from '@/components/ui';
import { IconCheck, IconClipboard, IconLock } from '@/components/ui/Icons';
import {
  ATTENDANCE_ACTIVE,
  ATTENDANCE_COLORS,
  ATTENDANCE_LABELS,
  ATTENDANCE_ORDER,
  ATTENDANCE_SHORT,
} from '@/lib/labels';
import { formatDateShort, formatDateTime, todayInput } from '@/lib/format';
import type { AttendanceSheet, AttendanceStatus, Circle, PaginatedResponse, AttendanceRecord } from '@/types';

type Draft = Record<string, { status: AttendanceStatus; note?: string }>;

export default function AttendancePage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const queryClient = useQueryClient();

  const [tab, setTab] = useState('record');
  const [circleId, setCircleId] = useState(searchParams.get('circleId') ?? '');
  const [date, setDate] = useState(todayInput());
  const [draft, setDraft] = useState<Draft>({});

  const { data: circles } = useQuery({
    queryKey: ['circles', 'options'],
    queryFn: async () => (await api.get<Pick<Circle, 'id' | 'name' | 'code'>[]>('/circles/options')).data,
  });

  // Default to the first circle the user can access.
  useEffect(() => {
    if (!circleId && circles?.length) setCircleId(circles[0].id);
  }, [circles, circleId]);

  useEffect(() => {
    if (circleId) setSearchParams({ circleId }, { replace: true });
  }, [circleId, setSearchParams]);

  const {
    data: sheet,
    isLoading,
    isError,
    refetch,
  } = useQuery({
    queryKey: ['attendance', 'sheet', circleId, date],
    queryFn: async () =>
      (await api.get<AttendanceSheet>('/attendance/sheet', { params: { circleId, date } })).data,
    enabled: !!circleId && !!date,
  });

  // Reset the draft whenever a new sheet loads, pre-filling saved values.
  useEffect(() => {
    if (!sheet) return;
    const next: Draft = {};
    sheet.students.forEach((s) => {
      next[s.id] = s.attendance
        ? { status: s.attendance.status, note: s.attendance.note ?? undefined }
        : { status: 'PRESENT' };
    });
    setDraft(next);
  }, [sheet]);

  const save = useMutation({
    mutationFn: () =>
      api.post('/attendance', {
        circleId,
        date,
        entries: Object.entries(draft).map(([studentId, value]) => ({
          studentId,
          status: value.status,
          note: value.status === 'EXCUSED' ? value.note || undefined : undefined,
        })),
      }),
    onSuccess: (res) => {
      toast.success(res.data?.message ?? 'تم حفظ كشف الحضور');
      queryClient.invalidateQueries({ queryKey: ['attendance'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    },
    onError: (error) => toast.error(apiError(error)),
  });

  const counts = useMemo(() => {
    const base: Record<AttendanceStatus, number> = { PRESENT: 0, EXCUSED: 0, ABSENT: 0 };
    Object.values(draft).forEach((d) => (base[d.status] += 1));
    return base;
  }, [draft]);

  // Once the day is submitted the sheet turns read-only for whoever may not
  // correct it — the backend rejects a second submission either way.
  const locked = !!sheet && !sheet.canSubmit;

  const setAll = (status: AttendanceStatus) => {
    setDraft((prev) => Object.fromEntries(Object.keys(prev).map((id) => [id, { status }])) as Draft);
  };

  return (
    <>
      <PageHeader title="الحضور والغياب" subtitle="تسجيل ومتابعة حضور الطلاب" />

      <Tabs
        tabs={[
          { key: 'record', label: 'تسجيل الحضور' },
          { key: 'history', label: 'سجل الحضور' },
        ]}
        active={tab}
        onChange={setTab}
      />

      {tab === 'record' ? (
        <>
          <Card className="mb-5">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Select label="الحلقة" value={circleId} onChange={(e) => setCircleId(e.target.value)}>
                <option value="">اختر الحلقة</option>
                {circles?.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({c.code})
                  </option>
                ))}
              </Select>
              <Input label="التاريخ" type="date" value={date} max={todayInput()} onChange={(e) => setDate(e.target.value)} />
              {!locked && (
                <div className="flex items-end gap-2 sm:col-span-2">
                  <Button variant="secondary" size="sm" onClick={() => setAll('PRESENT')} className="flex-1">
                    تعيين الكل حاضر
                  </Button>
                  <Button variant="secondary" size="sm" onClick={() => setAll('ABSENT')} className="flex-1">
                    تعيين الكل غائب
                  </Button>
                </div>
              )}
            </div>
          </Card>

          {!circleId ? (
            <Card>
              <EmptyState title="اختر حلقة للبدء" message="حدد الحلقة والتاريخ لعرض كشف الحضور." icon={<IconClipboard size={24} />} />
            </Card>
          ) : isLoading ? (
            <LoadingState />
          ) : isError ? (
            <ErrorState message="تعذر تحميل كشف الحضور" onRetry={() => refetch()} />
          ) : !sheet?.students.length ? (
            <Card>
              <EmptyState title="لا يوجد طلاب في هذه الحلقة" icon={<IconClipboard size={24} />} />
            </Card>
          ) : (
            <>
              <div className="mb-5 grid gap-4 sm:grid-cols-3">
                <StatCard label="حاضر" value={counts.PRESENT} tone="emerald" />
                <StatCard label="غياب بعذر" value={counts.EXCUSED} tone="amber" />
                <StatCard label="غياب بدون عذر" value={counts.ABSENT} tone="red" />
              </div>

              {locked && (
                <div className="mb-5 flex items-start gap-2.5 rounded-2xl border border-emerald-100 bg-emerald-50 px-4 py-3.5 text-sm text-emerald-800">
                  <IconLock size={18} className="mt-0.5 shrink-0" />
                  <span>
                    تم تسجيل حضور هذا اليوم
                    {sheet.submittedBy ? ` بواسطة ${sheet.submittedBy.fullName}` : ''}
                    {sheet.submittedAt ? (
                      <>
                        {' '}
                        — <span className="numeric">{formatDateTime(sheet.submittedAt)}</span>
                      </>
                    ) : null}
                    . لا يمكن إرساله مرة أخرى؛ راجع الإدارة إذا لزم التعديل.
                  </span>
                </div>
              )}

              <Card
                title={`كشف حضور ${sheet.circle.name}`}
                subtitle={
                  locked
                    ? 'الكشف مُغلق للعرض فقط'
                    : sheet.alreadyRecorded
                      ? 'سبق تسجيل هذا اليوم — الحفظ سيحدّث السجل'
                      : 'لم يُسجل الحضور لهذا التاريخ بعد'
                }
                action={
                  locked ? undefined : (
                    <Button onClick={() => save.mutate()} loading={save.isPending}>
                      حفظ الكشف
                    </Button>
                  )
                }
                padded={false}
              >
                <ul className="divide-y divide-slate-100">
                  {sheet.students.map((student) => {
                    const entry = draft[student.id] ?? { status: 'PRESENT' as AttendanceStatus };
                    return (
                      <li key={student.id} className="flex flex-wrap items-center gap-3 px-5 py-3.5">
                        <div className="min-w-0 flex-1">
                          <Link to={`/students/${student.id}`} className="font-semibold text-slate-800 hover:text-primary-700">
                            {student.fullName}
                          </Link>
                          <p className="numeric text-[11px] text-slate-400">
                            {student.code}
                            {student.status === 'SUSPENDED' && (
                              <span className="mr-2 rounded bg-red-100 px-1.5 py-0.5 text-red-700">موقوف</span>
                            )}
                          </p>
                        </div>

                        {locked ? (
                          <Badge className={ATTENDANCE_COLORS[entry.status]}>
                            {ATTENDANCE_LABELS[entry.status]}
                          </Badge>
                        ) : (
                          <div className="flex flex-wrap gap-1.5">
                            {ATTENDANCE_ORDER.map((status) => (
                              <button
                                key={status}
                                onClick={() =>
                                  setDraft((prev) => ({
                                    ...prev,
                                    [student.id]: { ...prev[student.id], status },
                                  }))
                                }
                                className={cx(
                                  'rounded-lg border px-3 py-1.5 text-xs font-bold transition',
                                  entry.status === status
                                    ? ATTENDANCE_ACTIVE[status]
                                    : 'border-slate-200 bg-white text-slate-500 hover:bg-slate-50',
                                )}
                              >
                                {ATTENDANCE_LABELS[status]}
                              </button>
                            ))}
                          </div>
                        )}

                        {entry.status === 'EXCUSED' &&
                          (locked ? (
                            entry.note && <span className="text-xs text-slate-500">{entry.note}</span>
                          ) : (
                            <input
                              type="text"
                              placeholder="سبب العذر"
                              value={entry.note ?? ''}
                              onChange={(e) =>
                                setDraft((prev) => ({
                                  ...prev,
                                  [student.id]: { ...prev[student.id], note: e.target.value },
                                }))
                              }
                              className="input w-40 py-1.5 text-xs"
                            />
                          ))}
                      </li>
                    );
                  })}
                </ul>
                {!locked && (
                  <div className="border-t border-slate-100 px-5 py-4 text-left">
                    <Button onClick={() => save.mutate()} loading={save.isPending} icon={<IconCheck size={17} />}>
                      حفظ الكشف
                    </Button>
                  </div>
                )}
              </Card>
            </>
          )}
        </>
      ) : (
        <AttendanceHistory circles={circles ?? []} />
      )}
    </>
  );
}

function AttendanceHistory({ circles }: { circles: Pick<Circle, 'id' | 'name' | 'code'>[] }) {
  const [circleId, setCircleId] = useState('');
  const [status, setStatus] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [page, setPage] = useState(1);

  const { data, isLoading } = useQuery({
    queryKey: ['attendance', 'list', { circleId, status, from, to, page }],
    queryFn: async () =>
      (
        await api.get<PaginatedResponse<AttendanceRecord>>('/attendance', {
          params: {
            page,
            limit: 30,
            circleId: circleId || undefined,
            status: status || undefined,
            from: from || undefined,
            to: to || undefined,
          },
        })
      ).data,
  });

  const { data: stats } = useQuery({
    queryKey: ['attendance', 'stats', { circleId, from, to }],
    queryFn: async () =>
      (
        await api.get('/attendance/stats', {
          params: { circleId: circleId || undefined, from: from || undefined, to: to || undefined },
        })
      ).data,
  });

  return (
    <>
      {stats && (
        <div className="mb-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
          <StatCard label="إجمالي السجلات" value={stats.total} tone="slate" />
          <StatCard label="نسبة الحضور" value={`${stats.attendanceRate}%`} tone="emerald" />
          <StatCard label="حاضر" value={stats.counts?.PRESENT ?? 0} tone="emerald" />
          <StatCard label="غياب بعذر" value={stats.counts?.EXCUSED ?? 0} tone="amber" />
          <StatCard label="غياب بدون عذر" value={stats.counts?.ABSENT ?? 0} tone="red" />
        </div>
      )}

      <Card className="mb-5">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Select
            label="الحلقة"
            value={circleId}
            onChange={(e) => {
              setCircleId(e.target.value);
              setPage(1);
            }}
          >
            <option value="">كل الحلقات</option>
            {circles.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
          <Select
            label="الحالة"
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setPage(1);
            }}
          >
            <option value="">كل الحالات</option>
            {Object.entries(ATTENDANCE_LABELS).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </Select>
          <Input label="من تاريخ" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          <Input label="إلى تاريخ" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
      </Card>

      <Card padded={false}>
        {isLoading ? (
          <LoadingState />
        ) : !data?.data.length ? (
          <EmptyState title="لا توجد سجلات حضور" icon={<IconClipboard size={24} />} />
        ) : (
          <>
            <div className="table-wrap border-0 shadow-none">
              <table className="table">
                <thead>
                  <tr>
                    <th>التاريخ</th>
                    <th>الطالب</th>
                    <th>الحلقة</th>
                    <th>الحالة</th>
                    <th>سبب العذر</th>
                    <th>سجّله</th>
                  </tr>
                </thead>
                <tbody>
                  {data.data.map((rec) => (
                    <tr key={rec.id}>
                      <td className="numeric">{formatDateShort(rec.date)}</td>
                      <td>
                        <Link to={`/students/${rec.student.id}`} className="font-semibold text-slate-700 hover:text-primary-700">
                          {rec.student.fullName}
                        </Link>
                      </td>
                      <td className="text-xs text-slate-500">{rec.circle.name}</td>
                      <td>
                        <Badge className={ATTENDANCE_COLORS[rec.status]}>{ATTENDANCE_SHORT[rec.status]}</Badge>
                      </td>
                      <td className="text-xs text-slate-500">{rec.note || '—'}</td>
                      <td className="text-xs text-slate-400">{rec.recordedBy?.fullName ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex items-center justify-between border-t border-slate-100 px-4 py-3">
              <p className="text-xs text-slate-500">
                صفحة <span className="numeric">{data.meta.page}</span> من{' '}
                <span className="numeric">{data.meta.totalPages}</span>
              </p>
              <div className="flex gap-2">
                <Button variant="secondary" size="sm" disabled={!data.meta.hasPreviousPage} onClick={() => setPage((p) => p - 1)}>
                  السابق
                </Button>
                <Button variant="secondary" size="sm" disabled={!data.meta.hasNextPage} onClick={() => setPage((p) => p + 1)}>
                  التالي
                </Button>
              </div>
            </div>
          </>
        )}
      </Card>
    </>
  );
}
