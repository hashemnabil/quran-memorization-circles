import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { api, apiError } from '@/lib/api';
import { PHONE_HINT, USERNAME_HINT, emailError, phoneError, usernameError } from '@/lib/validation';
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
  useConfirm,
} from '@/components/ui';
import { IconPlus, IconTrash, IconUser } from '@/components/ui/Icons';
import { STUDENT_STATUS_COLORS, STUDENT_STATUS_LABELS } from '@/lib/labels';
import type { PaginatedResponse, ParentProfile, Student } from '@/types';

export default function ParentsPage() {
  const queryClient = useQueryClient();
  const confirm = useConfirm();

  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [creating, setCreating] = useState(false);
  const [linking, setLinking] = useState<ParentProfile | null>(null);

  const debouncedSearch = useDebounce(search);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['parents', { debouncedSearch, page }],
    queryFn: async () =>
      (
        await api.get<PaginatedResponse<ParentProfile>>('/parents', {
          params: { page, limit: 20, search: debouncedSearch || undefined },
        })
      ).data,
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/parents/${id}`),
    onSuccess: () => {
      toast.success('تم حذف ولي الأمر');
      queryClient.invalidateQueries({ queryKey: ['parents'] });
    },
    onError: (error) => toast.error(apiError(error)),
  });

  return (
    <>
      <PageHeader
        title="أولياء الأمور"
        subtitle="إدارة حسابات أولياء الأمور وربطهم بالأبناء"
        action={
          <Button icon={<IconPlus size={17} />} onClick={() => setCreating(true)}>
            إضافة ولي أمر
          </Button>
        }
      />

      <Card className="mb-5">
        <SearchInput
          value={search}
          onChange={(v) => {
            setSearch(v);
            setPage(1);
          }}
          placeholder="بحث بالاسم أو البريد أو الجوال أو الهوية..."
          className="max-w-md"
        />
      </Card>

      <Card padded={false}>
        {isLoading ? (
          <LoadingState />
        ) : isError ? (
          <ErrorState message="تعذر تحميل أولياء الأمور" onRetry={() => refetch()} />
        ) : !data?.data.length ? (
          <EmptyState title="لا يوجد أولياء أمور" icon={<IconUser size={24} />} />
        ) : (
          <>
            <div className="table-wrap border-0 shadow-none">
              <table className="table">
                <thead>
                  <tr>
                    <th>ولي الأمر</th>
                    <th>الجوال</th>
                    <th>المهنة</th>
                    <th>الأبناء</th>
                    <th>الحالة</th>
                    <th className="text-center">إجراءات</th>
                  </tr>
                </thead>
                <tbody>
                  {data.data.map((parent) => (
                    <tr key={parent.id}>
                      <td>
                        <div className="flex items-center gap-3">
                          <Avatar name={parent.user.fullName} src={parent.user.avatarUrl} size={36} preview />
                          <div className="min-w-0">
                            <p className="truncate font-bold text-slate-800">{parent.user.fullName}</p>
                            <p className="text-[11px] text-slate-400" dir="ltr">
                              {parent.user.email}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="numeric text-xs text-slate-500" dir="ltr">
                        {parent.phone ?? '—'}
                      </td>
                      <td className="text-xs text-slate-500">{parent.occupation ?? '—'}</td>
                      <td>
                        {parent.students?.length ? (
                          <div className="flex flex-wrap gap-1">
                            {parent.students.map((student) => (
                              <Link key={student.id} to={`/students/${student.id}`}>
                                <Badge className={STUDENT_STATUS_COLORS[student.status]}>{student.fullName}</Badge>
                              </Link>
                            ))}
                          </div>
                        ) : (
                          <span className="text-xs text-slate-400">لا يوجد</span>
                        )}
                      </td>
                      <td>
                        <Badge className={parent.user.isActive ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-800'}>
                          {parent.user.isActive ? 'نشط' : 'موقوف'}
                        </Badge>
                      </td>
                      <td>
                        <div className="flex items-center justify-center gap-1.5">
                          <Button size="sm" variant="secondary" onClick={() => setLinking(parent)}>
                            ربط الأبناء
                          </Button>
                          <button
                            onClick={async () => {
                              const ok = await confirm({
                                title: 'حذف ولي الأمر',
                                message: `سيتم حذف "${parent.user.fullName}" وفك ارتباطه بالأبناء.`,
                                confirmLabel: 'حذف',
                              });
                              if (ok) remove.mutate(parent.id);
                            }}
                            className="rounded-lg p-2 text-slate-400 transition hover:bg-red-50 hover:text-red-600"
                            title="حذف"
                          >
                            <IconTrash size={16} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination page={data.meta.page} totalPages={data.meta.totalPages} total={data.meta.total} onChange={setPage} />
          </>
        )}
      </Card>

      {creating && <ParentFormModal onClose={() => setCreating(false)} />}
      {linking && <LinkStudentsModal parent={linking} onClose={() => setLinking(null)} />}
    </>
  );
}

function ParentFormModal({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({
    password: '',
    fullName: '',
    phone: '',
    altPhone: '',
    username: '',
    email: '',
    nationalId: '',
    address: '',
    occupation: '',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  const create = useMutation({
    mutationFn: (payload: Record<string, unknown>) => api.post('/parents', payload),
    onSuccess: () => {
      toast.success('تمت إضافة ولي الأمر وإنشاء حساب الدخول');
      queryClient.invalidateQueries({ queryKey: ['parents'] });
      onClose();
    },
    onError: (error) => toast.error(apiError(error)),
  });

  const submit = () => {
    const next: Record<string, string> = {};
    if (!form.fullName.trim()) next.fullName = 'الاسم مطلوب';
    const nameErr = usernameError(form.username);
    if (nameErr) next.username = nameErr;
    // The address is optional now; only its format is checked when given.
    const mailErr = emailError(form.email);
    if (mailErr) next.email = mailErr;
    const phoneErr = phoneError(form.phone);
    if (phoneErr) next.phone = phoneErr;
    const altPhoneErr = phoneError(form.altPhone);
    if (altPhoneErr) next.altPhone = altPhoneErr;
    if (form.password.length < 6) next.password = 'كلمة المرور 6 أحرف على الأقل';
    setErrors(next);
    if (Object.keys(next).length) return;
    create.mutate(Object.fromEntries(Object.entries(form).filter(([, v]) => v !== '')));
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
      title="إضافة ولي أمر"
      size="md"
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
        <Input label="الاسم الكامل" required value={form.fullName} onChange={(e) => set('fullName', e.target.value)} error={errors.fullName} className="sm:col-span-2" />
        <Input label="اسم المستخدم" required value={form.username} onChange={(e) => set('username', e.target.value)} error={errors.username} hint={USERNAME_HINT} dir="ltr" />
        <Input label="البريد الإلكتروني" type="email" value={form.email} onChange={(e) => set('email', e.target.value)} error={errors.email} hint="اختياري — للتواصل فقط" dir="ltr" />
        <Input label="كلمة المرور" required type="text" value={form.password} onChange={(e) => set('password', e.target.value)} error={errors.password} dir="ltr" />
        <Input label="الجوال" value={form.phone} onChange={(e) => set('phone', e.target.value)} error={errors.phone} hint={PHONE_HINT} dir="ltr" />
        <Input label="جوال بديل" value={form.altPhone} onChange={(e) => set('altPhone', e.target.value)} error={errors.altPhone} hint={PHONE_HINT} dir="ltr" />
        <Input label="رقم الهوية" value={form.nationalId} onChange={(e) => set('nationalId', e.target.value)} dir="ltr" />
        <Input label="المهنة" value={form.occupation} onChange={(e) => set('occupation', e.target.value)} />
        <Input label="العنوان" value={form.address} onChange={(e) => set('address', e.target.value)} />
      </div>
    </Modal>
  );
}

function LinkStudentsModal({ parent, onClose }: { parent: ParentProfile; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<string[]>(parent.students?.map((s) => s.id) ?? []);

  const debounced = useDebounce(search);

  const { data: students, isLoading } = useQuery({
    queryKey: ['students', 'link', debounced],
    queryFn: async () =>
      (await api.get<PaginatedResponse<Student>>('/students', { params: { search: debounced || undefined, limit: 50 } }))
        .data.data,
  });

  const mutation = useMutation({
    mutationFn: () => api.patch(`/parents/${parent.id}/students`, { studentIds: selected }),
    onSuccess: () => {
      toast.success('تم تحديث ارتباط الأبناء');
      queryClient.invalidateQueries({ queryKey: ['parents'] });
      queryClient.invalidateQueries({ queryKey: ['students'] });
      onClose();
    },
    onError: (error) => toast.error(apiError(error)),
  });

  const toggle = (id: string) =>
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  return (
    <Modal
      open
      onClose={onClose}
      title={`ربط أبناء ${parent.user.fullName}`}
      size="md"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            إلغاء
          </Button>
          <Button onClick={() => mutation.mutate()} loading={mutation.isPending}>
            حفظ الارتباط
          </Button>
        </>
      }
    >
      <p className="mb-3 rounded-xl bg-slate-50 px-4 py-3 text-xs text-slate-500">
        الطلاب المحددون سيظهرون في بوابة ولي الأمر. إلغاء التحديد يفك الارتباط.
      </p>
      <SearchInput value={search} onChange={setSearch} placeholder="ابحث عن طالب..." className="mb-3" />
      <p className="mb-2 text-xs text-slate-500">
        تم اختيار <span className="numeric font-bold">{selected.length}</span> طالب
      </p>

      {isLoading ? (
        <LoadingState rows={3} />
      ) : (
        <ul className="max-h-80 space-y-1 overflow-y-auto">
          {students?.map((student) => (
            <li key={student.id}>
              <button
                onClick={() => toggle(student.id)}
                className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-right transition ${
                  selected.includes(student.id) ? 'bg-primary-50 ring-1 ring-primary-200' : 'hover:bg-slate-50'
                }`}
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-slate-800">{student.fullName}</span>
                  <span className="numeric text-[11px] text-slate-400">
                    {student.code} • {student.circle?.name ?? 'بدون حلقة'}
                  </span>
                </span>
                <Badge className={STUDENT_STATUS_COLORS[student.status]}>
                  {STUDENT_STATUS_LABELS[student.status]}
                </Badge>
                {selected.includes(student.id) && <span className="h-2.5 w-2.5 rounded-full bg-primary-600" />}
              </button>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
}
