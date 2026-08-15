import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { api, apiError } from '@/lib/api';
import { PHONE_HINT, phoneError } from '@/lib/validation';
import { useAuthStore } from '@/store/auth';
import { useDebounce } from '@/hooks/useDebounce';
import {
  Avatar,
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
import { IconExchange, IconEye, IconPlus, IconTrash, IconUsers } from '@/components/ui/Icons';
import { EMPLOYMENT_LABELS } from '@/lib/labels';
import { formatDateShort } from '@/lib/format';
import type { Circle, PaginatedResponse, TeacherProfile } from '@/types';

export default function TeachersPage() {
  const user = useAuthStore((s) => s.user)!;
  const queryClient = useQueryClient();
  const confirm = useConfirm();

  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [isActive, setIsActive] = useState('');
  const [unassigned, setUnassigned] = useState(false);
  const [modal, setModal] = useState<'create' | 'swap' | null>(null);

  const debouncedSearch = useDebounce(search);
  const isAdmin = user.role === 'ADMIN';
  const canSwap = isAdmin || user.role === 'SUPERVISOR';

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['teachers', { page, debouncedSearch, isActive, unassigned }],
    queryFn: async () => {
      const { data } = await api.get<PaginatedResponse<TeacherProfile>>('/teachers', {
        params: {
          page,
          limit: 20,
          search: debouncedSearch || undefined,
          isActive: isActive === '' ? undefined : isActive,
          unassigned: unassigned || undefined,
        },
      });
      return data;
    },
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/teachers/${id}`),
    onSuccess: () => {
      toast.success('تم حذف المعلم');
      queryClient.invalidateQueries({ queryKey: ['teachers'] });
    },
    onError: (error) => toast.error(apiError(error)),
  });

  const handleDelete = async (teacher: TeacherProfile) => {
    const ok = await confirm({
      title: 'حذف المعلم',
      message: `سيتم حذف "${teacher.user.fullName}" وإيقاف حسابه وإنهاء إسناده للحلقات.`,
      confirmLabel: 'حذف',
    });
    if (ok) remove.mutate(teacher.id);
  };

  return (
    <>
      <PageHeader
        title="المعلمون"
        subtitle="إدارة معلمي الحلقات وبياناتهم الوظيفية"
        action={
          <>
            {canSwap && (
              <Button variant="secondary" icon={<IconExchange size={16} />} onClick={() => setModal('swap')}>
                تبادل معلمين
              </Button>
            )}
            {isAdmin && (
              <Button icon={<IconPlus size={17} />} onClick={() => setModal('create')}>
                إضافة معلم
              </Button>
            )}
          </>
        }
      />

      <Card className="mb-5">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <SearchInput
            value={search}
            onChange={(v) => {
              setSearch(v);
              setPage(1);
            }}
            placeholder="بحث بالاسم أو البريد أو الجوال أو الهوية..."
            className="lg:col-span-2"
          />
          <Select
            value={isActive}
            onChange={(e) => {
              setIsActive(e.target.value);
              setPage(1);
            }}
          >
            <option value="">كل الحالات</option>
            <option value="true">نشط</option>
            <option value="false">غير نشط</option>
          </Select>
          <label className="flex cursor-pointer items-center gap-2 rounded-xl border border-slate-200 px-3.5 text-sm text-slate-600">
            <input
              type="checkbox"
              checked={unassigned}
              onChange={(e) => {
                setUnassigned(e.target.checked);
                setPage(1);
              }}
              className="h-4 w-4 rounded border-slate-300 text-primary-600 focus:ring-primary-400"
            />
            بدون حلقة فقط
          </label>
        </div>
      </Card>

      <Card padded={false}>
        {isLoading ? (
          <LoadingState />
        ) : isError ? (
          <ErrorState message="تعذر تحميل قائمة المعلمين" onRetry={() => refetch()} />
        ) : !data?.data.length ? (
          <EmptyState title="لا يوجد معلمون" icon={<IconUsers size={24} />} />
        ) : (
          <>
            <div className="table-wrap border-0 shadow-none">
              <table className="table">
                <thead>
                  <tr>
                    <th>المعلم</th>
                    <th>الجوال</th>
                    <th>الحلقات</th>
                    <th>الطلاب</th>
                    <th>نوع التعاقد</th>
                    <th>تاريخ التعيين</th>
                    <th>الحالة</th>
                    <th className="text-center">إجراءات</th>
                  </tr>
                </thead>
                <tbody>
                  {data.data.map((teacher) => {
                    const active = teacher.circleRoles?.filter((r) => !r.endedAt) ?? [];
                    return (
                      <tr key={teacher.id}>
                        <td>
                          <div className="flex items-center gap-3">
                            <Avatar name={teacher.user.fullName} src={teacher.user.avatarUrl} size={36} />
                            <div className="min-w-0">
                              <Link
                                to={`/teachers/${teacher.id}`}
                                className="block truncate font-bold text-slate-800 hover:text-primary-700"
                              >
                                {teacher.user.fullName}
                              </Link>
                              <span className="block text-[11px] text-slate-400">
                                {teacher.qualification ?? '—'}
                              </span>
                            </div>
                          </div>
                        </td>
                        <td className="numeric text-xs text-slate-500" dir="ltr">
                          {teacher.user.phone ?? '—'}
                        </td>
                        <td>
                          {active.length ? (
                            <div className="flex flex-wrap gap-1">
                              {active.map((role) => (
                                <Link key={role.id} to={`/circles/${role.circle.id}`}>
                                  <Badge
                                    className={
                                      role.role === 'PRIMARY'
                                        ? 'bg-primary-100 text-primary-800'
                                        : 'bg-sky-100 text-sky-800'
                                    }
                                  >
                                    {role.circle.name}
                                  </Badge>
                                </Link>
                              ))}
                            </div>
                          ) : (
                            <span className="text-xs text-slate-400">بدون حلقة</span>
                          )}
                        </td>
                        <td className="numeric font-bold text-slate-700">{teacher.studentsCount ?? 0}</td>
                        <td className="text-xs text-slate-500">{EMPLOYMENT_LABELS[teacher.employmentType]}</td>
                        <td className="numeric text-xs text-slate-500">{formatDateShort(teacher.hireDate)}</td>
                        <td>
                          <Badge className={teacher.isActive ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-600'}>
                            {teacher.isActive ? 'نشط' : 'غير نشط'}
                          </Badge>
                        </td>
                        <td>
                          <div className="flex items-center justify-center gap-1">
                            <Link
                              to={`/teachers/${teacher.id}`}
                              className="rounded-lg p-2 text-slate-400 transition hover:bg-slate-100 hover:text-primary-700"
                              title="عرض"
                            >
                              <IconEye size={16} />
                            </Link>
                            {isAdmin && (
                              <button
                                onClick={() => handleDelete(teacher)}
                                className="rounded-lg p-2 text-slate-400 transition hover:bg-red-50 hover:text-red-600"
                                title="حذف"
                              >
                                <IconTrash size={16} />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <Pagination page={data.meta.page} totalPages={data.meta.totalPages} total={data.meta.total} onChange={setPage} />
          </>
        )}
      </Card>

      {modal === 'create' && <TeacherFormModal onClose={() => setModal(null)} />}
      {modal === 'swap' && <SwapTeachersModal onClose={() => setModal(null)} />}
    </>
  );
}

function TeacherFormModal({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({
    password: '',
    fullName: '',
    email: '',
    phone: '',
    nationalId: '',
    birthDate: '',
    address: '',
    qualification: '',
    specialization: 'تحفيظ وتجويد',
    memorizedParts: 30,
    employmentType: 'VOLUNTEER',
    hireDate: '',
    notes: '',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  const create = useMutation({
    mutationFn: (payload: Record<string, unknown>) => api.post('/teachers', payload),
    onSuccess: () => {
      toast.success('تمت إضافة المعلم وإنشاء حساب الدخول');
      queryClient.invalidateQueries({ queryKey: ['teachers'] });
      onClose();
    },
    onError: (error) => toast.error(apiError(error)),
  });

  const submit = () => {
    const next: Record<string, string> = {};
    if (!form.fullName.trim()) next.fullName = 'الاسم مطلوب';
    if (!/^\S+@\S+\.\S+$/.test(form.email)) next.email = 'بريد إلكتروني صالح مطلوب — يُستخدم لتسجيل الدخول';
    const phoneErr = phoneError(form.phone);
    if (phoneErr) next.phone = phoneErr;
    if (form.password.length < 6) next.password = 'كلمة المرور 6 أحرف على الأقل';
    setErrors(next);
    if (Object.keys(next).length) return;

    create.mutate(Object.fromEntries(Object.entries(form).filter(([, v]) => v !== '' && v !== null)));
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
      title="إضافة معلم"
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
      <h4 className="mb-3 text-xs font-bold uppercase tracking-wide text-slate-400">حساب الدخول</h4>
      <div className="grid gap-4 sm:grid-cols-2">
        <Input label="البريد الإلكتروني" required type="email" value={form.email} onChange={(e) => set('email', e.target.value)} error={errors.email} hint="يُستخدم لتسجيل الدخول" dir="ltr" />
        <Input label="كلمة المرور" required type="text" value={form.password} onChange={(e) => set('password', e.target.value)} error={errors.password} dir="ltr" />
      </div>

      <h4 className="mb-3 mt-6 text-xs font-bold uppercase tracking-wide text-slate-400">البيانات الشخصية</h4>
      <div className="grid gap-4 sm:grid-cols-2">
        <Input label="الاسم الكامل" required value={form.fullName} onChange={(e) => set('fullName', e.target.value)} error={errors.fullName} className="sm:col-span-2" />
        <Input label="الجوال" value={form.phone} onChange={(e) => set('phone', e.target.value)} error={errors.phone} hint={PHONE_HINT} dir="ltr" />
        <Input label="رقم الهوية" value={form.nationalId} onChange={(e) => set('nationalId', e.target.value)} dir="ltr" />
        <Input label="تاريخ الميلاد" type="date" value={form.birthDate} onChange={(e) => set('birthDate', e.target.value)} />
        <Input label="العنوان" value={form.address} onChange={(e) => set('address', e.target.value)} className="sm:col-span-2" />
      </div>

      <h4 className="mb-3 mt-6 text-xs font-bold uppercase tracking-wide text-slate-400">البيانات الوظيفية</h4>
      <div className="grid gap-4 sm:grid-cols-2">
        <Input label="المؤهل" value={form.qualification} onChange={(e) => set('qualification', e.target.value)} />
        <Input label="التخصص" value={form.specialization} onChange={(e) => set('specialization', e.target.value)} />
        <Input
          label="الأجزاء المحفوظة"
          type="number"
          min={0}
          max={30}
          value={form.memorizedParts}
          onChange={(e) => set('memorizedParts', Number(e.target.value))}
        />
        <Select label="نوع التعاقد" value={form.employmentType} onChange={(e) => set('employmentType', e.target.value)}>
          {Object.entries(EMPLOYMENT_LABELS).map(([key, label]) => (
            <option key={key} value={key}>
              {label}
            </option>
          ))}
        </Select>
        <Input label="تاريخ التعيين" type="date" value={form.hireDate} onChange={(e) => set('hireDate', e.target.value)} />
        <Textarea label="ملاحظات" value={form.notes} onChange={(e) => set('notes', e.target.value)} className="sm:col-span-2" />
      </div>
    </Modal>
  );
}

function SwapTeachersModal({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient();
  const [teacherAId, setTeacherAId] = useState('');
  const [teacherBId, setTeacherBId] = useState('');
  const [reason, setReason] = useState('');

  const { data: teachers } = useQuery({
    queryKey: ['teachers', { limit: 200 }],
    queryFn: async () =>
      (await api.get<PaginatedResponse<TeacherProfile>>('/teachers', { params: { limit: 200, isActive: true } })).data.data,
  });

  // Only teachers that currently hold a circle can be swapped.
  const assigned = teachers?.filter((t) => t.circleRoles?.some((r) => !r.endedAt)) ?? [];

  const mutation = useMutation({
    mutationFn: () => api.post('/transfers/teachers/swap', { teacherAId, teacherBId, reason }),
    onSuccess: () => {
      toast.success('تم إنشاء طلب التبادل، بانتظار اعتماد الإدارة');
      queryClient.invalidateQueries({ queryKey: ['transfers'] });
      onClose();
    },
    onError: (error) => toast.error(apiError(error)),
  });

  const circleOf = (teacher?: TeacherProfile) =>
    teacher?.circleRoles?.find((r) => !r.endedAt)?.circle.name ?? '—';

  return (
    <Modal
      open
      onClose={onClose}
      title="تبادل معلمين بين حلقتين"
      size="md"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            إلغاء
          </Button>
          <Button
            onClick={() => mutation.mutate()}
            loading={mutation.isPending}
            disabled={!teacherAId || !teacherBId || teacherAId === teacherBId || !reason.trim()}
          >
            إرسال الطلب
          </Button>
        </>
      }
    >
      <p className="mb-4 rounded-xl bg-slate-50 px-4 py-3 text-xs text-slate-500">
        يتم تنفيذ التبادل بعد اعتماد الإدارة، ويحتفظ النظام بسجل الحركة لكلا المعلمين.
      </p>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Select label="المعلم الأول" required value={teacherAId} onChange={(e) => setTeacherAId(e.target.value)}>
            <option value="">اختر المعلم</option>
            {assigned.map((t) => (
              <option key={t.id} value={t.id}>
                {t.user.fullName}
              </option>
            ))}
          </Select>
          <p className="mt-1 text-xs text-slate-400">
            الحلقة: {circleOf(assigned.find((t) => t.id === teacherAId))}
          </p>
        </div>
        <div>
          <Select label="المعلم الثاني" required value={teacherBId} onChange={(e) => setTeacherBId(e.target.value)}>
            <option value="">اختر المعلم</option>
            {assigned
              .filter((t) => t.id !== teacherAId)
              .map((t) => (
                <option key={t.id} value={t.id}>
                  {t.user.fullName}
                </option>
              ))}
          </Select>
          <p className="mt-1 text-xs text-slate-400">
            الحلقة: {circleOf(assigned.find((t) => t.id === teacherBId))}
          </p>
        </div>
      </div>
      <Textarea label="سبب التبادل" required className="mt-4" value={reason} onChange={(e) => setReason(e.target.value)} />
    </Modal>
  );
}
