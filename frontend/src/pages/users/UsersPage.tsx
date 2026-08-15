import { useState } from 'react';
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
  StatCard,
  useConfirm,
} from '@/components/ui';
import { IconEdit, IconLock, IconPlus, IconTrash, IconUsers } from '@/components/ui/Icons';
import { ROLE_COLORS, ROLE_LABELS } from '@/lib/labels';
import { formatDateTime, timeAgo } from '@/lib/format';
import type { PaginatedResponse, Role, UserRecord } from '@/types';

export default function UsersPage() {
  const currentUser = useAuthStore((s) => s.user)!;
  const queryClient = useQueryClient();
  const confirm = useConfirm();

  const [search, setSearch] = useState('');
  const [role, setRole] = useState('');
  const [isActive, setIsActive] = useState('');
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<UserRecord | null>(null);
  const [resetting, setResetting] = useState<UserRecord | null>(null);
  const [creating, setCreating] = useState(false);

  const debouncedSearch = useDebounce(search);

  const { data: stats } = useQuery({
    queryKey: ['users', 'stats'],
    queryFn: async () => (await api.get('/users/stats')).data,
  });

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['users', { debouncedSearch, role, isActive, page }],
    queryFn: async () =>
      (
        await api.get<PaginatedResponse<UserRecord>>('/users', {
          params: {
            page,
            limit: 20,
            search: debouncedSearch || undefined,
            role: role || undefined,
            isActive: isActive === '' ? undefined : isActive,
          },
        })
      ).data,
  });

  const toggleActive = useMutation({
    mutationFn: ({ id, activate }: { id: string; activate: boolean }) =>
      api.patch(`/users/${id}/${activate ? 'activate' : 'deactivate'}`),
    onSuccess: (_, variables) => {
      toast.success(variables.activate ? 'تم تفعيل الحساب' : 'تم إيقاف الحساب');
      queryClient.invalidateQueries({ queryKey: ['users'] });
    },
    onError: (error) => toast.error(apiError(error)),
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/users/${id}`),
    onSuccess: () => {
      toast.success('تم حذف المستخدم');
      queryClient.invalidateQueries({ queryKey: ['users'] });
    },
    onError: (error) => toast.error(apiError(error)),
  });

  const byRole = (r: Role) => stats?.byRole?.find((x: any) => x.role === r)?.count ?? 0;

  return (
    <>
      <PageHeader
        title="المستخدمون"
        subtitle="إدارة حسابات النظام والأدوار والصلاحيات"
        action={
          <Button icon={<IconPlus size={17} />} onClick={() => setCreating(true)}>
            إضافة مستخدم
          </Button>
        }
      />

      {stats && (
        <div className="mb-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard label="إجمالي المستخدمين" value={stats.total} icon={<IconUsers size={22} />} />
          <StatCard label="نشط" value={stats.active} icon={<IconUsers size={22} />} tone="emerald" />
          <StatCard label="موقوف" value={stats.inactive} icon={<IconLock size={22} />} tone="red" />
          <StatCard label="معلمون" value={byRole('TEACHER')} icon={<IconUsers size={22} />} tone="sky" />
        </div>
      )}

      <Card className="mb-5">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <SearchInput
            value={search}
            onChange={(v) => {
              setSearch(v);
              setPage(1);
            }}
            placeholder="بحث بالاسم أو البريد أو رقم الهوية..."
            className="lg:col-span-2"
          />
          <Select
            value={role}
            onChange={(e) => {
              setRole(e.target.value);
              setPage(1);
            }}
          >
            <option value="">كل الأدوار</option>
            {Object.entries(ROLE_LABELS).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </Select>
          <Select
            value={isActive}
            onChange={(e) => {
              setIsActive(e.target.value);
              setPage(1);
            }}
          >
            <option value="">كل الحالات</option>
            <option value="true">نشط</option>
            <option value="false">موقوف</option>
          </Select>
        </div>
      </Card>

      <Card padded={false}>
        {isLoading ? (
          <LoadingState />
        ) : isError ? (
          <ErrorState message="تعذر تحميل المستخدمين" onRetry={() => refetch()} />
        ) : !data?.data.length ? (
          <EmptyState title="لا يوجد مستخدمون" icon={<IconUsers size={24} />} />
        ) : (
          <>
            <div className="table-wrap border-0 shadow-none">
              <table className="table">
                <thead>
                  <tr>
                    <th>المستخدم</th>
                    <th>الدور</th>
                    <th>التواصل</th>
                    <th>آخر دخول</th>
                    <th>الحالة</th>
                    <th className="text-center">إجراءات</th>
                  </tr>
                </thead>
                <tbody>
                  {data.data.map((account) => (
                    <tr key={account.id}>
                      <td>
                        <div className="flex items-center gap-3">
                          <Avatar name={account.fullName} src={account.avatarUrl} size={36} />
                          <div className="min-w-0">
                            <p className="truncate font-bold text-slate-800">{account.fullName}</p>
                            <p className="truncate text-[11px] text-slate-400" dir="ltr">
                              {account.email}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td>
                        <Badge className={ROLE_COLORS[account.role]}>{ROLE_LABELS[account.role]}</Badge>
                      </td>
                      <td className="text-xs text-slate-500">
                        <span className="numeric block" dir="ltr">
                          {account.phone ?? '—'}
                        </span>
                        <span className="block truncate" dir="ltr">
                          {account.email ?? ''}
                        </span>
                      </td>
                      <td className="text-xs text-slate-500">
                        {account.lastLoginAt ? timeAgo(account.lastLoginAt) : 'لم يسجل دخول'}
                      </td>
                      <td>
                        <Badge className={account.isActive ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-800'}>
                          {account.isActive ? 'نشط' : 'موقوف'}
                        </Badge>
                        {account.mustChangePassword && (
                          <span className="mt-1 block text-[10px] text-amber-600">يجب تغيير كلمة المرور</span>
                        )}
                      </td>
                      <td>
                        <div className="flex items-center justify-center gap-1">
                          <button
                            onClick={() => setEditing(account)}
                            className="rounded-lg p-2 text-slate-400 transition hover:bg-slate-100 hover:text-primary-700"
                            title="تعديل"
                          >
                            <IconEdit size={16} />
                          </button>
                          <button
                            onClick={() => setResetting(account)}
                            className="rounded-lg p-2 text-slate-400 transition hover:bg-amber-50 hover:text-amber-600"
                            title="إعادة تعيين كلمة المرور"
                          >
                            <IconLock size={16} />
                          </button>
                          {account.id !== currentUser.id && (
                            <>
                              <button
                                onClick={async () => {
                                  const ok = await confirm({
                                    title: account.isActive ? 'إيقاف الحساب' : 'تفعيل الحساب',
                                    message: account.isActive
                                      ? `سيتم إيقاف حساب "${account.fullName}" ومنعه من الدخول.`
                                      : `سيتم تفعيل حساب "${account.fullName}".`,
                                    confirmLabel: account.isActive ? 'إيقاف' : 'تفعيل',
                                    variant: account.isActive ? 'danger' : 'success',
                                  });
                                  if (ok) toggleActive.mutate({ id: account.id, activate: !account.isActive });
                                }}
                                className="rounded-lg px-2 py-1.5 text-[11px] font-bold text-slate-500 transition hover:bg-slate-100"
                              >
                                {account.isActive ? 'إيقاف' : 'تفعيل'}
                              </button>
                              <button
                                onClick={async () => {
                                  const ok = await confirm({
                                    title: 'حذف المستخدم',
                                    message: `سيتم حذف "${account.fullName}" (حذف ناعم) وإلغاء جميع جلساته.`,
                                    confirmLabel: 'حذف',
                                  });
                                  if (ok) remove.mutate(account.id);
                                }}
                                className="rounded-lg p-2 text-slate-400 transition hover:bg-red-50 hover:text-red-600"
                                title="حذف"
                              >
                                <IconTrash size={16} />
                              </button>
                            </>
                          )}
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

      {creating && <UserFormModal onClose={() => setCreating(false)} />}
      {editing && <UserFormModal user={editing} onClose={() => setEditing(null)} />}
      {resetting && <ResetPasswordModal user={resetting} onClose={() => setResetting(null)} />}
    </>
  );
}

function UserFormModal({ user, onClose }: { user?: UserRecord; onClose: () => void }) {
  const queryClient = useQueryClient();
  const isEdit = !!user;

  const [form, setForm] = useState({
    password: '',
    fullName: user?.fullName ?? '',
    role: user?.role ?? ('TEACHER' as Role),
    email: user?.email ?? '',
    phone: user?.phone ?? '',
    isActive: user?.isActive ?? true,
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  const mutation = useMutation({
    mutationFn: () => {
      const payload: Record<string, unknown> = {
        fullName: form.fullName,
        role: form.role,
        phone: form.phone || undefined,
        isActive: form.isActive,
      };
      if (!isEdit) {
        payload.email = form.email;
        payload.password = form.password;
      } else if (form.email !== user!.email) {
        // Changing the address forces the user to confirm it again.
        payload.email = form.email;
      }
      return isEdit ? api.patch(`/users/${user!.id}`, payload) : api.post('/users', payload);
    },
    onSuccess: () => {
      toast.success(isEdit ? 'تم تحديث المستخدم' : 'تم إنشاء المستخدم');
      queryClient.invalidateQueries({ queryKey: ['users'] });
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
    if (!isEdit && form.password.length < 6) next.password = 'كلمة المرور 6 أحرف على الأقل';
    setErrors(next);
    if (Object.keys(next).length) return;
    mutation.mutate();
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
      title={isEdit ? 'تعديل المستخدم' : 'إضافة مستخدم'}
      size="md"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            إلغاء
          </Button>
          <Button onClick={submit} loading={mutation.isPending}>
            حفظ
          </Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Input label="الاسم الكامل" required value={form.fullName} onChange={(e) => set('fullName', e.target.value)} error={errors.fullName} className="sm:col-span-2" />
        <Input label="البريد الإلكتروني" required type="email" value={form.email} onChange={(e) => set('email', e.target.value)} error={errors.email} hint="يُستخدم لتسجيل الدخول" dir="ltr" />
        {!isEdit && (
          <Input label="كلمة المرور" required type="text" value={form.password} onChange={(e) => set('password', e.target.value)} error={errors.password} dir="ltr" />
        )}
        <Select label="الدور" required value={form.role} onChange={(e) => set('role', e.target.value)}>
          {Object.entries(ROLE_LABELS).map(([key, label]) => (
            <option key={key} value={key}>
              {label}
            </option>
          ))}
        </Select>
        <Input label="الجوال" value={form.phone} onChange={(e) => set('phone', e.target.value)} error={errors.phone} hint={PHONE_HINT} dir="ltr" />
        <Select label="الحالة" value={String(form.isActive)} onChange={(e) => set('isActive', e.target.value === 'true')}>
          <option value="true">نشط</option>
          <option value="false">موقوف</option>
        </Select>
      </div>

      {!isEdit && (form.role === 'TEACHER' || form.role === 'PARENT') && (
        <p className="mt-4 rounded-xl bg-sky-50 px-4 py-3 text-xs text-sky-800">
          سيتم إنشاء ملف {form.role === 'TEACHER' ? 'معلم' : 'ولي أمر'} مرتبط بهذا الحساب تلقائياً.
        </p>
      )}
    </Modal>
  );
}

function ResetPasswordModal({ user, onClose }: { user: UserRecord; onClose: () => void }) {
  const [newPassword, setNewPassword] = useState('');
  const [mustChange, setMustChange] = useState(true);

  const mutation = useMutation({
    mutationFn: () => api.patch(`/users/${user.id}/reset-password`, { newPassword, mustChangePassword: mustChange }),
    onSuccess: () => {
      toast.success('تم إعادة تعيين كلمة المرور');
      onClose();
    },
    onError: (error) => toast.error(apiError(error)),
  });

  return (
    <Modal
      open
      onClose={onClose}
      title="إعادة تعيين كلمة المرور"
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            إلغاء
          </Button>
          <Button onClick={() => mutation.mutate()} loading={mutation.isPending} disabled={newPassword.length < 6}>
            إعادة التعيين
          </Button>
        </>
      }
    >
      <p className="mb-4 rounded-xl bg-amber-50 px-4 py-3 text-xs text-amber-800">
        سيتم تعيين كلمة مرور جديدة للمستخدم <span className="font-bold">{user.fullName}</span> وإنهاء جميع جلساته الحالية.
      </p>
      <Input
        label="كلمة المرور الجديدة"
        required
        type="text"
        value={newPassword}
        onChange={(e) => setNewPassword(e.target.value)}
        hint="6 أحرف على الأقل"
        dir="ltr"
      />
      <label className="mt-3 flex cursor-pointer items-center gap-2 text-sm text-slate-600">
        <input
          type="checkbox"
          checked={mustChange}
          onChange={(e) => setMustChange(e.target.checked)}
          className="h-4 w-4 rounded border-slate-300 text-primary-600 focus:ring-primary-400"
        />
        إجبار المستخدم على تغييرها عند أول دخول
      </label>
    </Modal>
  );
}
