import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { api, apiError } from '@/lib/api';
import { PHONE_HINT, USERNAME_HINT, emailError, phoneError, usernameError } from '@/lib/validation';
import { useAuthStore } from '@/store/auth';
import { useDebounce } from '@/hooks/useDebounce';
import { useBulkSelect } from '@/hooks/useBulkSelect';
import { BulkBar } from '@/components/BulkBar';
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

  const removeMany = useMutation({
    mutationFn: (ids: string[]) => api.post('/users/bulk-delete', { ids }),
    onSuccess: (res) => {
      const { deleted, skipped, message } = res.data;
      // Blocked rows are reported rather than silently dropped, so the operator
      // knows the last administrator (or their own account) was left alone.
      if (skipped?.length) toast(message, { icon: '⚠️' });
      else toast.success(message ?? `تم حذف ${deleted} مستخدم`);
      queryClient.invalidateQueries({ queryKey: ['users'] });
      bulk.cancel();
    },
    onError: (error) => toast.error(apiError(error)),
  });

  const rows = data?.data ?? [];
  // Checkboxes stay out of the table until the administrator asks for them.
  const bulk = useBulkSelect(rows);
  const { selected } = bulk;

  const byRole = (r: Role) => stats?.byRole?.find((x: any) => x.role === r)?.count ?? 0;

  return (
    <>
      <PageHeader
        title="المستخدمون"
        subtitle="إدارة حسابات النظام والأدوار والصلاحيات"
        action={
          <div className="flex flex-wrap gap-2">
            {!bulk.active && (
              <Button variant="secondary" icon={<IconTrash size={16} />} onClick={bulk.enable}>
                حذف جماعي
              </Button>
            )}
            <Button icon={<IconPlus size={17} />} onClick={() => setCreating(true)}>
              إضافة مستخدم
            </Button>
          </div>
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
            placeholder="بحث بالاسم أو اسم المستخدم أو الجوال أو رقم الهوية..."
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

      {bulk.active && (
        <BulkBar
          count={bulk.count}
          noun="مستخدم"
          allSelected={bulk.allSelected}
          onToggleAll={bulk.toggleAll}
          onCancel={bulk.cancel}
          deleting={removeMany.isPending}
          onDelete={async () => {
            const ok = await confirm({
              title: 'حذف المستخدمين المحددين',
              message: `سيتم حذف ${bulk.count} مستخدم وإلغاء جلساتهم. لن يُحذف حسابك ولا آخر مدير عام.`,
              confirmLabel: 'حذف',
              variant: 'danger',
            });
            if (ok) removeMany.mutate(selected);
          }}
        />
      )}

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
                    {bulk.active && (
                      <th className="w-10">
                        <input
                          type="checkbox"
                          checked={bulk.allSelected}
                          onChange={bulk.toggleAll}
                          className="h-4 w-4 rounded border-slate-300 text-primary-600 focus:ring-primary-400"
                          title="تحديد الكل"
                        />
                      </th>
                    )}
                    <th>المستخدم</th>
                    <th>الدور</th>
                    <th>المسمى الوظيفي</th>
                    <th>التواصل</th>
                    <th>آخر دخول</th>
                    <th>الحالة</th>
                    <th className="text-center">إجراءات</th>
                  </tr>
                </thead>
                <tbody>
                  {data.data.map((account) => (
                    <tr key={account.id}>
                      {bulk.active && (
                        <td>
                          <input
                            type="checkbox"
                            checked={selected.includes(account.id)}
                            onChange={() => bulk.toggle(account.id)}
                            className="h-4 w-4 rounded border-slate-300 text-primary-600 focus:ring-primary-400"
                          />
                        </td>
                      )}
                      <td>
                        <div className="flex items-center gap-3">
                          <Avatar name={account.fullName} src={account.avatarUrl} size={36} preview />
                          <div className="min-w-0">
                            <p className="truncate font-bold text-slate-800">{account.fullName}</p>
                            <p className="numeric truncate text-[11px] text-slate-400" dir="ltr">
                              {account.username}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td>
                        <Badge className={ROLE_COLORS[account.role]}>{ROLE_LABELS[account.role]}</Badge>
                      </td>
                      <td className="text-xs text-slate-500">{account.jobTitle ?? '—'}</td>
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
    username: user?.username ?? '',
    password: '',
    fullName: user?.fullName ?? '',
    role: user?.role ?? ('TEACHER' as Role),
    email: user?.email ?? '',
    phone: user?.phone ?? '',
    jobTitle: user?.jobTitle ?? '',
    specialization: user?.specialization ?? '',
    isActive: user?.isActive ?? true,
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  const mutation = useMutation({
    mutationFn: () => {
      const payload: Record<string, unknown> = {
        fullName: form.fullName,
        role: form.role,
        phone: form.phone || undefined,
        jobTitle: form.jobTitle,
        specialization: form.specialization,
        isActive: form.isActive,
        // The e-mail is optional contact information now; an empty string
        // clears it rather than being rejected.
        email: form.email || '',
      };
      if (!isEdit) {
        payload.username = form.username;
        payload.password = form.password;
      } else if (form.username !== user!.username) {
        payload.username = form.username;
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
    const nameErr = usernameError(form.username);
    if (nameErr) next.username = nameErr;
    // The address is optional; only its format is checked when one is given.
    const mailErr = emailError(form.email);
    if (mailErr) next.email = mailErr;
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
        <Input label="اسم المستخدم" required value={form.username} onChange={(e) => set('username', e.target.value)} error={errors.username} hint={USERNAME_HINT} dir="ltr" />
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
        {/* Optional, and said inside the box: a bare label next to three
            required ones reads as required too. */}
        <Input
          label="البريد الإلكتروني"
          type="email"
          value={form.email}
          onChange={(e) => set('email', e.target.value)}
          error={errors.email}
          placeholder="اختياري — للتواصل فقط"
          dir="ltr"
        />
        <Input
          label="المسمى الوظيفي"
          value={form.jobTitle}
          onChange={(e) => set('jobTitle', e.target.value)}
          placeholder="اختياري — يظهر في دليل الكادر"
        />
        <Input
          label="التخصص"
          value={form.specialization}
          onChange={(e) => set('specialization', e.target.value)}
          placeholder="اختياري"
        />
        <Select label="الحالة" value={String(form.isActive)} onChange={(e) => set('isActive', e.target.value === 'true')}>
          <option value="true">نشط</option>
          <option value="false">موقوف</option>
        </Select>
      </div>
    </Modal>
  );
}

function ResetPasswordModal({ user, onClose }: { user: UserRecord; onClose: () => void }) {
  const [newPassword, setNewPassword] = useState('');

  const mutation = useMutation({
    mutationFn: () => api.patch(`/users/${user.id}/reset-password`, { newPassword }),
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
    </Modal>
  );
}
