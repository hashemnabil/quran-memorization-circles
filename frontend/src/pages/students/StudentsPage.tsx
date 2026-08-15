import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { api, apiError } from '@/lib/api';
import { PHONE_HINT, phoneError } from '@/lib/validation';
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
  SearchInput,
  Select,
  Textarea,
  useConfirm,
} from '@/components/ui';
import { IconEye, IconGraduation, IconPlus, IconTrash } from '@/components/ui/Icons';
import {
  EVALUATION_COLORS,
  EVALUATION_LABELS,
  STUDENT_STATUS_COLORS,
  STUDENT_STATUS_LABELS,
} from '@/lib/labels';
import { calcAge, formatDateShort } from '@/lib/format';
import type { Circle, Evaluation, PaginatedResponse, Student, StudentStatus } from '@/types';

export default function StudentsPage() {
  const user = useAuthStore((s) => s.user)!;
  const queryClient = useQueryClient();
  const confirm = useConfirm();

  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [evaluation, setEvaluation] = useState('');
  const [circleId, setCircleId] = useState('');
  const [showForm, setShowForm] = useState(false);

  const debouncedSearch = useDebounce(search);
  const canCreate = user.role === 'ADMIN' || user.role === 'SUPERVISOR';

  const { data: circles } = useQuery({
    queryKey: ['circles', 'options'],
    queryFn: async () => (await api.get<Pick<Circle, 'id' | 'name' | 'code'>[]>('/circles/options')).data,
  });

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['students', { page, debouncedSearch, status, evaluation, circleId }],
    queryFn: async () => {
      const { data } = await api.get<PaginatedResponse<Student>>('/students', {
        params: {
          page,
          limit: 20,
          search: debouncedSearch || undefined,
          status: status || undefined,
          evaluation: evaluation || undefined,
          circleId: circleId || undefined,
        },
      });
      return data;
    },
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/students/${id}`),
    onSuccess: () => {
      toast.success('تم حذف الطالب');
      queryClient.invalidateQueries({ queryKey: ['students'] });
    },
    onError: (error) => toast.error(apiError(error)),
  });

  const handleDelete = async (student: Student) => {
    const confirmed = await confirm({
      title: 'حذف الطالب',
      message: `سيتم حذف الطالب "${student.fullName}" من النظام (حذف ناعم يحفظ سجلاته). هل أنت متأكد؟`,
      confirmLabel: 'حذف',
    });
    if (confirmed) remove.mutate(student.id);
  };

  const resetFilters = () => {
    setSearch('');
    setStatus('');
    setEvaluation('');
    setCircleId('');
    setPage(1);
  };

  const hasFilters = search || status || evaluation || circleId;

  return (
    <>
      <PageHeader
        title="الطلاب"
        subtitle="إدارة بيانات الطلاب ومتابعة مستوياتهم"
        action={
          canCreate && (
            <Button icon={<IconPlus size={17} />} onClick={() => setShowForm(true)}>
              تسجيل طالب
            </Button>
          )
        }
      />

      <Card className="mb-5">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          <SearchInput
            value={search}
            onChange={(v) => {
              setSearch(v);
              setPage(1);
            }}
            placeholder="بحث بالاسم أو رقم الطالب (ST-0004) أو رقم الهوية..."
            className="xl:col-span-2"
          />
          <Select
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setPage(1);
            }}
          >
            <option value="">كل الحالات</option>
            {Object.entries(STUDENT_STATUS_LABELS).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </Select>
          <Select
            value={evaluation}
            onChange={(e) => {
              setEvaluation(e.target.value);
              setPage(1);
            }}
          >
            <option value="">كل التقييمات</option>
            {Object.entries(EVALUATION_LABELS).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </Select>
          <Select
            value={circleId}
            onChange={(e) => {
              setCircleId(e.target.value);
              setPage(1);
            }}
          >
            <option value="">كل الحلقات</option>
            {circles?.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </div>
        {hasFilters && (
          <button onClick={resetFilters} className="mt-3 text-xs font-bold text-primary-700 hover:underline">
            مسح عوامل التصفية
          </button>
        )}
      </Card>

      <Card padded={false}>
        {isLoading ? (
          <LoadingState />
        ) : isError ? (
          <ErrorState message="تعذر تحميل قائمة الطلاب" onRetry={() => refetch()} />
        ) : !data?.data.length ? (
          <EmptyState
            title="لا يوجد طلاب"
            message={hasFilters ? 'لا توجد نتائج مطابقة لعوامل التصفية المحددة.' : 'لم يتم تسجيل أي طالب بعد.'}
            icon={<IconGraduation size={24} />}
          />
        ) : (
          <>
            <div className="table-wrap border-0 shadow-none">
              <table className="table">
                <thead>
                  <tr>
                    <th>الطالب</th>
                    <th>الحلقة</th>
                    <th>المعلم</th>
                    <th>ولي الأمر</th>
                    <th>الأجزاء</th>
                    <th>التقييم</th>
                    <th>الحالة</th>
                    <th className="text-center">إجراءات</th>
                  </tr>
                </thead>
                <tbody>
                  {data.data.map((student) => (
                    <tr key={student.id}>
                      <td>
                        <Link to={`/students/${student.id}`} className="font-bold text-slate-800 hover:text-primary-700">
                          {student.fullName}
                        </Link>
                        <span className="numeric block text-[11px] text-slate-400">
                          {student.code} • {calcAge(student.birthDate)}
                        </span>
                      </td>
                      <td>
                        {student.circle ? (
                          <Link to={`/circles/${student.circle.id}`} className="text-sm text-primary-700 hover:underline">
                            {student.circle.name}
                          </Link>
                        ) : (
                          <span className="text-xs text-slate-400">غير مسجل</span>
                        )}
                      </td>
                      <td className="text-sm text-slate-600">{student.teacherName ?? '—'}</td>
                      <td>
                        <span className="block text-sm text-slate-600">{student.parentName ?? '—'}</span>
                        <span className="numeric block text-[11px] text-slate-400" dir="ltr">
                          {student.parentPhone ?? ''}
                        </span>
                      </td>
                      <td className="numeric font-bold text-slate-700">{student.memorizedParts}</td>
                      <td>
                        {student.evaluation ? (
                          <Badge className={EVALUATION_COLORS[student.evaluation]}>
                            {EVALUATION_LABELS[student.evaluation]}
                          </Badge>
                        ) : (
                          <span className="text-xs text-slate-400">—</span>
                        )}
                      </td>
                      <td>
                        <Badge className={STUDENT_STATUS_COLORS[student.status]}>
                          {STUDENT_STATUS_LABELS[student.status]}
                        </Badge>
                      </td>
                      <td>
                        <div className="flex items-center justify-center gap-1">
                          <Link
                            to={`/students/${student.id}`}
                            className="rounded-lg p-2 text-slate-400 transition hover:bg-slate-100 hover:text-primary-700"
                            title="عرض الملف"
                          >
                            <IconEye size={16} />
                          </Link>
                          {user.role === 'ADMIN' && (
                            <button
                              onClick={() => handleDelete(student)}
                              className="rounded-lg p-2 text-slate-400 transition hover:bg-red-50 hover:text-red-600"
                              title="حذف"
                            >
                              <IconTrash size={16} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination
              page={data.meta.page}
              totalPages={data.meta.totalPages}
              total={data.meta.total}
              onChange={setPage}
            />
          </>
        )}
      </Card>

      {showForm && <StudentFormModal circles={circles ?? []} onClose={() => setShowForm(false)} />}
    </>
  );
}

// --- create form ------------------------------------------------------------

function StudentFormModal({
  circles,
  onClose,
}: {
  circles: Pick<Circle, 'id' | 'name' | 'code'>[];
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({
    fullName: '',
    birthDate: '',
    nationalId: '',
    fatherNationalId: '',
    address: '',
    guardianName: '',
    guardianPhone: '',
    guardianRelation: 'الأب',
    circleId: '',
    parentId: '',
    memorizedParts: 0,
    currentSurah: '',
    notes: '',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  const { data: parents } = useQuery({
    queryKey: ['parents', 'options'],
    queryFn: async () => (await api.get('/parents/options')).data,
  });

  const create = useMutation({
    mutationFn: (payload: Record<string, unknown>) => api.post('/students', payload),
    onSuccess: () => {
      toast.success('تم تسجيل الطالب بنجاح');
      queryClient.invalidateQueries({ queryKey: ['students'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      onClose();
    },
    onError: (error) => toast.error(apiError(error)),
  });

  const submit = () => {
    const nextErrors: Record<string, string> = {};
    if (!form.fullName.trim()) nextErrors.fullName = 'اسم الطالب مطلوب';
    const guardianPhoneError = phoneError(form.guardianPhone);
    if (guardianPhoneError) nextErrors.guardianPhone = guardianPhoneError;
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) return;

    // Empty strings would fail the API's UUID / date validation.
    const payload = Object.fromEntries(
      Object.entries(form).filter(([, value]) => value !== '' && value !== null),
    );
    create.mutate(payload);
  };

  const set = (key: string, value: unknown) => {
    setForm((f) => ({ ...f, [key]: value }));
    // Clear the field's error as soon as the user starts correcting it.
    setErrors((e) => (e[key] ? { ...e, [key]: '' } : e));
  };

  return (
    <Modal
      open
      onClose={onClose}
      title="تسجيل طالب جديد"
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            إلغاء
          </Button>
          <Button onClick={submit} loading={create.isPending}>
            حفظ
          </Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Input
          label="الاسم الكامل"
          required
          value={form.fullName}
          onChange={(e) => set('fullName', e.target.value)}
          error={errors.fullName}
          className="sm:col-span-2"
        />
        <Input label="تاريخ الميلاد" type="date" value={form.birthDate} onChange={(e) => set('birthDate', e.target.value)} />
        <Input label="رقم الهوية" value={form.nationalId} onChange={(e) => set('nationalId', e.target.value)} dir="ltr" />
        <Input
          label="رقم هوية الأب"
          value={form.fatherNationalId}
          onChange={(e) => set('fatherNationalId', e.target.value)}
          dir="ltr"
        />
        <Input label="العنوان" value={form.address} onChange={(e) => set('address', e.target.value)} />

        <Select label="الحلقة" value={form.circleId} onChange={(e) => set('circleId', e.target.value)}>
          <option value="">بدون حلقة</option>
          {circles.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name} ({c.code})
            </option>
          ))}
        </Select>
        <Select label="حساب ولي الأمر" value={form.parentId} onChange={(e) => set('parentId', e.target.value)}>
          <option value="">بدون ربط</option>
          {parents?.map((p: any) => (
            <option key={p.id} value={p.id}>
              {p.user.fullName}
            </option>
          ))}
        </Select>

        <Input label="اسم ولي الأمر" value={form.guardianName} onChange={(e) => set('guardianName', e.target.value)} />
        <Input
          label="جوال ولي الأمر"
          value={form.guardianPhone}
          onChange={(e) => set('guardianPhone', e.target.value)}
          error={errors.guardianPhone}
          dir="ltr"
        />
        <Input label="صلة القرابة" value={form.guardianRelation} onChange={(e) => set('guardianRelation', e.target.value)} />
        <Input
          label="الأجزاء المحفوظة"
          type="number"
          min={0}
          max={30}
          value={form.memorizedParts}
          onChange={(e) => set('memorizedParts', Number(e.target.value))}
        />
        <Input label="السورة الحالية" value={form.currentSurah} onChange={(e) => set('currentSurah', e.target.value)} />
        <Textarea
          label="ملاحظات"
          value={form.notes}
          onChange={(e) => set('notes', e.target.value)}
          className="sm:col-span-2"
        />
      </div>
    </Modal>
  );
}
