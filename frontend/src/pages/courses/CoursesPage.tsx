import { FormEvent, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { api, apiError } from '@/lib/api';
import { useAuthStore } from '@/store/auth';
import { useDebounce } from '@/hooks/useDebounce';
import { useBulkSelect } from '@/hooks/useBulkSelect';
import { BulkBar } from '@/components/BulkBar';
import { formatDate } from '@/lib/format';
import { COURSE_TYPE_COLORS, COURSE_TYPE_LABELS, WEEKDAY_LABELS } from '@/lib/labels';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorState,
  Input,
  LoadingState,
  Modal,
  PageHeader,
  Pagination,
  SearchInput,
  Select,
  StatCard,
  Textarea,
  useConfirm,
} from '@/components/ui';
import { IconBook, IconPlus, IconTrash, IconUsers } from '@/components/ui/Icons';
import type { Course, CourseType, PaginatedResponse, StaffMember } from '@/types';

const WEEKDAYS = ['SATURDAY', 'SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY'];

/**
 * Educational courses — a track of its own, listed and managed separately from
 * the memorization circles. A course carries its own lecturer, schedule,
 * enrolments and attendance register.
 */
export default function CoursesPage() {
  const qc = useQueryClient();
  const confirm = useConfirm();
  const canManage = useAuthStore((s) => s.hasRole('ADMIN', 'SUPERVISOR'));
  const isAdmin = useAuthStore((s) => s.hasRole('ADMIN'));

  const [search, setSearch] = useState('');
  const [type, setType] = useState<CourseType | ''>('');
  const [page, setPage] = useState(1);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Course | null>(null);

  const debounced = useDebounce(search, 350);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['courses', { debounced, type, page }],
    queryFn: async () =>
      (
        await api.get<PaginatedResponse<Course>>('/courses', {
          params: { search: debounced || undefined, type: type || undefined, page, limit: 12 },
        })
      ).data,
  });

  const { data: stats } = useQuery({
    queryKey: ['courses', 'stats'],
    queryFn: async () => (await api.get('/courses/stats')).data,
    enabled: canManage,
  });

  const remove = useMutation({
    mutationFn: async (id: string) => (await api.delete(`/courses/${id}`)).data,
    onSuccess: () => {
      toast.success('تم حذف الدورة');
      void qc.invalidateQueries({ queryKey: ['courses'] });
    },
    onError: (err) => toast.error(apiError(err, 'تعذر حذف الدورة')),
  });

  const removeMany = useMutation({
    mutationFn: async (ids: string[]) => (await api.post('/courses/bulk-delete', { ids })).data,
    onSuccess: (res) => {
      toast.success(res.message ?? 'تم الحذف');
      bulk.cancel();
      void qc.invalidateQueries({ queryKey: ['courses'] });
    },
    onError: (err) => toast.error(apiError(err, 'تعذر الحذف')),
  });

  const courses = data?.data ?? [];
  // Selection is opt-in, so a card only grows a checkbox when it is needed.
  const bulk = useBulkSelect(courses);
  const { selected } = bulk;

  return (
    <div className="space-y-5">
      <PageHeader
        title="الدورات التعليمية"
        subtitle="دورات شرعية وأحكام التجويد — مستقلة تماماً عن حلقات التحفيظ"
        action={
          <div className="flex flex-wrap gap-2">
            {isAdmin && !bulk.active && (
              <Button variant="secondary" onClick={bulk.enable}>
                <IconTrash size={16} /> حذف جماعي
              </Button>
            )}
            {canManage && (
              <Button
                onClick={() => {
                  setEditing(null);
                  setFormOpen(true);
                }}
              >
                <IconPlus size={16} /> إضافة دورة
              </Button>
            )}
          </div>
        }
      />

      {stats && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="إجمالي الدورات" value={stats.total} icon={<IconBook size={20} />} />
          <StatCard label="الدورات النشطة" value={stats.active} icon={<IconBook size={20} />} />
          <StatCard label="الطلاب المسجلون" value={stats.enrolledStudents} icon={<IconUsers size={20} />} />
          <StatCard
            label="دورات شرعية / تجويد"
            value={`${stats.byType?.find((t: any) => t.type === 'SHARIA')?.count ?? 0} / ${
              stats.byType?.find((t: any) => t.type === 'TAJWEED')?.count ?? 0
            }`}
            icon={<IconBook size={20} />}
          />
        </div>
      )}

      {bulk.active && (
        <BulkBar
          count={bulk.count}
          noun="دورة"
          allSelected={bulk.allSelected}
          onToggleAll={bulk.toggleAll}
          onCancel={bulk.cancel}
          deleting={removeMany.isPending}
          onDelete={async () => {
            const yes = await confirm({
              title: 'حذف الدورات المحددة',
              message: `سيتم حذف ${bulk.count} دورة. هل أنت متأكد؟`,
              confirmLabel: 'حذف',
              variant: 'danger',
            });
            if (yes) removeMany.mutate(selected);
          }}
        />
      )}

      <Card>
        <div className="flex flex-wrap items-end gap-3">
          <SearchInput
            value={search}
            onChange={(v) => {
              setSearch(v);
              setPage(1);
            }}
            placeholder="ابحث باسم الدورة أو رمزها أو المحاضر..."
            className="min-w-[240px] flex-1"
          />
          <Select
            label="النوع"
            value={type}
            onChange={(e) => {
              setType(e.target.value as CourseType | '');
              setPage(1);
            }}
            className="w-48"
          >
            <option value="">كل الأنواع</option>
            <option value="SHARIA">{COURSE_TYPE_LABELS.SHARIA}</option>
            <option value="TAJWEED">{COURSE_TYPE_LABELS.TAJWEED}</option>
          </Select>
        </div>
      </Card>

      {isLoading ? (
        <LoadingState />
      ) : error ? (
        <ErrorState message={apiError(error, 'تعذر تحميل الدورات')} onRetry={refetch} />
      ) : courses.length === 0 ? (
        <EmptyState
          icon={<IconBook size={30} />}
          title="لا توجد دورات"
          message="ابدأ بإضافة دورة شرعية أو دورة في أحكام التجويد."
        />
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {courses.map((course) => (
              <Card key={course.id} className="flex flex-col">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex min-w-0 items-start gap-2">
                    {bulk.active && (
                      <input
                        type="checkbox"
                        checked={selected.includes(course.id)}
                        onChange={() => bulk.toggle(course.id)}
                        className="checkbox mt-1"
                      />
                    )}
                    <div className="min-w-0">
                      <Link
                        to={`/courses/${course.id}`}
                        className="block truncate font-bold text-slate-800 hover:text-primary-700"
                      >
                        {course.name}
                      </Link>
                      <span className="numeric text-xs text-slate-400">{course.code}</span>
                    </div>
                  </div>
                  <Badge className={COURSE_TYPE_COLORS[course.type]}>
                    {COURSE_TYPE_LABELS[course.type]}
                  </Badge>
                </div>

                <dl className="mt-4 space-y-2 text-sm">
                  <Row label="المحاضر" value={course.instructor?.fullName ?? course.instructorName ?? '—'} />
                  <Row
                    label="الموعد"
                    value={
                      course.scheduleDays.length
                        ? `${course.scheduleDays.map((d) => WEEKDAY_LABELS[d] ?? d).join('، ')}${
                            course.startTime ? ` — ${course.startTime}` : ''
                          }`
                        : '—'
                    }
                  />
                  <Row
                    label="الفترة"
                    value={
                      course.startDate
                        ? `${formatDate(course.startDate)}${
                            course.endDate ? ` إلى ${formatDate(course.endDate)}` : ''
                          }`
                        : '—'
                    }
                  />
                  <Row
                    label="الطلاب"
                    value={
                      <span className="numeric">
                        {course.studentsCount} / {course.capacity}
                      </span>
                    }
                  />
                </dl>

                <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3">
                  <Badge className={course.isActive ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-600'}>
                    {course.isActive ? 'نشطة' : 'منتهية'}
                  </Badge>
                  <div className="flex gap-1.5">
                    <Link to={`/courses/${course.id}`} className="btn-ghost px-2.5 py-1.5 text-xs">
                      التفاصيل
                    </Link>
                    {canManage && (
                      <Button
                        variant="ghost"
                        className="px-2.5 py-1.5 text-xs"
                        onClick={() => {
                          setEditing(course);
                          setFormOpen(true);
                        }}
                      >
                        تعديل
                      </Button>
                    )}
                    {isAdmin && (
                      <Button
                        variant="ghost"
                        className="px-2 py-1.5 text-xs text-red-600"
                        onClick={async () => {
                          const yes = await confirm({
                            title: 'حذف الدورة',
                            message: `سيتم حذف "${course.name}". هل أنت متأكد؟`,
                            confirmLabel: 'حذف',
                            variant: 'danger',
                          });
                          if (yes) remove.mutate(course.id);
                        }}
                      >
                        <IconTrash size={14} />
                      </Button>
                    )}
                  </div>
                </div>
              </Card>
            ))}
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

      <CourseForm
        open={formOpen}
        course={editing}
        onClose={() => {
          setFormOpen(false);
          setEditing(null);
        }}
      />
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <dt className="shrink-0 text-xs text-slate-400">{label}</dt>
      <dd className="min-w-0 truncate text-left text-slate-700">{value}</dd>
    </div>
  );
}

// --- create / edit ----------------------------------------------------------

function CourseForm({
  open,
  course,
  onClose,
}: {
  open: boolean;
  course: Course | null;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const empty = {
    name: '',
    code: '',
    type: 'TAJWEED' as CourseType,
    description: '',
    instructorId: '',
    instructorName: '',
    location: '',
    startDate: '',
    endDate: '',
    startTime: '',
    endTime: '',
    capacity: '30',
    scheduleDays: [] as string[],
  };
  const [form, setForm] = useState(empty);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [ready, setReady] = useState(false);

  // Seed the form the first time the modal opens for a given course.
  if (open && !ready) {
    setForm(
      course
        ? {
            name: course.name,
            code: course.code,
            type: course.type,
            description: course.description ?? '',
            instructorId: course.instructor?.id ?? '',
            instructorName: course.instructorName ?? '',
            location: course.location ?? '',
            startDate: course.startDate?.slice(0, 10) ?? '',
            endDate: course.endDate?.slice(0, 10) ?? '',
            startTime: course.startTime ?? '',
            endTime: course.endTime ?? '',
            capacity: String(course.capacity),
            scheduleDays: course.scheduleDays ?? [],
          }
        : empty,
    );
    setErrors({});
    setReady(true);
  }
  if (!open && ready) setReady(false);

  const { data: staff } = useQuery({
    queryKey: ['users', 'staff', 'instructors'],
    queryFn: async () =>
      (await api.get<PaginatedResponse<StaffMember>>('/users/staff', { params: { limit: 100 } })).data,
    enabled: open,
  });

  const set = (key: keyof typeof empty, value: unknown) => {
    setForm((f) => ({ ...f, [key]: value }) as typeof empty);
    setErrors((e) => (e[key as string] ? { ...e, [key as string]: '' } : e));
  };

  const mutation = useMutation({
    mutationFn: async (payload: Record<string, unknown>) =>
      course
        ? (await api.patch(`/courses/${course.id}`, payload)).data
        : (await api.post('/courses', payload)).data,
    onSuccess: () => {
      toast.success(course ? 'تم تحديث الدورة' : 'تمت إضافة الدورة');
      void qc.invalidateQueries({ queryKey: ['courses'] });
      onClose();
    },
    onError: (err) => setErrors({ form: apiError(err, 'تعذر حفظ الدورة') }),
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const next: Record<string, string> = {};
    if (!form.name.trim()) next.name = 'اسم الدورة مطلوب';
    if (form.startDate && form.endDate && form.startDate > form.endDate) {
      next.endDate = 'تاريخ النهاية يجب أن يلي تاريخ البداية';
    }
    setErrors(next);
    if (Object.keys(next).length) return;

    mutation.mutate({
      name: form.name.trim(),
      code: form.code.trim() || undefined,
      type: form.type,
      description: form.description.trim(),
      instructorId: form.instructorId || undefined,
      instructorName: form.instructorName.trim(),
      location: form.location.trim(),
      startDate: form.startDate || undefined,
      endDate: form.endDate || undefined,
      startTime: form.startTime || '',
      endTime: form.endTime || '',
      capacity: Number(form.capacity) || 30,
      scheduleDays: form.scheduleDays,
    });
  };

  return (
    <Modal open={open} onClose={onClose} title={course ? 'تعديل الدورة' : 'إضافة دورة'} size="lg">
      <form onSubmit={submit} className="space-y-4" noValidate>
        {errors.form && (
          <div className="rounded-xl border border-red-100 bg-red-50 px-3.5 py-3 text-sm text-red-700">
            {errors.form}
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            label="اسم الدورة"
            value={form.name}
            onChange={(e) => set('name', e.target.value)}
            error={errors.name}
            required
          />
          <Select label="نوع الدورة" value={form.type} onChange={(e) => set('type', e.target.value)}>
            <option value="TAJWEED">{COURSE_TYPE_LABELS.TAJWEED}</option>
            <option value="SHARIA">{COURSE_TYPE_LABELS.SHARIA}</option>
          </Select>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Select
            label="المحاضر (من الكادر)"
            value={form.instructorId}
            onChange={(e) => set('instructorId', e.target.value)}
            hint="اتركه فارغاً إذا كان المحاضر من خارج النظام"
          >
            <option value="">— بدون —</option>
            {(staff?.data ?? []).map((u) => (
              <option key={u.id} value={u.id}>
                {u.fullName}
              </option>
            ))}
          </Select>
          <Input
            label="اسم المحاضر (خارجي)"
            value={form.instructorName}
            onChange={(e) => set('instructorName', e.target.value)}
            hint="يُستخدم عندما لا يكون للمحاضر حساب"
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            label="تاريخ البداية"
            type="date"
            value={form.startDate}
            onChange={(e) => set('startDate', e.target.value)}
          />
          <Input
            label="تاريخ النهاية"
            type="date"
            value={form.endDate}
            onChange={(e) => set('endDate', e.target.value)}
            error={errors.endDate}
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <Input
            label="من الساعة"
            type="time"
            value={form.startTime}
            onChange={(e) => set('startTime', e.target.value)}
          />
          <Input
            label="إلى الساعة"
            type="time"
            value={form.endTime}
            onChange={(e) => set('endTime', e.target.value)}
          />
          <Input
            label="السعة"
            type="number"
            min={1}
            value={form.capacity}
            onChange={(e) => set('capacity', e.target.value)}
          />
        </div>

        <div>
          <span className="label">أيام الدورة</span>
          <div className="flex flex-wrap gap-2">
            {WEEKDAYS.map((day) => {
              const active = form.scheduleDays.includes(day);
              return (
                <button
                  key={day}
                  type="button"
                  onClick={() =>
                    set(
                      'scheduleDays',
                      active
                        ? form.scheduleDays.filter((d) => d !== day)
                        : [...form.scheduleDays, day],
                    )
                  }
                  className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition ${
                    active
                      ? 'border-primary-500 bg-primary-50 text-primary-700'
                      : 'border-slate-200 text-slate-500 hover:border-slate-300'
                  }`}
                >
                  {WEEKDAY_LABELS[day]}
                </button>
              );
            })}
          </div>
        </div>

        <Input label="المكان" value={form.location} onChange={(e) => set('location', e.target.value)} />
        <Textarea
          label="الوصف"
          rows={3}
          value={form.description}
          onChange={(e) => set('description', e.target.value)}
        />

        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="ghost" onClick={onClose}>
            إلغاء
          </Button>
          <Button type="submit" loading={mutation.isPending}>
            حفظ
          </Button>
        </div>
      </form>
    </Modal>
  );
}
