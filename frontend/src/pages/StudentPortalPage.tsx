import { FormEvent, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation } from '@tanstack/react-query';
import { api, apiError } from '@/lib/api';
import toast from 'react-hot-toast';
import { useAuthStore } from '@/store/auth';
import { Button, Card, ErrorState, Input, LoadingState, PageHeader, ProgressBar, StatCard } from '@/components/ui';
import { IconAward, IconBook, IconClipboard } from '@/components/ui/Icons';
import { formatDateShort, formatParts } from '@/lib/format';
import StudentQuestionnaire from '@/components/StudentQuestionnaire';
import { passwordError as newPasswordError } from '@/lib/validation';
import { rememberOfflineLogin } from '@/lib/offline-login';
import { PasswordStrength } from '@/components/PasswordStrength';

export default function StudentPortalPage() {
  const [now, setNow] = useState(Date.now);
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 60000); return () => clearInterval(timer); }, []);
  const { user, logout } = useAuthStore();
  const navigate = useNavigate();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const changePassword = useMutation({
    mutationFn: async () => {
      const result = await api.patch('/auth/change-password', { currentPassword, newPassword });
      if (user) await rememberOfflineLogin(user.username, newPassword, { ...user, mustChangePassword: false });
      return result;
    },
    onSuccess: async () => {
      toast.success('تم تغيير كلمة المرور. سجّل الدخول بكلمة المرور الجديدة.');
      await logout();
      navigate('/login', { replace: true });
    },
    onError: (error) => toast.error(apiError(error)),
  });
  const submitPassword = (event: FormEvent) => {
    event.preventDefault();
    if (!currentPassword || newPasswordError(newPassword) || newPassword !== confirmPassword || newPassword === currentPassword) {
      setPasswordError(!currentPassword ? 'كلمة المرور المؤقتة مطلوبة' : newPasswordError(newPassword) || (newPassword !== confirmPassword ? 'كلمتا المرور غير متطابقتين' : 'اختر كلمة مرور مختلفة عن المؤقتة'));
      return;
    }
    setPasswordError('');
    changePassword.mutate();
  };
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['student', 'me'],
    enabled: !user?.mustChangePassword,
    queryFn: async () => (await api.get('/students/me')).data,
  });

  const history = useQuery({
    queryKey: ['student', 'me', 'history'],
    enabled: !user?.mustChangePassword,
    queryFn: async () => (await api.get('/students/me/history')).data,
  });

  if (user?.mustChangePassword) {
    return (
      <div className="mx-auto max-w-xl">
        <PageHeader title="تغيير كلمة المرور" subtitle="لأمان حسابك، يجب تغيير كلمة المرور المؤقتة قبل متابعة ملفك الدراسي." />
        <Card title="تعيين كلمة مرور جديدة">
          <form onSubmit={submitPassword} className="grid gap-4">
            <Input label="كلمة المرور المؤقتة" type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} required dir="ltr" />
            <Input label="كلمة المرور الجديدة" type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} required dir="ltr" />
            <PasswordStrength value={newPassword} />
            <Input label="تأكيد كلمة المرور الجديدة" type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required dir="ltr" />
            {passwordError && <p role="alert" className="text-sm text-red-600">{passwordError}</p>}
            <Button type="submit" loading={changePassword.isPending}>حفظ كلمة المرور</Button>
          </form>
        </Card>
      </div>
    );
  }

  if (isLoading) return <LoadingState rows={5} />;
  if (isError || !data) return <ErrorState message="تعذر تحميل ملفك الدراسي" onRetry={() => refetch()} />;

  return (
    <>
      <PageHeader title={data.fullName ?? 'ملفي الدراسي'} subtitle="متابعة الحضور والحفظ والتسميع والاختبارات" />
      <StudentQuestionnaire key={data.id} profile={data} />
      <Card title="مواعيد اختباراتي" className="mb-5">
        {history.isLoading ? <LoadingState rows={2} /> : history.isError ? <ErrorState message="تعذر تحميل مواعيد الاختبارات" onRetry={() => history.refetch()} /> :
          history.data?.exams?.some((exam: any) => exam.status === 'SCHEDULED') ?
          <div className="space-y-3">{history.data.exams.filter((exam: any) => exam.status === 'SCHEDULED')
            .sort((a: any, b: any) => Date.parse(a.scheduledAt) - Date.parse(b.scheduledAt)).map((exam: any) =>
              <article key={exam.id} className="rounded-xl border border-primary-100 bg-primary-50/50 p-4">
                <strong>{exam.sections?.map((entry: any) => entry.section?.name).filter(Boolean).join('، ') || exam.section?.name || 'اختبار قادم'}</strong>
                <p className="mt-2 text-sm">{new Date(exam.scheduledAt).toLocaleString('ar', { dateStyle: 'full', timeStyle: 'short', timeZone: 'Asia/Riyadh' })} (توقيت الرياض)</p>
                <p className="mt-2 font-semibold text-primary-700">{Date.parse(exam.scheduledAt) > now
                  ? `متبقي على الاختبار ${Math.floor((Date.parse(exam.scheduledAt) - now) / 86400000)} يوم و${Math.floor((Date.parse(exam.scheduledAt) - now) / 3600000) % 24} ساعة و${Math.floor((Date.parse(exam.scheduledAt) - now) / 60000) % 60} دقيقة`
                  : 'حان موعد الاختبار؛ راجع المحفظ لتأكيد الموعد والنتيجة'}</p>
                {exam.location && <p className="mt-1 text-sm">المكان: {exam.location}</p>}
                {Date.parse(exam.scheduledAt) > Date.now() && Date.parse(exam.scheduledAt) - Date.now() <= 86400000 &&
                  <p className="mt-2 font-semibold text-primary-700">تذكير: اختبارك خلال الـ24 ساعة القادمة</p>}
              </article>)}</div> : <p className="text-sm text-slate-500">لا يوجد موعد اختبار محدد حاليًا.</p>}
      </Card>
      <StudentPreparations />
      <div className="mb-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="نسبة الحضور" value={`${data.attendanceSummary?.attendanceRate ?? 0}%`} icon={<IconClipboard size={22} />} />
        <StatCard label="مرات الحضور" value={data.attendanceSummary?.present ?? 0} icon={<IconClipboard size={22} />} />
        <StatCard label="الأجزاء المحفوظة" value={formatParts(data.memorizedParts ?? 0)} icon={<IconBook size={22} />} hint="من 30 جزءاً" />
        <StatCard label="الاختبارات المجتازة" value={data.examSummary?.passed ?? 0} icon={<IconAward size={22} />} />
      </div>
      <Card title="بياناتي الدراسية">
        <div className="grid gap-3 sm:grid-cols-2">
          <Info label="رقم الطالب" value={data.code} />
          <Info label="الحلقة" value={data.circle?.name} />
          <Info label="المعلم" value={data.circle?.teachers?.map((x: any) => x.teacher?.user?.fullName).filter(Boolean).join('، ')} />
          <Info label="السورة الحالية" value={data.currentSurah} />
          <Info label="الصفحة الحالية" value={data.currentPage} />
          <Info label="النقاط" value={data.points?.total ?? data.totalPoints ?? 0} />
          <Info label="آخر تسميع" value={data.lastRecitation ? `${data.lastRecitation.fromSurah} — ${data.lastRecitation.toSurah} (${formatDateShort(data.lastRecitation.date)})` : 'لا يوجد تسميع مسجل'} />
          <Info label="آخر اختبار مجتاز" value={data.examSummary?.lastPassedSection} />
        </div>
        <div className="mt-5">
          <div className="mb-2 flex justify-between text-sm"><span>تقدم الحفظ</span><strong>{formatParts(data.memorizedParts ?? 0)} / 30</strong></div>
          <ProgressBar value={data.memorizedParts ?? 0} max={30} showLabel />
        </div>
      </Card>
      <Card className="mt-5" title="ملخص سجلاتي">
        <div className="grid gap-3 sm:grid-cols-3">
          <Info label="أيام الحضور" value={data.attendanceSummary?.present ?? 0} />
          <Info label="أيام الغياب" value={data.attendanceSummary?.absent ?? 0} />
          <Info label="جلسات التسميع" value={data.points?.sessions ?? 0} />
          <Info label="الأجزاء/السور المكتملة" value={data.points?.surahsCompleted ?? 0} />
          <Info label="الأبيات/الآيات المسجلة" value={data.points?.verses ?? 0} />
          <Info label="الدورات" value={data.courses?.filter((c: any) => c.isCurrent).map((c: any) => c.name).join('، ') || 'لا توجد دورة حالية'} />
        </div>
      </Card>
      <div className="mt-5 grid gap-5 xl:grid-cols-2">
        <Card title="سجل الحضور والغياب">
          {history.data?.attendance?.length ? <div className="space-y-2">
            {history.data.attendance.slice(0, 12).map((item: any) => <div key={item.id} className="flex items-center justify-between gap-3 border-b border-slate-100 py-2 text-sm">
              <span>{formatDateShort(item.date)}</span>
              <strong>{item.status === 'PRESENT' ? 'حاضر' : item.status === 'ABSENT' ? 'غائب' : item.status === 'EXCUSED' ? 'غياب بعذر' : item.status}</strong>
            </div>)}
          </div> : <p className="text-sm text-slate-500">لا توجد سجلات حضور متاحة.</p>}
        </Card>
        <Card title="سجل التسميع">
          {history.data?.recitations?.length ? <div className="space-y-2">
            {history.data.recitations.slice(0, 12).map((item: any) => <div key={item.id} className="border-b border-slate-100 py-2 text-sm">
              <div className="flex items-center justify-between gap-3"><strong>{item.fromSurah} ({item.fromAyah}) — {item.toSurah} ({item.toAyah})</strong><span className="text-xs text-slate-500">{formatDateShort(item.date)}</span></div>
              <p className="mt-1 text-xs text-slate-500">النقاط: {item.points ?? 0} · الأخطاء: {item.mistakes ?? 0} · التنبيهات: {item.warnings ?? 0}</p>
            </div>)}
          </div> : <p className="text-sm text-slate-500">لا توجد سجلات تسميع متاحة.</p>}
        </Card>
      </div>
    </>
  );
}

function StudentPreparations() {
  const [page, setPage] = useState(1);
  const assignments = useQuery({
    queryKey: ['preparations', 'student', page],
    queryFn: async () => (await api.get('/preparations', { params: { page, limit: 20 } })).data,
  });
  return <Card title="التحضير المطلوب" className="mb-5">
    {assignments.isLoading ? <LoadingState rows={2} /> : assignments.isError ?
      <ErrorState message="تعذر تحميل التحضير" onRetry={() => assignments.refetch()} /> :
      assignments.data?.data?.length ? <div className="space-y-3">{assignments.data.data.map((item: any) =>
        <article key={item.id} className="rounded-xl border border-slate-100 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2"><strong>{item.fromSurah} ({item.fromAyah}) — {item.toSurah} ({item.toAyah})</strong>
            <span className={item.completedAt ? 'text-emerald-700' : 'text-slate-600'}>{item.completedAt ? 'مكتمل' : 'مطلوب التحضير'}</span></div>
          {item.dueDate && <p className="mt-2 text-sm">موعد التسميع: {formatDateShort(item.dueDate)}</p>}
          {item.teacher?.user?.fullName && <p className="mt-1 text-sm">المحفظ: {item.teacher.user.fullName}</p>}
          {item.note && <p className="mt-2 whitespace-pre-wrap text-sm text-slate-600">{item.note}</p>}
        </article>)}</div> : <p className="text-sm text-slate-500">لا يوجد تحضير مسجل لك حاليًا.</p>}
    {(page > 1 || assignments.data?.meta?.hasNextPage) && <div className="mt-4 flex gap-2">
      <Button variant="secondary" disabled={page === 1} onClick={() => setPage(value => value - 1)}>السابق</Button>
      <Button variant="secondary" disabled={!assignments.data?.meta?.hasNextPage} onClick={() => setPage(value => value + 1)}>التالي</Button>
    </div>}
  </Card>;
}

function Info({ label, value }: { label: string; value: unknown }) {
  return <div className="rounded-xl border border-slate-100 bg-slate-50 px-4 py-3"><p className="text-xs text-slate-500">{label}</p><p className="mt-1 text-sm font-bold text-slate-800">{value === null || value === undefined || value === '' ? '—' : String(value)}</p></div>;
}
