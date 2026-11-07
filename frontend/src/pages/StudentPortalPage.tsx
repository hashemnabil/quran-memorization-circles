import QuranAchievementHeart from '@/components/QuranAchievementHeart';
import { notifyWriteSuccess } from '@/lib/write-feedback';
import { FormEvent, useEffect, useState } from 'react';
import PrayerCard from '@/components/PrayerCard';
import { SURAHS } from '@/lib/quran-surahs';
import { exportAchievementReport } from '@/lib/achievement-report';
import { saveDeviceFile } from '@/lib/save-device-file';
import MemorizationPlans from '@/components/MemorizationPlans';
import DailyOverview from '@/components/DailyOverview';
import { useLocation, useNavigate } from 'react-router-dom';
import { useQuery, useMutation } from '@tanstack/react-query';
import { api, apiError } from '@/lib/api';
import toast from 'react-hot-toast';
import { useAuthStore } from '@/store/auth';
import { Button, Card, ErrorState, Input, LoadingState, PageHeader, ProgressBar, StatCard } from '@/components/ui';
import { IconAward, IconBook, IconClipboard } from '@/components/ui/Icons';
import { formatDateShort, formatParts } from '@/lib/format';
import StudentQuestionnaire from '@/components/StudentQuestionnaire';
import { StudentPhoto } from '@/components/StudentPhoto';
import { EVALUATION_LABELS } from '@/lib/labels';
import type { Evaluation } from '@/types';
import { passwordError as newPasswordError } from '@/lib/validation';
import { rememberOfflineLogin } from '@/lib/offline-login';

export default function StudentPortalPage() {
  const [now, setNow] = useState(Date.now);
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 60000); return () => clearInterval(timer); }, []);
  const { user, logout } = useAuthStore();
  const navigate = useNavigate();
  const { hash, pathname } = useLocation();
  const achievementsOnly = pathname === '/student/achievements';
  const [attendanceLimit, setAttendanceLimit] = useState(12);
  const [recitationLimit, setRecitationLimit] = useState(12);
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
    onSuccess: async (_offlineWriteResult) => {
      notifyWriteSuccess(_offlineWriteResult, 'تم تغيير كلمة المرور. سجّل الدخول بكلمة المرور الجديدة.');
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
  useEffect(() => {
    if (!data || !hash) return;
    const id = hash.slice(1);
    if (!['student-plans', 'student-warnings', 'student-evaluations', 'student-attendance', 'student-recitations'].includes(id)) return;
    const frame = requestAnimationFrame(() => document.getElementById(id)?.scrollIntoView({block: 'start', behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth'}));
    return () => cancelAnimationFrame(frame);
  }, [data?.id, hash]);

  if (user?.mustChangePassword) {
    return (
      <div className="mx-auto max-w-xl">
        <PageHeader title="تغيير كلمة المرور" subtitle="لأمان حسابك، يجب تغيير كلمة المرور المؤقتة قبل متابعة ملفك الدراسي." />
        <Card title="تعيين كلمة مرور جديدة">
          <form onSubmit={submitPassword} className="grid gap-4">
            <Input label="كلمة المرور المؤقتة" type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} required dir="ltr" />
            <Input label="كلمة المرور الجديدة" type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} required hint="أي طول تختاره" dir="ltr" />
            <Input label="تأكيد كلمة المرور الجديدة" type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required dir="ltr" />
            {passwordError && <p role="alert" className="text-sm text-red-600">{passwordError}</p>}
            <Button type="submit" loading={changePassword.isPending}>حفظ كلمة المرور</Button>
          </form>
        </Card>
      </div>
    );
  }

  if (isLoading) return <><PrayerCard /><LoadingState rows={5} /></>;
  if (isError || !data) return <><PrayerCard /><ErrorState message="تعذر تحميل ملفك الدراسي" onRetry={() => refetch()} /></>;

  return (
    <>
      {!achievementsOnly && <><PageHeader title={data.fullName ?? 'ملفي الدراسي'} subtitle="متابعة الحضور والحفظ والتسميع والاختبارات" />
      <PrayerCard />
      <div className="mb-5"><StudentPhoto studentId={data.id} fullName={data.fullName} photoUrl={data.photoUrl} size={80} editable onChanged={() => { void refetch(); }} /></div>
      <StudentQuestionnaire key={data.id} profile={data} />
      </>}
      {achievementsOnly && <button type="button" onClick={() => navigate("/student")} className="mb-5 rounded-xl border border-emerald-300 px-4 py-2 font-bold text-emerald-800">← العودة إلى صفحتي</button>}
      <section id="my-achievements" className="mb-5 scroll-mt-24">
        <Card title={achievementsOnly ? "لوحة إنجازاتي القرآنية" : "إنجازاتي القرآنية"}>
          {achievementsOnly && <><div className="mb-5 rounded-3xl bg-gradient-to-l from-emerald-900 to-teal-700 p-6 text-white"><p className="text-sm">لوحة الإنجازات الشخصية</p><h1 className="mt-2 text-3xl font-extrabold">{data.fullName}</h1><p className="mt-2">{data.circle?.name ?? "بدون حلقة"}</p></div><div className="mb-5 grid gap-3 sm:grid-cols-3"><div className="rounded-2xl bg-emerald-50 p-5"><p>الأجزاء المحفوظة</p><strong className="text-3xl text-emerald-800">{Math.max(0, Math.min(30, Number(data.memorizedParts) || 0))} / 30</strong></div><div className="rounded-2xl bg-rose-50 p-5"><p>السور المكتملة</p><strong className="text-3xl text-rose-700">{SURAHS.filter(surah => (data.surahCompletions ?? []).some((entry: {surah: string}) => entry.surah === surah.name)).length} / 114</strong></div><div className="rounded-2xl bg-amber-50 p-5"><p>نسبة حفظ الأجزاء</p><strong className="text-3xl text-amber-800">{Math.round(Math.max(0, Math.min(30, Number(data.memorizedParts) || 0)) / 30 * 100)}٪</strong></div></div></>}
          {!achievementsOnly && <Button variant="secondary" className="mb-4" onClick={() => navigate("/student/achievements")}>فتح لوحة إنجازاتي الكاملة</Button>}
          <p className="text-sm text-slate-600">الأجزاء المحفوظة: <strong>{Math.max(0, Math.min(30, Number(data.memorizedParts) || 0))} من 30</strong></p>
          <ProgressBar value={Math.max(0, Math.min(30, Number(data.memorizedParts) || 0))} max={30} showLabel />
          <h3 className="mt-5 text-center text-lg font-bold text-rose-700">قلبي القرآني</h3>
          <p className="mb-3 text-center text-sm text-slate-600">{SURAHS.filter(surah => (data.surahCompletions ?? []).some((entry: {surah: string}) => entry.surah === surah.name)).length} من 114 سورة مكتملة</p>
          <QuranAchievementHeart completed={new Set((data.surahCompletions ?? []).map((entry: {surah: string}) => entry.surah))} />
          <p className="mt-3 text-xs text-slate-500">الأحمر للسور المثبت إتمامها في سجلك، والرمادي للسور التي لم يُسجّل إتمامها بعد.</p>
          <Button variant="secondary" className="mt-4" onClick={async () => {
            try {
              const pdf = await exportAchievementReport(data);
              await saveDeviceFile(pdf, 'إنجازاتي-القرآنية.pdf');
            } catch { toast.error('تعذّر حفظ تقرير الإنجازات'); }
          }}>تنزيل تقرير إنجازاتي PDF</Button>
        </Card>
      </section>
      {!achievementsOnly && <><DailyOverview/>
      <section id="student-plans" className="scroll-mt-24"><MemorizationPlans studentId={data.id}/></section>
      {data.activeSuspension && <Card title="قرار الإيقاف أو التحويل" className="mb-5">
        <p className="whitespace-pre-wrap">{data.activeSuspension.reason}</p>
        <p className="mt-2 text-sm">من {formatDateShort(data.activeSuspension.startDate)}{data.activeSuspension.endDate ? ` إلى ${formatDateShort(data.activeSuspension.endDate)}` : ' — إلى حين قرار الإدارة'}</p>
        {data.activeSuspension.remainingDays != null && <p>الأيام المتبقية: {data.activeSuspension.remainingDays}</p>}
      </Card>}
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
      <Card title="نتائج اختباراتي" className="mb-5">
        {history.isLoading ? <LoadingState rows={2} /> : history.isError ? <ErrorState message="تعذر تحميل النتائج" onRetry={() => history.refetch()} /> :
          history.data?.exams?.some((exam: any) => exam.result) ? history.data.exams.filter((exam: any) => exam.result).map((exam: any) =>
            <article key={exam.id} className="border-b py-3">
              <strong>{exam.sections?.map((entry: any) => entry.section?.name).filter(Boolean).join('، ') || exam.section?.name}</strong>
              <p>{exam.result === 'PASSED' ? 'ناجح' : 'لم يجتز'} — {exam.score ?? '—'} / 100{exam.evaluation ? ` — ${EVALUATION_LABELS[exam.evaluation as Evaluation] || exam.evaluation}` : ''}</p>
              {exam.notes && <p className="whitespace-pre-wrap text-sm">{exam.notes}</p>}
              <small>{formatDateShort(exam.gradedAt || exam.scheduledAt)}</small>
            </article>) : <p>لا توجد نتائج اختبارات مسجلة.</p>}
      </Card>
      <div className="mb-5 flex flex-wrap gap-3">
        <Button variant="secondary" onClick={() => navigate('/notifications')}>الإشعارات والإنذارات</Button>
        <Button variant="secondary" onClick={() => navigate('/chat')}>الرسائل</Button>
        <Button variant="secondary" onClick={() => navigate('/my-files')}>التقارير والشهادات</Button>
        <Button variant="secondary" onClick={() => navigate('/absence-permissions')}>أذونات الغياب</Button>
      </div>
      <div className="mb-5 grid gap-5 xl:grid-cols-2">
        <section id="student-warnings" className="scroll-mt-24"><Card title="الإنذارات والاستدعاءات">
          {data.summons?.length ? data.summons.map((item: any) => <article key={item.id} className="border-b py-3">
            <strong>{item.title}</strong><p className="whitespace-pre-wrap text-sm">{item.body}</p><small>{formatDateShort(item.createdAt)}</small>
          </article>) : <p>لا توجد استدعاءات مسجلة.</p>}
        </Card></section>
        <section id="student-evaluations" className="scroll-mt-24"><Card title="التقييمات والملاحظات">
          {data.evaluations?.map((item: any) => <article key={item.id} className="border-b py-3">
            <strong>{EVALUATION_LABELS[item.evaluation as Evaluation] || item.evaluation}</strong><p>{item.note}</p><small>{formatDateShort(item.createdAt)}</small>
          </article>)}
          {data.noteEntries?.map((item: any) => <p key={item.id} className="py-2">{item.body}</p>)}
          {!data.evaluations?.length && !data.noteEntries?.length && <p>لا توجد تقييمات أو ملاحظات مسجلة.</p>}
        </Card></section>
      </div>
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
          <Info label="التقييم الحالي" value={data.evaluation ? EVALUATION_LABELS[data.evaluation as Evaluation] : null} />
          <Info label="ملاحظة التقييم" value={data.evaluationNote} />
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
        <section id="student-attendance" className="scroll-mt-24"><Card title="سجل الحضور والغياب">
          {history.isLoading ? <LoadingState rows={2}/> : history.isError ? <ErrorState message="تعذر تحميل سجل الحضور" onRetry={()=>void history.refetch()}/> : history.data?.attendance?.length ? <div className="space-y-2">
            {history.data.attendance.slice(0, attendanceLimit).map((item: any) => <div key={item.id} className="flex items-center justify-between gap-3 border-b border-slate-100 py-2 text-sm">
              <span>{formatDateShort(item.date)}</span>
              <strong>{item.status === 'PRESENT' ? 'حاضر' : item.status === 'ABSENT' ? 'غائب' : item.status === 'EXCUSED' ? 'غياب بعذر' : item.status}</strong>
              {item.note && <span className="text-xs text-slate-500">{item.note}</span>}
            </div>)}
            {history.data.attendance.length > attendanceLimit && <Button variant="secondary" onClick={()=>setAttendanceLimit(limit=>limit+12)}>عرض سجلات حضور أقدم</Button>}
          </div> : <p className="text-sm text-slate-500">لا توجد سجلات حضور متاحة.</p>}
        </Card></section>
        <section id="student-recitations" className="scroll-mt-24"><Card title="سجل التسميع">
          {history.isLoading ? <LoadingState rows={2}/> : history.isError ? <ErrorState message="تعذر تحميل سجل التسميع" onRetry={()=>void history.refetch()}/> : history.data?.recitations?.length ? <div className="space-y-2">
            {history.data.recitations.slice(0, recitationLimit).map((item: any) => <div key={item.id} className="border-b border-slate-100 py-2 text-sm">
              <div className="flex items-center justify-between gap-3"><strong>{item.fromSurah} ({item.fromAyah}) — {item.toSurah} ({item.toAyah})</strong><span className="text-xs text-slate-500">{formatDateShort(item.date)}</span></div>
              <p className="mt-1 text-xs text-slate-500">النقاط: {item.points ?? 0} · الأخطاء: {item.mistakes ?? 0} · التنبيهات: {item.warnings ?? 0}</p>
              {item.evaluation && <p className="text-sm">{EVALUATION_LABELS[item.evaluation as Evaluation] || item.evaluation}</p>}
            </div>)}
            {history.data.recitations.length > recitationLimit && <Button variant="secondary" onClick={()=>setRecitationLimit(limit=>limit+12)}>عرض سجلات تسميع أقدم</Button>}
          </div> : <p className="text-sm text-slate-500">لا توجد سجلات تسميع متاحة.</p>}
        </Card></section>
      </div></>}
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
