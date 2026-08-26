import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { api, apiError } from '@/lib/api';
import { useAuthStore } from '@/store/auth';
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
  Pagination,
  Tabs,
  cx,
} from '@/components/ui';
import { IconCalendar, IconCheck, IconClipboard } from '@/components/ui/Icons';
import {
  ATTENDANCE_ACTIVE,
  ATTENDANCE_COLORS,
  ATTENDANCE_LABELS,
  ATTENDANCE_ORDER,
  ATTENDANCE_SHORT,
} from '@/lib/labels';
import { formatDate, formatDateShort, formatDateTime, todayInput } from '@/lib/format';
import type {
  AttendanceDaySummary,
  AttendanceRecord,
  AttendanceSheet,
  AttendanceStatus,
  Circle,
  PaginatedResponse,
} from '@/types';

type Draft = Record<string, { status: AttendanceStatus; note?: string }>;

export default function AttendancePage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const queryClient = useQueryClient();

  const [tab, setTab] = useState('record');
  const [circleId, setCircleId] = useState(searchParams.get('circleId') ?? '');
  const [date, setDate] = useState(todayInput());
  const [draft, setDraft] = useState<Draft>({});
  /** Set the moment a sheet is saved, so the confirmation shows before the refetch lands. */
  const [justSaved, setJustSaved] = useState<{ circleId: string; date: string } | null>(null);

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

  // The confirmation belongs to one circle on one day; picking another sheet
  // puts the form back.
  useEffect(() => {
    setJustSaved((prev) => (prev && (prev.circleId !== circleId || prev.date !== date) ? null : prev));
  }, [circleId, date]);

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
      toast.success(res.data?.message ?? 'تم حفظ كشف الحضور لهذا اليوم');
      setJustSaved({ circleId, date });
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

  /**
   * Saving closes the day. The form is not shown again — the sheet moves to the
   * history, where any single student can still be corrected — so "already
   * recorded" is the whole condition, for every role.
   */
  const submitted =
    (!!sheet && sheet.alreadyRecorded) ||
    (justSaved?.circleId === circleId && justSaved?.date === date);

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
              {!submitted && (
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
          ) : submitted ? (
            /* The saved sheet is gone from this screen entirely — this is the
               receipt, and the record itself is now in the history tab. */
            <Card>
              <div className="flex flex-col items-center gap-3 px-4 py-10 text-center">
                <span className="grid h-14 w-14 place-items-center rounded-2xl bg-emerald-100 text-emerald-700">
                  <IconCheck size={28} />
                </span>
                <h3 className="text-lg font-extrabold text-slate-800">
                  تم حفظ كشف الحضور لهذا اليوم
                </h3>
                <p className="max-w-md text-sm leading-7 text-slate-500">
                  حُفظ كشف حضور <span className="font-bold text-slate-700">{sheet?.circle?.name}</span> بتاريخ{' '}
                  <span className="numeric font-bold text-slate-700">{formatDate(date)}</span>
                  {sheet?.submittedBy ? ` بواسطة ${sheet.submittedBy.fullName}` : ''}.
                  <br />
                  انتقل إلى سجل الحضور لتعديل حضور أي طالب.
                </p>
                <div className="mt-1 flex flex-wrap justify-center gap-2">
                  <Button icon={<IconCalendar size={17} />} onClick={() => setTab('history')}>
                    فتح سجل الحضور
                  </Button>
                  <Button variant="secondary" onClick={() => setDate(todayInput())}>
                    كشف آخر
                  </Button>
                </div>
              </div>
            </Card>
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

              <Card
                title={`كشف حضور ${sheet.circle.name}`}
                subtitle="لم يُسجل الحضور لهذا التاريخ بعد — يُحفظ الكشف مرة واحدة ثم ينتقل إلى السجل"
                action={
                  <Button onClick={() => save.mutate()} loading={save.isPending}>
                    حفظ الكشف
                  </Button>
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

                        <StatusPicker
                          value={entry.status}
                          onChange={(status) =>
                            setDraft((prev) => ({ ...prev, [student.id]: { ...prev[student.id], status } }))
                          }
                        />

                        {entry.status === 'EXCUSED' && (
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
                        )}
                      </li>
                    );
                  })}
                </ul>
                <div className="border-t border-slate-100 px-5 py-4 text-left">
                  <Button onClick={() => save.mutate()} loading={save.isPending} icon={<IconCheck size={17} />}>
                    حفظ الكشف
                  </Button>
                </div>
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

/** The three-state control shared by the sheet and by a correction in the history. */
function StatusPicker({
  value,
  onChange,
  size = 'md',
}: {
  value: AttendanceStatus;
  onChange: (status: AttendanceStatus) => void;
  size?: 'md' | 'sm';
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {ATTENDANCE_ORDER.map((status) => (
        <button
          key={status}
          type="button"
          onClick={() => onChange(status)}
          className={cx(
            'rounded-lg border font-bold transition',
            size === 'sm' ? 'px-2.5 py-1 text-[11px]' : 'px-3 py-1.5 text-xs',
            value === status
              ? ATTENDANCE_ACTIVE[status]
              : 'border-slate-200 bg-white text-slate-500 hover:bg-slate-50',
          )}
        >
          {size === 'sm' ? ATTENDANCE_SHORT[status] : ATTENDANCE_LABELS[status]}
        </button>
      ))}
    </div>
  );
}

/**
 * Attendance history, read the way the administration actually reads it: by day
 * first, then by circle, then by student.
 *
 * Once a day is submitted it disappears from the "record attendance" tab and
 * turns up here — "سجل حضور 21 أغسطس" listing every circle, each of which opens
 * into the individual students behind it.
 */
function AttendanceHistory({ circles }: { circles: Pick<Circle, 'id' | 'name' | 'code'>[] }) {
  const queryClient = useQueryClient();
  const canEdit = useAuthStore((s) => s.hasRole('ADMIN', 'SUPERVISOR', 'TEACHER'));
  const [circleId, setCircleId] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [page, setPage] = useState(1);
  const [openDay, setOpenDay] = useState<string | null>(null);
  const [openCircle, setOpenCircle] = useState<{ date: string; circleId: string } | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['attendance', 'history', { circleId, from, to, page }],
    queryFn: async () =>
      (
        await api.get<PaginatedResponse<AttendanceDaySummary>>('/attendance/history', {
          params: {
            page,
            limit: 15,
            circleId: circleId || undefined,
            from: from || undefined,
            to: to || undefined,
          },
        })
      ).data,
  });

  const { data: detail, isFetching: loadingDetail } = useQuery({
    queryKey: ['attendance', 'history', openCircle?.date, openCircle?.circleId],
    queryFn: async () =>
      (await api.get(`/attendance/history/${openCircle!.date}/${openCircle!.circleId}`)).data,
    enabled: !!openCircle,
  });

  // A correction is made one student at a time - the sheet itself is closed
  // once it has been submitted.
  const correct = useMutation({
    mutationFn: ({ id, status, note }: { id: string; status: AttendanceStatus; note?: string }) =>
      api.patch(`/attendance/${id}`, { status, note }),
    onSuccess: (res) => {
      toast.success(res.data?.message ?? 'تم تحديث سجل الطالب');
      queryClient.invalidateQueries({ queryKey: ['attendance'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    },
    onError: (error) => toast.error(apiError(error)),
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

  const days = data?.data ?? [];

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
        <div className="grid gap-3 sm:grid-cols-3">
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
          <Input
            label="من تاريخ"
            type="date"
            value={from}
            onChange={(e) => {
              setFrom(e.target.value);
              setPage(1);
            }}
          />
          <Input
            label="إلى تاريخ"
            type="date"
            value={to}
            onChange={(e) => {
              setTo(e.target.value);
              setPage(1);
            }}
          />
        </div>
      </Card>

      <Card padded={false}>
        {isLoading ? (
          <LoadingState />
        ) : days.length === 0 ? (
          <EmptyState
            title="لا توجد سجلات حضور"
            message="بمجرد حفظ كشف حضور، ينتقل تلقائياً إلى هذا السجل."
            icon={<IconClipboard size={24} />}
          />
        ) : (
          <>
            <div className="divide-y divide-slate-100">
              {days.map((day) => {
                const expanded = openDay === day.date;
                return (
                  <div key={day.date}>
                    {/* Level 1 — the day */}
                    <button
                      type="button"
                      onClick={() => {
                        setOpenDay(expanded ? null : day.date);
                        setOpenCircle(null);
                      }}
                      className="flex w-full flex-wrap items-center justify-between gap-3 px-5 py-4 text-right transition hover:bg-slate-50"
                    >
                      <div className="flex items-center gap-3">
                        <span
                          className={cx(
                            'grid h-9 w-9 shrink-0 place-items-center rounded-xl transition',
                            expanded ? 'bg-primary-600 text-white' : 'bg-slate-100 text-slate-500',
                          )}
                        >
                          <IconCalendar size={17} />
                        </span>
                        <div>
                          <p className="font-bold text-slate-800">سجل حضور {formatDate(day.date)}</p>
                          <p className="numeric text-xs text-slate-400">
                            {day.circlesCount} حلقة — {day.total} طالب
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2.5 text-xs">
                        <span className="numeric text-emerald-700">حاضر {day.present}</span>
                        <span className="numeric text-amber-700">بعذر {day.excused}</span>
                        <span className="numeric text-red-700">غائب {day.absent}</span>
                        <Badge
                          className={
                            day.attendanceRate >= 80
                              ? 'bg-emerald-100 text-emerald-800'
                              : day.attendanceRate >= 60
                                ? 'bg-amber-100 text-amber-800'
                                : 'bg-red-100 text-red-800'
                          }
                        >
                          <span className="numeric">{day.attendanceRate}%</span>
                        </Badge>
                      </div>
                    </button>

                    {/* Level 2 — the circles of that day */}
                    {expanded && (
                      <div className="bg-slate-50/60 px-5 pb-4">
                        <ul className="space-y-2">
                          {day.circles.map((row) => {
                            const isOpen =
                              openCircle?.date === day.date && openCircle?.circleId === row.circle.id;
                            return (
                              <li key={row.circle.id} className="overflow-hidden rounded-xl bg-white ring-1 ring-slate-200">
                                <button
                                  type="button"
                                  onClick={() =>
                                    setOpenCircle(
                                      isOpen ? null : { date: day.date, circleId: row.circle.id },
                                    )
                                  }
                                  className="flex w-full flex-wrap items-center justify-between gap-3 px-4 py-3 text-right transition hover:bg-slate-50"
                                >
                                  <div>
                                    <p className="font-semibold text-slate-700">{row.circle.name}</p>
                                    <p className="text-[11px] text-slate-400">
                                      سجّله {row.submittedBy?.fullName ?? '—'}
                                    </p>
                                  </div>
                                  <div className="flex items-center gap-2.5 text-xs">
                                    <span className="numeric text-emerald-700">{row.present}</span>
                                    <span className="text-slate-300">/</span>
                                    <span className="numeric text-amber-700">{row.excused}</span>
                                    <span className="text-slate-300">/</span>
                                    <span className="numeric text-red-700">{row.absent}</span>
                                    <Badge className="bg-slate-100 text-slate-600">
                                      <span className="numeric">{row.attendanceRate}%</span>
                                    </Badge>
                                  </div>
                                </button>

                                {/* Level 3 — the students of that circle */}
                                {isOpen && (
                                  <div className="border-t border-slate-100 px-4 py-3">
                                    {loadingDetail ? (
                                      <LoadingState rows={3} />
                                    ) : (
                                      <ul className="space-y-1.5">
                                        {(detail?.records ?? []).map((rec: AttendanceRecord) => (
                                          <li
                                            key={rec.id}
                                            className="flex flex-wrap items-center justify-between gap-2 text-sm"
                                          >
                                            <Link
                                              to={`/students/${rec.student.id}`}
                                              className="text-slate-700 hover:text-primary-700"
                                            >
                                              {rec.student.fullName}
                                              <span className="numeric mr-2 text-[11px] text-slate-400">
                                                {rec.student.code}
                                              </span>
                                            </Link>
                                            <span className="flex items-center gap-2">
                                              {rec.note && (
                                                <span className="text-[11px] text-slate-400">{rec.note}</span>
                                              )}
                                              {canEdit ? (
                                                /* This is where a recorded day is corrected: the
                                                   sheet closes on save, the record stays editable. */
                                                <StatusPicker
                                                  size="sm"
                                                  value={rec.status}
                                                  onChange={(status) => {
                                                    if (status === rec.status) return;
                                                    const note =
                                                      status === 'EXCUSED'
                                                        ? window.prompt(
                                                            'سبب العذر (اختياري)',
                                                            rec.note ?? '',
                                                          ) ?? undefined
                                                        : undefined;
                                                    correct.mutate({ id: rec.id, status, note });
                                                  }}
                                                />
                                              ) : (
                                                <Badge className={ATTENDANCE_COLORS[rec.status]}>
                                                  {ATTENDANCE_SHORT[rec.status]}
                                                </Badge>
                                              )}
                                            </span>
                                          </li>
                                        ))}
                                      </ul>
                                    )}
                                  </div>
                                )}
                              </li>
                            );
                          })}
                        </ul>
                      </div>
                    )}
                  </div>
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
      </Card>
    </>
  );
}
