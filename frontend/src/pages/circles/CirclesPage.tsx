import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { api, apiError } from '@/lib/api';
import { useAuthStore } from '@/store/auth';
import { useDebounce } from '@/hooks/useDebounce';
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
  ProgressBar,
  SearchInput,
  Select,
  Textarea,
  cx,
  useConfirm,
} from '@/components/ui';
import { IconCircleGroup, IconPlus, IconTrash, IconUsers } from '@/components/ui/Icons';
import { DAY_LABELS, WEEK_DAYS } from '@/lib/labels';
import { formatTime } from '@/lib/format';
import type { Circle, PaginatedResponse, TeacherProfile, UserRecord } from '@/types';

export default function CirclesPage() {
  const user = useAuthStore((s) => s.user)!;
  const queryClient = useQueryClient();
  const confirm = useConfirm();

  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [isActive, setIsActive] = useState('');
  const [showForm, setShowForm] = useState(false);

  const debouncedSearch = useDebounce(search);
  const isAdmin = user.role === 'ADMIN';

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['circles', { page, debouncedSearch, isActive }],
    queryFn: async () => {
      const { data } = await api.get<PaginatedResponse<Circle>>('/circles', {
        params: {
          page,
          limit: 12,
          search: debouncedSearch || undefined,
          isActive: isActive === '' ? undefined : isActive,
        },
      });
      return data;
    },
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/circles/${id}`),
    onSuccess: () => {
      toast.success('تم حذف الحلقة');
      queryClient.invalidateQueries({ queryKey: ['circles'] });
    },
    onError: (error) => toast.error(apiError(error)),
  });

  const handleDelete = async (circle: Circle) => {
    const ok = await confirm({
      title: 'حذف الحلقة',
      message: `سيتم حذف حلقة "${circle.name}". لا يمكن الحذف إذا كان بها طلاب مسجلون.`,
      confirmLabel: 'حذف',
    });
    if (ok) remove.mutate(circle.id);
  };

  return (
    <>
      <PageHeader
        title="الحلقات"
        subtitle="إدارة حلقات التحفيظ والمعلمين المسندين إليها"
        action={
          isAdmin && (
            <Button icon={<IconPlus size={17} />} onClick={() => setShowForm(true)}>
              إنشاء حلقة
            </Button>
          )
        }
      />

      <Card className="mb-5">
        <div className="grid gap-3 sm:grid-cols-3">
          <SearchInput
            value={search}
            onChange={(v) => {
              setSearch(v);
              setPage(1);
            }}
            placeholder="بحث باسم الحلقة أو الرمز..."
            className="sm:col-span-2"
          />
          <Select
            value={isActive}
            onChange={(e) => {
              setIsActive(e.target.value);
              setPage(1);
            }}
          >
            <option value="">كل الحالات</option>
            <option value="true">مفعّلة</option>
            <option value="false">موقوفة</option>
          </Select>
        </div>
      </Card>

      {isLoading ? (
        <LoadingState />
      ) : isError ? (
        <ErrorState message="تعذر تحميل الحلقات" onRetry={() => refetch()} />
      ) : !data?.data.length ? (
        <Card>
          <EmptyState
            title="لا توجد حلقات"
            message="لم يتم إنشاء أي حلقة بعد، أو لا توجد حلقات مسندة إليك."
            icon={<IconCircleGroup size={24} />}
          />
        </Card>
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {data.data.map((circle) => (
              <article key={circle.id} className="card card-hover flex flex-col p-5">
                <header className="mb-3 flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <Link
                      to={`/circles/${circle.id}`}
                      className="block truncate text-base font-extrabold text-slate-800 hover:text-primary-700"
                    >
                      {circle.name}
                    </Link>
                    <p className="numeric text-[11px] text-slate-400">
                      {circle.code}
                      {circle.level ? ` • ${circle.level}` : ''}
                    </p>
                  </div>
                  <Badge className={circle.isActive ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-600'}>
                    {circle.isActive ? 'مفعّلة' : 'موقوفة'}
                  </Badge>
                </header>

                <dl className="mb-4 space-y-2 text-xs">
                  <div className="flex justify-between gap-2">
                    <dt className="text-slate-400">المعلم الأساسي</dt>
                    <dd className="truncate font-semibold text-slate-700">
                      {circle.primaryTeacher?.user.fullName ?? 'غير محدد'}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-2">
                    <dt className="text-slate-400">المساعدون</dt>
                    <dd className="numeric font-semibold text-slate-700">
                      {circle.assistantTeachers?.length ?? 0}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-2">
                    <dt className="text-slate-400">المشرف</dt>
                    <dd className="truncate font-semibold text-slate-700">
                      {circle.supervisor?.fullName ?? 'غير محدد'}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-2">
                    <dt className="text-slate-400">الموعد</dt>
                    <dd className="text-left font-semibold text-slate-700">
                      {formatTime(circle.startTime)} — {formatTime(circle.endTime)}
                    </dd>
                  </div>
                  <div className="flex flex-wrap gap-1 pt-1">
                    {circle.scheduleDays?.map((day) => (
                      <span key={day} className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-500">
                        {DAY_LABELS[day] ?? day}
                      </span>
                    ))}
                  </div>
                </dl>

                <div className="mt-auto">
                  <div className="mb-1.5 flex items-center justify-between text-xs">
                    <span className="text-slate-400">الطلاب</span>
                    <span className="numeric font-bold text-slate-700">
                      {circle.studentsCount} / {circle.capacity}
                    </span>
                  </div>
                  <ProgressBar
                    value={circle.studentsCount}
                    max={circle.capacity}
                    tone={circle.studentsCount >= circle.capacity ? 'red' : circle.studentsCount / circle.capacity > 0.85 ? 'amber' : 'primary'}
                  />

                  <div className="mt-4 flex gap-2">
                    <Link to={`/circles/${circle.id}`} className="btn-secondary btn-sm flex-1">
                      عرض التفاصيل
                    </Link>
                    {isAdmin && (
                      <button
                        onClick={() => handleDelete(circle)}
                        className="rounded-lg p-2 text-slate-300 transition hover:bg-red-50 hover:text-red-600"
                        title="حذف"
                      >
                        <IconTrash size={16} />
                      </button>
                    )}
                  </div>
                </div>
              </article>
            ))}
          </div>

          <Card className="mt-5" padded={false}>
            <Pagination page={data.meta.page} totalPages={data.meta.totalPages} total={data.meta.total} onChange={setPage} />
          </Card>
        </>
      )}

      {showForm && <CircleFormModal onClose={() => setShowForm(false)} />}
    </>
  );
}

function CircleFormModal({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({
    name: '',
    code: '',
    level: 'مبتدئ',
    location: '',
    capacity: 20,
    startTime: '16:30',
    endTime: '18:00',
    supervisorId: '',
    primaryTeacherId: '',
    description: '',
  });
  const [days, setDays] = useState<string[]>(['SUNDAY', 'TUESDAY', 'THURSDAY']);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const { data: supervisors } = useQuery({
    queryKey: ['users', { role: 'SUPERVISOR' }],
    queryFn: async () =>
      (await api.get<PaginatedResponse<UserRecord>>('/users', { params: { role: 'SUPERVISOR', limit: 100 } })).data.data,
  });

  const { data: teachers } = useQuery({
    queryKey: ['teachers', { limit: 100 }],
    queryFn: async () =>
      (await api.get<PaginatedResponse<TeacherProfile>>('/teachers', { params: { limit: 100, isActive: true } })).data.data,
  });

  const create = useMutation({
    mutationFn: (payload: Record<string, unknown>) => api.post('/circles', payload),
    onSuccess: () => {
      toast.success('تم إنشاء الحلقة');
      queryClient.invalidateQueries({ queryKey: ['circles'] });
      onClose();
    },
    onError: (error) => toast.error(apiError(error)),
  });

  const submit = () => {
    const nextErrors: Record<string, string> = {};
    if (!form.name.trim()) nextErrors.name = 'اسم الحلقة مطلوب';
    if (form.capacity < 1) nextErrors.capacity = 'السعة يجب أن تكون 1 على الأقل';
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) return;

    const payload = Object.fromEntries(Object.entries(form).filter(([, v]) => v !== '' && v !== null));
    create.mutate({ ...payload, scheduleDays: days });
  };

  const set = (key: string, value: unknown) => setForm((f) => ({ ...f, [key]: value }));
  const toggleDay = (day: string) =>
    setDays((d) => (d.includes(day) ? d.filter((x) => x !== day) : [...d, day]));

  return (
    <Modal
      open
      onClose={onClose}
      title="إنشاء حلقة جديدة"
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            إلغاء
          </Button>
          <Button onClick={submit} loading={create.isPending}>
            إنشاء
          </Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Input label="اسم الحلقة" required value={form.name} onChange={(e) => set('name', e.target.value)} error={errors.name} />
        <Input label="الرمز" hint="يُولَّد تلقائياً إذا تُرك فارغاً" value={form.code} onChange={(e) => set('code', e.target.value)} dir="ltr" />
        <Input label="المستوى" value={form.level} onChange={(e) => set('level', e.target.value)} />
        <Input label="المكان" value={form.location} onChange={(e) => set('location', e.target.value)} />
        <Input
          label="السعة"
          type="number"
          min={1}
          max={200}
          value={form.capacity}
          onChange={(e) => set('capacity', Number(e.target.value))}
          error={errors.capacity}
        />
        <div />
        <Input label="وقت البداية" type="time" value={form.startTime} onChange={(e) => set('startTime', e.target.value)} />
        <Input label="وقت النهاية" type="time" value={form.endTime} onChange={(e) => set('endTime', e.target.value)} />

        <Select label="المشرف" value={form.supervisorId} onChange={(e) => set('supervisorId', e.target.value)}>
          <option value="">بدون مشرف</option>
          {supervisors?.map((s) => (
            <option key={s.id} value={s.id}>
              {s.fullName}
            </option>
          ))}
        </Select>
        <Select label="المعلم الأساسي" value={form.primaryTeacherId} onChange={(e) => set('primaryTeacherId', e.target.value)}>
          <option value="">بدون معلم</option>
          {teachers?.map((t) => (
            <option key={t.id} value={t.id}>
              {t.user.fullName}
            </option>
          ))}
        </Select>

        <div className="sm:col-span-2">
          <span className="label">أيام الحلقة</span>
          <div className="flex flex-wrap gap-2">
            {WEEK_DAYS.map((day) => (
              <button
                key={day.value}
                type="button"
                onClick={() => toggleDay(day.value)}
                className={cx(
                  'rounded-lg border px-3 py-1.5 text-xs font-semibold transition',
                  days.includes(day.value)
                    ? 'border-primary-500 bg-primary-50 text-primary-700'
                    : 'border-slate-200 text-slate-500 hover:bg-slate-50',
                )}
              >
                {day.label}
              </button>
            ))}
          </div>
        </div>

        <Textarea label="الوصف" value={form.description} onChange={(e) => set('description', e.target.value)} className="sm:col-span-2" />
      </div>
    </Modal>
  );
}
