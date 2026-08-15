import { FormEvent, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { api, apiError } from '@/lib/api';
import { useAuthStore } from '@/store/auth';
import { Avatar, Badge, Button, Card, Input, PageHeader, StatCard } from '@/components/ui';
import { IconAlert, IconCircleGroup, IconGraduation, IconLock, IconLogout, IconUser } from '@/components/ui/Icons';
import { EMPLOYMENT_LABELS, ROLE_COLORS, ROLE_LABELS } from '@/lib/labels';
import { formatDate, formatDateTime } from '@/lib/format';

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

      {profile?.mustChangePassword && (
        <div className="mb-5 flex items-start gap-3 rounded-2xl border-2 border-amber-300 bg-amber-50 px-5 py-4 text-amber-900">
          <IconAlert size={22} className="mt-0.5 shrink-0" />
          <div>
            <p className="text-base font-extrabold">يجب تغيير كلمة المرور قبل استخدام النظام</p>
            <p className="mt-1.5 text-sm leading-6">
              كلمة المرور الحالية عُيّنت لك من قِبل إدارة المدرسة. لحماية حسابك، اختر كلمة مرور جديدة
              يعرفها أنت وحدك من النموذج أدناه. لن تتمكن من تصفّح باقي الصفحات قبل ذلك.
            </p>
          </div>
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <div className="flex flex-col items-center gap-3 py-2 text-center">
            <Avatar name={user.fullName} src={user.avatarUrl} size={88} />
            <div>
              <h2 className="text-lg font-extrabold text-slate-800">{user.fullName}</h2>
              <p className="text-xs text-slate-400" dir="ltr">
                {user.email}
              </p>
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
                <StatCard label="الأجزاء المحفوظة" value={teacher.memorizedParts ?? 0} icon={<IconGraduation size={22} />} />
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
