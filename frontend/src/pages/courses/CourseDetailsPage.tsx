import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { api, apiError } from '@/lib/api';
import { useAuthStore } from '@/store/auth';
import { useDebounce } from '@/hooks/useDebounce';
import { formatDate } from '@/lib/format';
import {
  ATTENDANCE_LABELS,
  COURSE_TYPE_COLORS,
  COURSE_TYPE_LABELS,
  WEEKDAY_LABELS,
} from '@/lib/labels';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorState,
  LoadingState,
  Modal,
  PageHeader,
  SearchInput,
  StatCard,
  Tabs,
  useConfirm,
} from '@/components/ui';
import { IconBook, IconCheck, IconClipboard, IconPlus, IconTrash, IconUsers } from '@/components/ui/Icons';
import type { AttendanceStatus, Course, PaginatedResponse, Student } from '@/types';

const STATUS_ORDER: AttendanceStatus[] = ['PRESENT', 'EXCUSED', 'ABSENT'];

export default function CourseDetailsPage() {
  const { id = '' } = useParams();
  const [tab, setTab] = useState('students');
  const canManage = useAuthStore((s) => s.hasRole('ADMIN', 'SUPERVISOR'));

  const { data: course, isLoading, error, refetch } = useQuery({
    queryKey: ['courses', id],
    queryFn: async () => (await api.get<Course>(`/courses/${id}`)).data,
    enabled: !!id,
  });

  if (isLoading) return <LoadingState />;
  if (error) return <ErrorState message={apiError(error, 'تعذر تحميل الدورة')} onRetry={refetch} />;
  if (!course) return null;

  const current = (course.students ?? []).filter((s) => s.isCurrent);

  return (
    <div className="space-y-5">
      <PageHeader
        title={course.name}
        subtitle={course.description ?? undefined}
        breadcrumb={
          <Link to="/courses" className="hover:text-primary-600">
            الدورات التعليمية
          </Link>
        }
        action={
          <Badge className={COURSE_TYPE_COLORS[course.type]}>{COURSE_TYPE_LABELS[course.type]}</Badge>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="الطلاب المسجلون"
          value={`${current.length} / ${course.capacity}`}
          icon={<IconUsers size={20} />}
        />
        <StatCard
          label="المحاضر"
          value={course.instructor?.fullName ?? course.instructorName ?? '—'}
          icon={<IconBook size={20} />}
          tone="sky"
        />
        <StatCard
          label="أيام الدورة"
          value={
            course.scheduleDays.length
              ? course.scheduleDays.map((d) => WEEKDAY_LABELS[d] ?? d).join('، ')
              : '—'
          }
          icon={<IconClipboard size={20} />}
          tone="purple"
          hint={course.startTime ? `${course.startTime} - ${course.endTime ?? ''}` : undefined}
        />
        <StatCard
          label="الفترة"
          value={course.startDate ? formatDate(course.startDate) : '—'}
          icon={<IconClipboard size={20} />}
          tone="amber"
          hint={course.endDate ? `حتى ${formatDate(course.endDate)}` : undefined}
        />
      </div>

      <Tabs
        tabs={[
          { key: 'students', label: `الطلاب (${current.length})` },
          { key: 'attendance', label: 'تسجيل الحضور' },
          { key: 'history', label: 'سجل الحضور' },
        ]}
        active={tab}
        onChange={setTab}
      />

      {tab === 'students' && <StudentsTab course={course} canManage={canManage} />}
      {tab === 'attendance' && <AttendanceTab courseId={course.id} />}
      {tab === 'history' && <HistoryTab courseId={course.id} />}
    </div>
  );
}

// --- students ---------------------------------------------------------------

function StudentsTab({ course, canManage }: { course: Course; canManage: boolean }) {
  const qc = useQueryClient();
  const confirm = useConfirm();
  const [enrollOpen, setEnrollOpen] = useState(false);

  const unenroll = useMutation({
    mutationFn: async (studentId: string) =>
      (await api.delete(`/courses/${course.id}/students/${studentId}`)).data,
    onSuccess: () => {
      toast.success('تم إنهاء تسجيل الطالب');
      void qc.invalidateQueries({ queryKey: ['courses', course.id] });
    },
    onError: (err) => toast.error(apiError(err, 'تعذر إنهاء التسجيل')),
  });

  const students = course.students ?? [];
  const current = students.filter((s) => s.isCurrent);
  const past = students.filter((s) => !s.isCurrent);

  return (
    <div className="space-y-4">
      <Card
        title="الطلاب المسجلون"
        subtitle="ملف الطالب في الدورة: الاسم، الهوية، الجوال، تاريخ الميلاد"
        action={
          canManage && (
            <Button size="sm" onClick={() => setEnrollOpen(true)}>
              <IconPlus size={15} /> تسجيل طلاب
            </Button>
          )
        }
        padded={false}
      >
        {current.length === 0 ? (
          <EmptyState
            icon={<IconUsers size={28} />}
            title="لا يوجد طلاب"
            message="سجّل طلاباً في هذه الدورة لبدء متابعة حضورهم."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="table">
              <thead>
                <tr>
                  <th>الطالب</th>
                  <th>رقم الهوية</th>
                  <th>الجوال</th>
                  <th>تاريخ الميلاد</th>
                  <th>تاريخ التسجيل</th>
                  {canManage && <th className="w-20"></th>}
                </tr>
              </thead>
              <tbody>
                {current.map((s) => (
                  <tr key={s.enrollmentId}>
                    <td>
                      <Link to={`/students/${s.id}`} className="font-semibold hover:text-primary-700">
                        {s.fullName}
                      </Link>
                      <span className="numeric block text-xs text-slate-400">{s.code}</span>
                    </td>
                    <td className="numeric">{s.nationalId ?? '—'}</td>
                    <td className="numeric">{s.phone ?? s.guardianPhone ?? '—'}</td>
                    <td>{s.birthDate ? formatDate(s.birthDate) : '—'}</td>
                    <td>{formatDate(s.enrolledAt)}</td>
                    {canManage && (
                      <td>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-red-600"
                          onClick={async () => {
                            const yes = await confirm({
                              title: 'إنهاء التسجيل',
                              message: `سيتم إنهاء تسجيل ${s.fullName} في هذه الدورة، مع بقائه في سجل الدورات السابقة.`,
                              confirmLabel: 'إنهاء',
                              variant: 'danger',
                            });
                            if (yes) unenroll.mutate(s.id);
                          }}
                        >
                          <IconTrash size={14} />
                        </Button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {past.length > 0 && (
        <Card title="طلاب سابقون" subtitle="أنهوا تسجيلهم في هذه الدورة">
          <ul className="space-y-2 text-sm">
            {past.map((s) => (
              <li key={s.enrollmentId} className="flex items-center justify-between">
                <Link to={`/students/${s.id}`} className="hover:text-primary-700">
                  {s.fullName}
                </Link>
                <span className="text-xs text-slate-400">
                  حتى {s.endedAt ? formatDate(s.endedAt) : '—'}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <EnrollModal courseId={course.id} open={enrollOpen} onClose={() => setEnrollOpen(false)} />
    </div>
  );
}

function EnrollModal({
  courseId,
  open,
  onClose,
}: {
  courseId: string;
  open: boolean;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [picked, setPicked] = useState<string[]>([]);
  const debounced = useDebounce(search, 350);

  const { data } = useQuery({
    queryKey: ['students', 'enrollable', debounced],
    queryFn: async () =>
      (
        await api.get<PaginatedResponse<Student>>('/students', {
          params: { search: debounced || undefined, limit: 30 },
        })
      ).data,
    enabled: open,
  });

  const enroll = useMutation({
    mutationFn: async () =>
      (await api.post(`/courses/${courseId}/students`, { studentIds: picked })).data,
    onSuccess: (res) => {
      toast.success(res.message ?? 'تم التسجيل');
      setPicked([]);
      setSearch('');
      void qc.invalidateQueries({ queryKey: ['courses', courseId] });
      onClose();
    },
    onError: (err) => toast.error(apiError(err, 'تعذر تسجيل الطلاب')),
  });

  return (
    <Modal open={open} onClose={onClose} title="تسجيل طلاب في الدورة" size="lg">
      <div className="space-y-4">
        <p className="text-sm text-slate-500">
          يمكن تسجيل أي طالب في السجل الموحّد، سواء كان في حلقة تحفيظ أو في الدورات فقط.
        </p>
        <SearchInput value={search} onChange={setSearch} placeholder="ابحث بالاسم أو رقم الطالب..." />

        <div className="max-h-72 space-y-1.5 overflow-y-auto rounded-xl border border-slate-100 p-2">
          {(data?.data ?? []).map((s) => (
            <label
              key={s.id}
              className="flex cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 hover:bg-slate-50"
            >
              <input
                type="checkbox"
                className="checkbox"
                checked={picked.includes(s.id)}
                onChange={() =>
                  setPicked((p) => (p.includes(s.id) ? p.filter((x) => x !== s.id) : [...p, s.id]))
                }
              />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold text-slate-700">{s.fullName}</span>
                <span className="numeric block text-xs text-slate-400">
                  {s.code}
                  {s.circle ? ` — ${s.circle.name}` : ' — بدون حلقة'}
                </span>
              </span>
            </label>
          ))}
          {(data?.data ?? []).length === 0 && (
            <p className="px-3 py-6 text-center text-sm text-slate-400">لا توجد نتائج</p>
          )}
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            إلغاء
          </Button>
          <Button
            disabled={picked.length === 0}
            loading={enroll.isPending}
            onClick={() => enroll.mutate()}
          >
            تسجيل {picked.length ? `(${picked.length})` : ''}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

// --- attendance -------------------------------------------------------------

function AttendanceTab({ courseId }: { courseId: string }) {
  const qc = useQueryClient();
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [entries, setEntries] = useState<Record<string, AttendanceStatus>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});

  const { data, isLoading } = useQuery({
    queryKey: ['courses', courseId, 'sheet', date],
    queryFn: async () =>
      (await api.get(`/courses/${courseId}/attendance/sheet`, { params: { date } })).data,
  });

  const submit = useMutation({
    mutationFn: async () =>
      (
        await api.post(`/courses/${courseId}/attendance`, {
          date,
          entries: (data?.students ?? []).map((s: any) => ({
            studentId: s.id,
            status: entries[s.id] ?? 'PRESENT',
            note: notes[s.id] || undefined,
          })),
        })
      ).data,
    onSuccess: (res) => {
      toast.success(res.message ?? 'تم الحفظ');
      void qc.invalidateQueries({ queryKey: ['courses', courseId] });
    },
    onError: (err) => toast.error(apiError(err, 'تعذر حفظ الحضور')),
  });

  if (isLoading) return <LoadingState />;

  const students = data?.students ?? [];

  return (
    <Card
      title="تسجيل حضور الدورة"
      subtitle="سجل مستقل تماماً عن حضور حلقات التحفيظ"
      action={
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="input w-auto"
        />
      }
      padded={false}
    >
      {students.length === 0 ? (
        <EmptyState icon={<IconUsers size={28} />} title="لا يوجد طلاب مسجلون" />
      ) : !data?.canSubmit ? (
        <div className="p-6 text-center">
          <span className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-full bg-emerald-100 text-emerald-700">
            <IconCheck size={22} />
          </span>
          <p className="font-bold text-slate-800">تم تسجيل الحضور لهذا اليوم</p>
          <p className="mt-1 text-sm text-slate-500">
            سجّله {data?.submittedBy?.fullName ?? '—'}. يمكنك مراجعته من تبويب سجل الحضور.
          </p>
        </div>
      ) : (
        <>
          <div className="divide-y divide-slate-100">
            {students.map((s: any) => (
              <div key={s.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
                <div className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-slate-700">
                    {s.fullName}
                  </span>
                  <span className="numeric text-xs text-slate-400">{s.code}</span>
                </div>
                <div className="flex gap-1.5">
                  {STATUS_ORDER.map((status) => {
                    const active = (entries[s.id] ?? 'PRESENT') === status;
                    return (
                      <button
                        key={status}
                        type="button"
                        onClick={() => setEntries((e) => ({ ...e, [s.id]: status }))}
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
                {entries[s.id] === 'EXCUSED' && (
                  <input
                    className="input w-full sm:w-56"
                    placeholder="سبب العذر"
                    value={notes[s.id] ?? ''}
                    onChange={(e) => setNotes((n) => ({ ...n, [s.id]: e.target.value }))}
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

function HistoryTab({ courseId }: { courseId: string }) {
  const [openDate, setOpenDate] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['courses', courseId, 'history'],
    queryFn: async () => (await api.get(`/courses/${courseId}/attendance/history`)).data,
  });

  const { data: detail } = useQuery({
    queryKey: ['courses', courseId, 'history', openDate],
    queryFn: async () => (await api.get(`/courses/${courseId}/attendance/${openDate}`)).data,
    enabled: !!openDate,
  });

  if (isLoading) return <LoadingState />;
  if (!data?.length) {
    return <EmptyState icon={<IconClipboard size={28} />} title="لا يوجد سجل حضور بعد" />;
  }

  return (
    <Card title="سجل حضور الدورة" subtitle="مرتّب حسب التاريخ" padded={false}>
      <div className="divide-y divide-slate-100">
        {data.map((day: any) => (
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
                    <li key={r.id} className="flex items-center justify-between">
                      <span className="text-slate-700">{r.student.fullName}</span>
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
