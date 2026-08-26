import { ChangeEvent, FormEvent, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { api, apiError } from '@/lib/api';
import { useAuthStore } from '@/store/auth';
import { Avatar, Badge, Button, Card, Input, PageHeader, Spinner, StatCard, Textarea } from '@/components/ui';
import { PHONE_HINT, emailError, phoneError } from '@/lib/validation';
import {
  IconCamera,
  IconCircleGroup,
  IconGraduation,
  IconLock,
  IconLogout,
  IconUser,
} from '@/components/ui/Icons';
import { EMPLOYMENT_LABELS, ROLE_COLORS, ROLE_LABELS } from '@/lib/labels';
import { formatDate, formatDateTime, formatParts } from '@/lib/format';

export default function ProfilePage() {
  const { user, logout, setUser } = useAuthStore();
  const navigate = useNavigate();

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  const { data: profile } = useQuery({
    queryKey: ['auth', 'me'],
    queryFn: async () => {
      const { data } = await api.get('/auth/me');
      setUser(data);
      return data;
    },
  });

  const changePassword = useMutation({
    mutationFn: () => api.patch('/auth/change-password', { currentPassword, newPassword }),
    onSuccess: async () => {
      toast.success('تم تغيير كلمة المرور، يرجى تسجيل الدخول مجدداً');
      await logout();
      navigate('/login', { replace: true });
    },
    onError: (error) => toast.error(apiError(error)),
  });

  if (!user) return null;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const next: Record<string, string> = {};
    if (!currentPassword) next.currentPassword = 'كلمة المرور الحالية مطلوبة';
    if (newPassword.length < 6) next.newPassword = 'كلمة المرور الجديدة 6 أحرف على الأقل';
    if (newPassword !== confirmPassword) next.confirmPassword = 'كلمتا المرور غير متطابقتين';
    if (newPassword && newPassword === currentPassword) next.newPassword = 'يجب أن تختلف عن الحالية';
    setErrors(next);
    if (Object.keys(next).length) return;
    changePassword.mutate();
  };

  const teacher = profile?.teacherProfile;

  return (
    <>
      <PageHeader title="الملف الشخصي" subtitle="بياناتك في النظام وإعدادات الحساب" />


      <div className="grid gap-5 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <div className="flex flex-col items-center gap-3 py-2 text-center">
            <AvatarUploader user={user} onUpdated={setUser} />
            <div>
              <h2 className="text-lg font-extrabold text-slate-800">{user.fullName}</h2>
              <p className="numeric text-xs text-slate-400" dir="ltr">
                {user.username}
              </p>
              {profile?.email && (
                <p className="text-xs text-slate-400" dir="ltr">
                  {profile.email}
                </p>
              )}
            </div>
            <Badge className={ROLE_COLORS[user.role]}>{ROLE_LABELS[user.role]}</Badge>
          </div>

          <dl className="mt-4 space-y-2.5 border-t border-slate-100 pt-4 text-xs">
            <Row label="الجوال" value={<span className="numeric" dir="ltr">{profile?.phone}</span>} />
            <Row label="آخر دخول" value={formatDateTime(profile?.lastLoginAt)} />
            <Row
              label="حالة الحساب"
              value={
                <Badge className={user.isActive ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-800'}>
                  {user.isActive ? 'نشط' : 'موقوف'}
                </Badge>
              }
            />
          </dl>

          <Button
            variant="secondary"
            className="mt-5 w-full"
            icon={<IconLogout size={16} />}
            onClick={async () => {
              await logout();
              navigate('/login', { replace: true });
            }}
          >
            تسجيل الخروج
          </Button>
        </Card>

        <div className="space-y-5 lg:col-span-2">
          {user.role === 'TEACHER' && teacher && (
            <>
              <div className="grid gap-4 sm:grid-cols-3">
                <StatCard label="الأجزاء المحفوظة" value={formatParts(teacher.memorizedParts)} icon={<IconGraduation size={22} />} />
                <StatCard
                  label="نوع التعاقد"
                  value={EMPLOYMENT_LABELS[teacher.employmentType as keyof typeof EMPLOYMENT_LABELS]}
                  icon={<IconUser size={22} />}
                  tone="sky"
                />
                <StatCard label="تاريخ التعيين" value={formatDate(teacher.hireDate)} icon={<IconCircleGroup size={22} />} tone="purple" />
              </div>
              <Card title="بياناتي الوظيفية">
                <dl className="grid gap-3 text-xs sm:grid-cols-2">
                  <Row label="المؤهل" value={teacher.qualification} />
                  <Row label="التخصص" value={teacher.specialization} />
                  <Row label="رقم الهوية" value={<span className="numeric" dir="ltr">{teacher.nationalId}</span>} />
                  <Row label="العنوان" value={teacher.address} />
                </dl>
                <Button
                  variant="secondary"
                  size="sm"
                  className="mt-4"
                  onClick={() => navigate(`/teachers/${teacher.id}`)}
                >
                  عرض ملفي الكامل
                </Button>
              </Card>
            </>
          )}

          {user.role === 'SUPERVISOR' && (
            <div className="grid gap-4 sm:grid-cols-2">
              <StatCard label="الحلقات المشرف عليها" value={profile?.supervisedCircles ?? 0} icon={<IconCircleGroup size={22} />} />
            </div>
          )}

          {user.role === 'PARENT' && profile?.parentProfile && (
            <Card title="بياناتي">
              <dl className="grid gap-3 text-xs sm:grid-cols-2">
                <Row label="الجوال" value={<span className="numeric" dir="ltr">{profile.parentProfile.phone}</span>} />
                <Row label="جوال بديل" value={<span className="numeric" dir="ltr">{profile.parentProfile.altPhone}</span>} />
                <Row label="المهنة" value={profile.parentProfile.occupation} />
                <Row label="العنوان" value={profile.parentProfile.address} />
              </dl>
              <Button variant="secondary" size="sm" className="mt-4" onClick={() => navigate('/parent/children')}>
                متابعة الأبناء
              </Button>
            </Card>
          )}

          <ProfileDetailsCard profile={profile} onUpdated={setUser} />

          <Card title="تغيير كلمة المرور" subtitle="سيتم إنهاء جميع جلساتك بعد التغيير">
            <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
              <Input
                label="كلمة المرور الحالية"
                type="password"
                required
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                error={errors.currentPassword}
                className="sm:col-span-2"
                dir="ltr"
              />
              <Input
                label="كلمة المرور الجديدة"
                type="password"
                required
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                error={errors.newPassword}
                hint="6 أحرف على الأقل"
                dir="ltr"
              />
              <Input
                label="تأكيد كلمة المرور"
                type="password"
                required
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                error={errors.confirmPassword}
                dir="ltr"
              />
              <div className="sm:col-span-2">
                <Button type="submit" loading={changePassword.isPending} icon={<IconLock size={16} />}>
                  تغيير كلمة المرور
                </Button>
              </div>
            </form>
          </Card>
        </div>
      </div>
    </>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <dt className="shrink-0 text-slate-400">{label}</dt>
      <dd className="text-left font-semibold text-slate-700">{value || '—'}</dd>
    </div>
  );
}

/**
 * Profile picture. The file goes to Cloudinary when the school has configured
 * it, and to local storage otherwise — the page does not need to know which.
 */
function AvatarUploader({
  user,
  onUpdated,
}: {
  user: { fullName: string; avatarUrl?: string | null };
  onUpdated: (user: any) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const pick = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    // Reset immediately so choosing the same file twice still fires a change.
    e.target.value = '';
    if (!file) return;

    setUploading(true);
    try {
      const body = new FormData();
      body.append('file', file);
      const { data } = await api.post('/uploads/avatar', body, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      const me = await api.patch('/auth/profile', { avatarUrl: data.url });
      onUpdated({ ...me.data, avatarUrl: data.url });
      toast.success('تم تحديث الصورة الشخصية');
      // Re-read so every consumer of /auth/me sees the new picture.
      const fresh = await api.get('/auth/me');
      onUpdated(fresh.data);
    } catch (error) {
      toast.error(apiError(error, 'تعذر رفع الصورة'));
    } finally {
      setUploading(false);
    }
  };

  const remove = async () => {
    setUploading(true);
    try {
      await api.patch('/auth/profile', { avatarUrl: '' });
      const fresh = await api.get('/auth/me');
      onUpdated(fresh.data);
      toast.success('تمت إزالة الصورة');
    } catch (error) {
      toast.error(apiError(error, 'تعذر إزالة الصورة'));
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="flex flex-col items-center gap-2">
      {/* Two separate targets: the picture itself opens full-screen, the badge
          on its corner replaces it. One button doing both meant you could never
          simply look at your own photo. */}
      <div className="relative">
        <Avatar name={user.fullName} src={user.avatarUrl} size={88} preview />
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          className="absolute -bottom-0.5 -left-0.5 grid h-8 w-8 place-items-center rounded-full bg-primary-600 text-white shadow-md ring-2 ring-white transition hover:bg-primary-700 disabled:opacity-60"
          title="تغيير الصورة الشخصية"
          aria-label="تغيير الصورة الشخصية"
        >
          {uploading ? <Spinner size={15} /> : <IconCamera size={16} />}
        </button>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif"
        onChange={pick}
        className="hidden"
      />

      {user.avatarUrl && (
        <button
          type="button"
          onClick={remove}
          disabled={uploading}
          className="text-[11px] font-semibold text-slate-400 transition hover:text-red-600"
        >
          إزالة الصورة
        </button>
      )}
    </div>
  );
}

/** Name, contact details and job title — the parts a user may edit themselves. */
function ProfileDetailsCard({
  profile,
  onUpdated,
}: {
  profile: any;
  onUpdated: (user: any) => void;
}) {
  const [form, setForm] = useState({
    fullName: profile?.fullName ?? '',
    email: profile?.email ?? '',
    phone: profile?.phone ?? '',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [ready, setReady] = useState(false);

  // Seed once the profile arrives.
  if (profile && !ready) {
    setForm({
      fullName: profile.fullName ?? '',
      email: profile.email ?? '',
      phone: profile.phone ?? '',
    });
    setReady(true);
  }

  const mutation = useMutation({
    mutationFn: () =>
      api.patch('/auth/profile', {
        fullName: form.fullName,
        email: form.email || '',
        phone: form.phone || '',
      }),
    onSuccess: async () => {
      toast.success('تم تحديث بياناتك');
      const fresh = await api.get('/auth/me');
      onUpdated(fresh.data);
    },
    onError: (error) => toast.error(apiError(error)),
  });

  const set = (key: keyof typeof form, value: string) => {
    setForm((f) => ({ ...f, [key]: value }));
    setErrors((e) => (e[key] ? { ...e, [key]: '' } : e));
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const next: Record<string, string> = {};
    if (!form.fullName.trim()) next.fullName = 'الاسم مطلوب';
    const mailErr = emailError(form.email);
    if (mailErr) next.email = mailErr;
    const phoneErr = phoneError(form.phone);
    if (phoneErr) next.phone = phoneErr;
    setErrors(next);
    if (Object.keys(next).length) return;
    mutation.mutate();
  };

  return (
    <Card title="بياناتي الشخصية" subtitle="اسم الدخول لا يمكن تغييره إلا من قِبل الإدارة">
      <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
        <Input
          label="الاسم الكامل"
          required
          value={form.fullName}
          onChange={(e) => set('fullName', e.target.value)}
          error={errors.fullName}
          className="sm:col-span-2"
        />
        <Input
          label="الجوال"
          value={form.phone}
          onChange={(e) => set('phone', e.target.value)}
          error={errors.phone}
          hint={PHONE_HINT}
          dir="ltr"
        />
        <Input
          label="البريد الإلكتروني"
          type="email"
          value={form.email}
          onChange={(e) => set('email', e.target.value)}
          error={errors.email}
          hint="اختياري — للتواصل فقط"
          dir="ltr"
        />
        <div className="sm:col-span-2">
          <Button type="submit" loading={mutation.isPending}>
            حفظ البيانات
          </Button>
        </div>
      </form>
    </Card>
  );
}
