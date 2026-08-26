import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { api, apiError } from '@/lib/api';
import { formatDate } from '@/lib/format';
import { ATTENDANCE_LABELS, ROLE_COLORS, ROLE_LABELS } from '@/lib/labels';
import {
  Avatar,
  Badge,
  Button,
  Card,
  EmptyState,
  LoadingState,
  PageHeader,
  Select,
  StatCard,
  Tabs,
} from '@/components/ui';
import { IconCheck, IconClipboard, IconUsers } from '@/components/ui/Icons';
import type { AttendanceStatus, Role } from '@/types';

const STATUS_ORDER: AttendanceStatus[] = ['PRESENT', 'EXCUSED', 'ABSENT'];
const STAFF_ROLES: Role[] = ['ADMIN', 'SUPERVISOR', 'TEACHER', 'EXAM_COMMITTEE', 'SUPPORT'];

/**
 * Attendance for the staff, mirroring the students' register: one sheet per
 * day, three states, one submission that then moves into the history.
 */
export default function StaffAttendancePage() {
  const [tab, setTab] = useState('sheet');

  return (
    <div className="space-y-5">
      <PageHeader
        title="حضور الكادر"
        subtitle="تسجيل حضور وغياب المعلمين والمشرفين والإداريين"
        breadcrumb={
          <Link to="/staff" className="hover:text-primary-600">
            دليل الكادر
          </Link>
        }
      />

      <Tabs
        tabs={[
          { key: 'sheet', label: 'تسجيل الحضور' },
          { key: 'history', label: 'السجل' },
          { key: 'summary', label: 'ملخص لكل موظف' },
        ]}
        active={tab}
        onChange={setTab}
      />

      {tab === 'sheet' && <SheetTab />}
      {tab === 'history' && <HistoryTab />}
      {tab === 'summary' && <SummaryTab />}
    </div>
  );
}

// --- today's sheet ----------------------------------------------------------

function SheetTab() {
  const qc = useQueryClient();
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [role, setRole] = useState<Role | ''>('');
  const [entries, setEntries] = useState<Record<string, AttendanceStatus>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});

  const { data, isLoading } = useQuery({
    queryKey: ['staff-attendance', 'sheet', date, role],
    queryFn: async () =>
      (
        await api.get('/staff-attendance/sheet', {
          params: { date, role: role || undefined },
        })
      ).data,
  });

  const submit = useMutation({
    mutationFn: async () =>
      (
        await api.post('/staff-attendance', {
          date,
          entries: (data?.staff ?? []).map((s: any) => ({
            userId: s.id,
            status: entries[s.id] ?? 'PRESENT',
            note: notes[s.id] || undefined,
          })),
        })
      ).data,
    onSuccess: (res) => {
      toast.success(res.message ?? 'تم الحفظ');
      void qc.invalidateQueries({ queryKey: ['staff-attendance'] });
    },
    onError: (err) => toast.error(apiError(err, 'تعذر حفظ الحضور')),
  });

  if (isLoading) return <LoadingState />;

  const staff = data?.staff ?? [];

  return (
    <Card
      title={`كشف حضور ${formatDate(date)}`}
      action={
        <div className="flex gap-2">
          <Select value={role} onChange={(e) => setRole(e.target.value as Role | '')} className="w-40">
            <option value="">كل الأدوار</option>
            {STAFF_ROLES.map((r) => (
              <option key={r} value={r}>
                {ROLE_LABELS[r]}
              </option>
            ))}
          </Select>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="input w-auto"
          />
        </div>
      }
      padded={false}
    >
      {staff.length === 0 ? (
        <EmptyState icon={<IconUsers size={28} />} title="لا يوجد كادر" />
      ) : !data?.canSubmit ? (
        <div className="p-6 text-center">
          <span className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-full bg-emerald-100 text-emerald-700">
            <IconCheck size={22} />
          </span>
          <p className="font-bold text-slate-800">تم تسجيل حضور الكادر لهذا اليوم</p>
          <p className="mt-1 text-sm text-slate-500">
            سجّله {data?.submittedBy?.fullName ?? '—'}. راجعه من تبويب السجل.
          </p>
        </div>
      ) : (
        <>
          <div className="divide-y divide-slate-100">
            {staff.map((person: any) => (
              <div key={person.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
                <Avatar name={person.fullName} src={person.avatarUrl} size={34} preview />
                <div className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-slate-700">
                    {person.fullName}
                  </span>
                  <span className="text-xs text-slate-400">
                    {person.jobTitle ?? ROLE_LABELS[person.role as Role]}
                  </span>
                </div>
                <div className="flex gap-1.5">
                  {STATUS_ORDER.map((status) => {
                    const active = (entries[person.id] ?? 'PRESENT') === status;
                    return (
                      <button
                        key={status}
                        type="button"
                        onClick={() => setEntries((e) => ({ ...e, [person.id]: status }))}
                        className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                          active
                            ? status === 'PRESENT'
                              ? 'bg-emerald-600 text-white'
                              : status === 'EXCUSED'
                                ? 'bg-amber-500 text-white'
                                : 'bg-red-600 text-white'
                            : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                        }`}
                      >
                        {ATTENDANCE_LABELS[status]}
                      </button>
                    );
                  })}
                </div>
                {entries[person.id] === 'EXCUSED' && (
                  <input
                    className="input w-full sm:w-56"
                    placeholder="سبب العذر"
                    value={notes[person.id] ?? ''}
                    onChange={(e) => setNotes((n) => ({ ...n, [person.id]: e.target.value }))}
                  />
                )}
              </div>
            ))}
          </div>
          <div className="flex justify-end border-t border-slate-100 px-5 py-3">
            <Button loading={submit.isPending} onClick={() => submit.mutate()}>
              حفظ الحضور
            </Button>
          </div>
        </>
      )}
    </Card>
  );
}

// --- history ----------------------------------------------------------------

function HistoryTab() {
  const [openDate, setOpenDate] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['staff-attendance', 'history'],
    queryFn: async () => (await api.get('/staff-attendance/history', { params: { limit: 30 } })).data,
  });

  const { data: detail } = useQuery({
    queryKey: ['staff-attendance', 'history', openDate],
    queryFn: async () => (await api.get(`/staff-attendance/history/${openDate}`)).data,
    enabled: !!openDate,
  });

  if (isLoading) return <LoadingState />;
  const days = data?.data ?? [];
  if (!days.length) return <EmptyState icon={<IconClipboard size={28} />} title="لا يوجد سجل بعد" />;

  return (
    <Card title="سجل حضور الكادر" subtitle="مرتّب حسب التاريخ" padded={false}>
      <div className="divide-y divide-slate-100">
        {days.map((day: any) => (
          <div key={day.date}>
            <button
              type="button"
              onClick={() => setOpenDate(openDate === day.date ? null : day.date)}
              className="flex w-full items-center justify-between px-5 py-3 text-right transition hover:bg-slate-50"
            >
              <span className="font-semibold text-slate-700">{formatDate(day.date)}</span>
              <span className="flex items-center gap-3 text-xs">
                <span className="numeric text-emerald-700">حاضر {day.present}</span>
                <span className="numeric text-amber-700">بعذر {day.excused}</span>
                <span className="numeric text-red-700">غائب {day.absent}</span>
                <Badge className="bg-slate-100 text-slate-600">
                  <span className="numeric">{day.attendanceRate}%</span>
                </Badge>
              </span>
            </button>

            {openDate === day.date && detail && (
              <div className="bg-slate-50/60 px-5 py-3">
                <ul className="space-y-1.5 text-sm">
                  {detail.records.map((r: any) => (
                    <li key={r.id} className="flex items-center justify-between gap-3">
                      <span className="flex items-center gap-2 text-slate-700">
                        {r.user.fullName}
                        <Badge className={ROLE_COLORS[r.user.role as Role]}>
                          {ROLE_LABELS[r.user.role as Role]}
                        </Badge>
                      </span>
                      <Badge
                        className={
                          r.status === 'PRESENT'
                            ? 'bg-emerald-100 text-emerald-800'
                            : r.status === 'EXCUSED'
                              ? 'bg-amber-100 text-amber-800'
                              : 'bg-red-100 text-red-800'
                        }
                      >
                        {ATTENDANCE_LABELS[r.status as AttendanceStatus]}
                      </Badge>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        ))}
      </div>
    </Card>
  );
}

// --- per-person summary -----------------------------------------------------

function SummaryTab() {
  const { data, isLoading } = useQuery({
    queryKey: ['staff-attendance', 'summary'],
    queryFn: async () => (await api.get('/staff-attendance/summary')).data,
  });

  if (isLoading) return <LoadingState />;
  const rows = (data ?? []) as any[];
  if (!rows.length) return <EmptyState icon={<IconUsers size={28} />} title="لا توجد بيانات" />;

  return (
    <Card title="ملخص حضور كل موظف" padded={false}>
      <div className="overflow-x-auto">
        <table className="table">
          <thead>
            <tr>
              <th>الموظف</th>
              <th>الدور</th>
              <th>حاضر</th>
              <th>بعذر</th>
              <th>بدون عذر</th>
              <th>نسبة الحضور</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td>
                  <span className="font-semibold text-slate-700">{r.fullName}</span>
                  {r.jobTitle && <span className="block text-xs text-slate-400">{r.jobTitle}</span>}
                </td>
                <td>
                  <Badge className={ROLE_COLORS[r.role as Role]}>{ROLE_LABELS[r.role as Role]}</Badge>
                </td>
                <td className="numeric text-emerald-700">{r.present}</td>
                <td className="numeric text-amber-700">{r.excused}</td>
                <td className="numeric text-red-700">{r.absent}</td>
                <td>
                  <Badge
                    className={
                      r.attendanceRate >= 90
                        ? 'bg-emerald-100 text-emerald-800'
                        : r.attendanceRate >= 75
                          ? 'bg-amber-100 text-amber-800'
                          : 'bg-red-100 text-red-800'
                    }
                  >
                    <span className="numeric">{r.attendanceRate}%</span>
                  </Badge>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
