import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { api } from '@/lib/api';
import { localDashboard } from '@/lib/local-analytics';
import { useAuthStore } from '@/store/auth';
import {
  Badge,
  Card,
  EmptyState,
  ErrorState,
  LoadingState,
  PageHeader,
  ProgressBar,
  StatCard,
  cx,
} from '@/components/ui';
import {
  IconBell,
  IconChat,
  IconUser,
  IconAward,
  IconBook,
  IconCalendar,
  IconCircleGroup,
  IconClipboard,
  IconExchange,
  IconGraduation,
  IconLifeBuoy,
  IconPause,
  IconUsers,
} from '@/components/ui/Icons';
import {
  ATTENDANCE_COLORS,
  ATTENDANCE_LABELS,
  ATTENDANCE_ORDER,
  ATTENDANCE_SHORT,
  DAY_LABELS,
  EVALUATION_COLORS,
  EVALUATION_LABELS,
  ROLE_LABELS,
  STUDENT_STATUS_COLORS,
  STUDENT_STATUS_LABELS,
  TICKET_STATUS_COLORS,
  TICKET_STATUS_LABELS,
  describeExamSections,
  ticketRequesterName,
} from '@/lib/labels';
import { formatDateShort, formatDateTime, formatParts, formatTime, timeAgo } from '@/lib/format';
import type { Evaluation } from '@/types';

const CHART_COLORS = ['#1d7c55', '#dc2626', '#d98c26', '#0284c7'];

export default function DashboardPage() {
  const user = useAuthStore((s) => s.user)!;

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['dashboard', 'overview'],
    queryFn: async () => ['ADMIN', 'SUPERVISOR', 'TEACHER', 'EXAM_COMMITTEE'].includes(user.role) ? localDashboard(user.role) : (await api.get('/dashboard/overview')).data,
    refetchInterval: 120000,
  });

  if (isLoading) {
    return (
      <>
        <PageHeader title="الرئيسية" subtitle="جارٍ تجهيز ملخص اليوم..." />
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="card h-24 animate-pulse" />
          ))}
        </div>
      </>
    );
  }

  if (!data) {
    return <ErrorState message="تعذر تحميل لوحة المعلومات" onRetry={() => refetch()} />;
  }

  const greeting = `${ROLE_LABELS[user.role]} — ${user.fullName}`;

  return (
    <>
      <PageHeader
        title="الرئيسية"
        subtitle={greeting}
        action={
          <Badge className="bg-primary-50 text-primary-700">
            {new Intl.DateTimeFormat('ar-EG', { dateStyle: 'full', numberingSystem: 'latn' }).format(new Date())}
          </Badge>
        }
      />

      <section className="relative mb-6 overflow-hidden rounded-[1.5rem] border border-primary-900 bg-primary-900 px-5 py-7 text-white shadow-card sm:px-8 sm:py-8">
        <div className="pointer-events-none absolute -left-8 -top-10 h-40 w-40 rounded-full border-[24px] border-white/5" aria-hidden />
        <div className="pointer-events-none absolute -bottom-16 right-[42%] h-40 w-40 rounded-full border border-gold-300/15" aria-hidden />
        <div className="relative flex flex-col justify-between gap-5 sm:flex-row sm:items-center">
          <div className="max-w-2xl">
            <p className="mb-3 inline-flex items-center gap-2 rounded-full border border-gold-200/25 bg-gold-200/10 px-3 py-1.5 text-xs font-bold tracking-wide text-gold-100"><span className="h-1.5 w-1.5 rounded-full bg-gold-300" /> نظام إدارة حلقات تحفيظ القرآن الكريم</p>
            <h2 className="text-2xl font-extrabold leading-relaxed sm:text-3xl">أهلاً وسهلاً، {user.fullName}</h2>
            <p className="mt-2 max-w-xl text-sm leading-7 text-primary-100/90">كل ما تحتاجه لمتابعة حلقات التحفيظ والمهام اليومية، مرتب أمامك في مكان واحد.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link to="/support" className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/20 bg-white/10 px-3.5 py-2.5 text-sm font-bold transition hover:bg-white/20"><IconLifeBuoy size={17} /> الدعم الفني</Link>
            <Link to="/notifications" className="inline-flex items-center justify-center gap-2 rounded-xl bg-white px-3.5 py-2.5 text-sm font-bold text-primary-900 transition hover:bg-primary-50"><IconBell size={17} /> الإشعارات</Link>
          </div>
        </div>
      </section>

      <section className="mb-6">
        <div className="mb-3 flex items-end justify-between gap-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-primary-700">مساحة العمل</p>
            <h2 className="mt-1 text-lg font-extrabold text-slate-800">وصول سريع لأهم الأقسام</h2>
          </div>
          <span className="hidden text-xs text-slate-400 sm:block">اختصارات حسب صلاحيات حسابك</span>
        </div>
        <QuickAccess role={data.role} />
      </section>

      {data.role === 'ADMIN' && <AdminDashboard data={data} />}
      {data.role === 'SUPERVISOR' && <SupervisorDashboard data={data} />}
      {data.role === 'TEACHER' && <TeacherDashboard data={data} />}
      {data.role === 'EXAM_COMMITTEE' && <CommitteeDashboard data={data} />}
      {data.role === 'SUPPORT' && <SupportDashboard data={data} />}
      {data.role === 'PARENT' && <ParentDashboard data={data} />}
    </>
  );
}


// --- role-aware quick access ------------------------------------------------

function QuickAccess({ role }: { role: string }) {
  const links = role === 'ADMIN' ? [
    { to: '/circles', label: 'إدارة الحلقات', detail: 'الحلقات والمعلمون', icon: <IconCircleGroup size={21} />, tone: 'mint' },
    { to: '/students', label: 'شؤون الطلاب', detail: 'الملفات والمتابعة', icon: <IconGraduation size={21} />, tone: 'blue' },
    { to: '/attendance', label: 'الحضور والغياب', detail: 'متابعة الدوام اليومي', icon: <IconClipboard size={21} />, tone: 'amber' },
    { to: '/exams', label: 'الاختبارات', detail: 'المواعيد والنتائج', icon: <IconAward size={21} />, tone: 'violet' },
  ] : role === 'SUPERVISOR' ? [
    { to: '/circles', label: 'حلقاتي', detail: 'متابعة الحلقات', icon: <IconCircleGroup size={21} />, tone: 'mint' },
    { to: '/students', label: 'الطلاب', detail: 'الملفات والمتابعة', icon: <IconGraduation size={21} />, tone: 'blue' },
    { to: '/attendance', label: 'الحضور والغياب', detail: 'مراجعة الحضور', icon: <IconClipboard size={21} />, tone: 'amber' },
    { to: '/recitations', label: 'التسميع اليومي', detail: 'سجل التسميع', icon: <IconBook size={21} />, tone: 'violet' },
  ] : role === 'TEACHER' ? [
    { to: '/circles', label: 'حلقاتي', detail: 'معلومات الحلقة', icon: <IconCircleGroup size={21} />, tone: 'mint' },
    { to: '/attendance', label: 'تسجيل الحضور', detail: 'حضور الطلاب اليومي', icon: <IconClipboard size={21} />, tone: 'blue' },
    { to: '/recitations', label: 'التسميع اليومي', detail: 'متابعة الحفظ', icon: <IconBook size={21} />, tone: 'amber' },
    { to: '/exams', label: 'الاختبارات', detail: 'المواعيد والنتائج', icon: <IconAward size={21} />, tone: 'violet' },
  ] : role === 'EXAM_COMMITTEE' ? [
    { to: '/exams', label: 'الاختبارات', detail: 'المواعيد والطلبات', icon: <IconAward size={21} />, tone: 'mint' },
    { to: '/students', label: 'الطلاب', detail: 'الوصول لملفات الطلاب', icon: <IconGraduation size={21} />, tone: 'blue' },
    { to: '/notifications', label: 'الإشعارات', detail: 'آخر المستجدات', icon: <IconBell size={21} />, tone: 'amber' },
    { to: '/chat', label: 'المحادثات', detail: 'التواصل مع الفريق', icon: <IconChat size={21} />, tone: 'violet' },
  ] : role === 'SUPPORT' ? [
    { to: '/support', label: 'طلبات الدعم', detail: 'متابعة التذاكر', icon: <IconLifeBuoy size={21} />, tone: 'mint' },
    { to: '/notifications', label: 'الإشعارات', detail: 'آخر المستجدات', icon: <IconBell size={21} />, tone: 'blue' },
    { to: '/profile', label: 'الملف الشخصي', detail: 'بيانات حسابك', icon: <IconUser size={21} />, tone: 'amber' },
    { to: '/chat', label: 'المحادثات', detail: 'التواصل مع الفريق', icon: <IconChat size={21} />, tone: 'violet' },
  ] : role === 'PARENT' ? [
    { to: '/profile', label: 'الملف الشخصي', detail: 'بيانات حسابك', icon: <IconGraduation size={21} />, tone: 'mint' },
    { to: '/notifications', label: 'الإشعارات', detail: 'آخر المستجدات', icon: <IconBell size={21} />, tone: 'blue' },
    { to: '/chat', label: 'المحادثات', detail: 'التواصل مع المدرسة', icon: <IconChat size={21} />, tone: 'amber' },
    { to: '/support', label: 'الدعم الفني', detail: 'مساعدة ومتابعة الطلبات', icon: <IconLifeBuoy size={21} />, tone: 'violet' },
  ] : [
    { to: '/student', label: 'ملفي الدراسي', detail: 'متابعة تقدمك', icon: <IconGraduation size={21} />, tone: 'mint' },
    { to: '/my-files', label: 'ملفاتي', detail: 'الملفات والشهادات', icon: <IconBook size={21} />, tone: 'blue' },
    { to: '/notifications', label: 'الإشعارات', detail: 'آخر المستجدات', icon: <IconBell size={21} />, tone: 'amber' },
    { to: '/chat', label: 'المحادثات', detail: 'التواصل مع المعلمين', icon: <IconChat size={21} />, tone: 'violet' },
  ];

  const tones: Record<string, string> = {
    mint: 'bg-emerald-50 text-emerald-700 ring-emerald-100',
    blue: 'bg-sky-50 text-sky-700 ring-sky-100',
    amber: 'bg-amber-50 text-amber-700 ring-amber-100',
    violet: 'bg-violet-50 text-violet-700 ring-violet-100',
  };

  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {links.map((item) => (
        <Link key={item.to} to={item.to} className="quick-access-card group flex min-w-0 items-center gap-3 rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm transition duration-200 hover:-translate-y-1 hover:border-primary-200 hover:shadow-lg">
          <span className={cx('grid h-12 w-12 shrink-0 place-items-center rounded-2xl ring-1 transition group-hover:scale-105', tones[item.tone])}>{item.icon}</span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-extrabold text-slate-800">{item.label}</span>
            <span className="mt-1 block truncate text-xs text-slate-500">{item.detail}</span>
          </span>
          <span className="text-slate-300 transition group-hover:-translate-x-0.5 group-hover:text-primary-600" aria-hidden>←</span>
        </Link>
      ))}
    </div>
  );
}

// --- shared pieces ----------------------------------------------------------

function AttendanceDonut({ attendance }: { attendance: any }) {
  const rows = ATTENDANCE_ORDER.map((key) => ({
    name: ATTENDANCE_SHORT[key],
    value: attendance?.[key] ?? 0,
    key,
  }))
    .filter((r) => r.value > 0);

  if (!rows.length) {
    return (
      <EmptyState
        title="لم يُسجَّل حضور اليوم"
        message="سيظهر ملخص الحضور هنا بمجرد تسجيله من قبل المعلمين."
        icon={<IconClipboard size={24} />}
      />
    );
  }

  return (
    <div className="flex flex-col items-center gap-4 sm:flex-row">
      <div className="h-44 w-full sm:w-52">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={rows} dataKey="value" nameKey="name" innerRadius={44} outerRadius={70} paddingAngle={2}>
              {rows.map((row, i) => (
                <Cell key={row.key} fill={CHART_COLORS[ATTENDANCE_ORDER.indexOf(row.key)] ?? CHART_COLORS[i]} />
              ))}
            </Pie>
            <Tooltip contentStyle={{ direction: 'rtl', borderRadius: 12, fontSize: 12 }} />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <div className="flex-1 space-y-2">
        <p className="text-sm text-slate-500">
          نسبة الحضور اليوم:{' '}
          <span className="numeric text-lg font-extrabold text-primary-700">{attendance.rate}%</span>
        </p>
        {ATTENDANCE_ORDER.map((key) => (
          <div key={key} className="flex items-center justify-between text-xs">
            <Badge className={ATTENDANCE_COLORS[key]}>{ATTENDANCE_LABELS[key]}</Badge>
            <span className="numeric font-bold text-slate-600">{attendance[key] ?? 0}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function WeeklyAttendanceChart({ data }: { data: any[] }) {
  if (!data?.length) {
    return <EmptyState title="لا توجد بيانات حضور بعد" icon={<IconCalendar size={24} />} />;
  }
  const rows = data.map((d) => ({
    date: formatDateShort(d.date),
    حاضر: d.PRESENT,
    'بعذر': d.EXCUSED,
    'بدون عذر': d.ABSENT,
  }));

  return (
    <div className="h-64">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={rows} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
          <defs>
            <linearGradient id="present" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#1d7c55" stopOpacity={0.35} />
              <stop offset="95%" stopColor="#1d7c55" stopOpacity={0} />
            </linearGradient>
            <linearGradient id="absent" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#dc2626" stopOpacity={0.3} />
              <stop offset="95%" stopColor="#dc2626" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
          <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#94a3b8' }} tickLine={false} axisLine={false} />
          <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} tickLine={false} axisLine={false} allowDecimals={false} />
          <Tooltip contentStyle={{ direction: 'rtl', borderRadius: 12, fontSize: 12, border: '1px solid #e2e8f0' }} />
          <Legend wrapperStyle={{ fontSize: 12, direction: 'rtl' }} />
          <Area type="monotone" dataKey="حاضر" stroke="#1d7c55" fill="url(#present)" strokeWidth={2} />
          <Area type="monotone" dataKey="بدون عذر" stroke="#dc2626" fill="url(#absent)" strokeWidth={2} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

function PendingRow({
  to,
  label,
  count,
  icon,
  tone,
}: {
  to: string;
  label: string;
  count: number;
  icon: React.ReactNode;
  tone: string;
}) {
  return (
    <Link
      to={to}
      className="flex items-center gap-3 rounded-xl border border-slate-100 px-3.5 py-3 transition hover:border-primary-200 hover:bg-primary-50/40"
    >
      <span className={cx('grid h-9 w-9 shrink-0 place-items-center rounded-lg', tone)}>{icon}</span>
      <span className="flex-1 text-sm font-semibold text-slate-700">{label}</span>
      <span
        className={cx(
          'numeric grid h-7 min-w-7 place-items-center rounded-lg px-2 text-sm font-extrabold',
          count > 0 ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-400',
        )}
      >
        {count}
      </span>
    </Link>
  );
}

// --- admin ------------------------------------------------------------------

function AdminDashboard({ data }: { data: any }) {
  const evaluations = (data.evaluationBreakdown ?? []).map((e: any) => ({
    name: EVALUATION_LABELS[e.evaluation as Evaluation] ?? e.evaluation,
    value: e.count,
  }));

  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="إجمالي الطلاب" value={data.counts.students} icon={<IconGraduation size={22} />} hint={`${data.counts.activeStudents} منتظم`} />
        <StatCard label="المعلمون" value={data.counts.teachers} icon={<IconUsers size={22} />} tone="sky" />
        <StatCard label="الحلقات" value={data.counts.circles} icon={<IconCircleGroup size={22} />} tone="purple" hint={`${data.counts.activeCircles} مفعّلة`} />
        <StatCard label="الطلاب الموقوفون" value={data.counts.suspendedStudents} icon={<IconPause size={22} />} tone="red" />
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <Card title="الطلبات المعلقة" subtitle="بانتظار قرار الإدارة" className="lg:col-span-1">
          <div className="space-y-2">
            <PendingRow to="/transfers" label="طلبات النقل" count={data.pending.transfers} icon={<IconExchange size={17} />} tone="bg-sky-50 text-sky-600" />
            <PendingRow to="/suspensions" label="طلبات الإيقاف" count={data.pending.suspensions} icon={<IconPause size={17} />} tone="bg-red-50 text-red-600" />
            <PendingRow to="/exams" label="طلبات الاختبار" count={data.pending.examRequests} icon={<IconAward size={17} />} tone="bg-gold-50 text-gold-700" />
            <PendingRow to="/support" label="تذاكر الدعم المفتوحة" count={data.pending.supportTickets} icon={<IconLifeBuoy size={17} />} tone="bg-slate-100 text-slate-600" />
          </div>
        </Card>

        <Card title="حضور اليوم" className="lg:col-span-1">
          <AttendanceDonut attendance={data.attendanceToday} />
        </Card>

        <Card title="توزيع التقييمات" className="lg:col-span-1">
          {evaluations.length ? (
            <div className="h-52">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={evaluations} margin={{ top: 8, right: 8, left: -22, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                  <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#94a3b8' }} tickLine={false} axisLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} tickLine={false} axisLine={false} allowDecimals={false} />
                  <Tooltip contentStyle={{ direction: 'rtl', borderRadius: 12, fontSize: 12 }} cursor={{ fill: '#f1f5f9' }} />
                  <Bar dataKey="value" name="عدد الطلاب" fill="#1d7c55" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <EmptyState title="لا توجد تقييمات بعد" icon={<IconAward size={24} />} />
          )}
        </Card>
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <Card title="الحضور خلال أسبوعين" className="lg:col-span-2">
          <WeeklyAttendanceChart data={data.weeklyAttendance} />
        </Card>

        <Card title="أكبر الحلقات" subtitle="حسب عدد الطلاب">
          <div className="space-y-3.5">
            {data.topCircles?.length ? (
              data.topCircles.map((c: any) => (
                <Link key={c.id} to={`/circles/${c.id}`} className="block">
                  <div className="mb-1 flex items-center justify-between text-xs">
                    <span className="font-bold text-slate-700">{c.name}</span>
                    <span className="numeric text-slate-500">
                      {c.students}/{c.capacity}
                    </span>
                  </div>
                  <ProgressBar value={c.students} max={c.capacity} tone={c.fillRate >= 90 ? 'amber' : 'primary'} />
                </Link>
              ))
            ) : (
              <EmptyState title="لا توجد حلقات" icon={<IconCircleGroup size={24} />} />
            )}
          </div>
        </Card>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card title="الاختبارات القادمة" action={<Link to="/exams" className="text-xs font-bold text-primary-700 hover:underline">عرض الكل</Link>}>
          {data.nextExams?.length ? (
            <ul className="divide-y divide-slate-100">
              {data.nextExams.map((exam: any) => (
                <li key={exam.id} className="flex items-center justify-between gap-3 py-2.5">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-slate-700">{exam.student.fullName}</p>
                    <p className="text-xs text-slate-400">{describeExamSections(exam.section, exam.sections)}</p>
                  </div>
                  <div className="shrink-0 text-left">
                    <p className="text-xs font-bold text-slate-600">{formatDateTime(exam.scheduledAt)}</p>
                    {exam.examiner && <p className="text-[11px] text-slate-400">{exam.examiner.fullName}</p>}
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState title="لا توجد اختبارات مجدولة" icon={<IconAward size={24} />} />
          )}
        </Card>

        <Card title="النشاط الأخير">
          {data.activity?.length ? (
            <ul className="space-y-3">
              {data.activity.slice(0, 8).map((entry: any) => (
                <li key={entry.id} className="flex gap-3">
                  <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-primary-400" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-slate-700">{entry.summary}</p>
                    <p className="text-[11px] text-slate-400">
                      {entry.user?.fullName ?? 'النظام'} — {timeAgo(entry.createdAt)}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState title="لا يوجد نشاط بعد" icon={<IconCalendar size={24} />} />
          )}
        </Card>
      </div>
    </div>
  );
}

// --- supervisor -------------------------------------------------------------

function SupervisorDashboard({ data }: { data: any }) {
  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="حلقاتي" value={data.counts.circles} icon={<IconCircleGroup size={22} />} />
        <StatCard label="الطلاب" value={data.counts.students} icon={<IconGraduation size={22} />} tone="sky" hint={`${data.counts.activeStudents} منتظم`} />
        <StatCard label="المعلمون" value={data.counts.teachers} icon={<IconUsers size={22} />} tone="purple" />
        <StatCard label="الموقوفون" value={data.counts.suspendedStudents} icon={<IconPause size={22} />} tone="red" />
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <Card title="حضور اليوم">
          <AttendanceDonut attendance={data.attendanceToday} />
        </Card>
        <Card title="الحضور خلال أسبوعين" className="lg:col-span-2">
          <WeeklyAttendanceChart data={data.weeklyAttendance} />
        </Card>
      </div>

      <Card title="الحلقات التي أشرف عليها" padded={false}>
        {data.circles?.length ? (
          <div className="table-wrap border-0 shadow-none">
            <table className="table">
              <thead>
                <tr>
                  <th>الحلقة</th>
                  <th>المعلم الأساسي</th>
                  <th>المساعدون</th>
                  <th>الطلاب</th>
                  <th>الموعد</th>
                  <th>الحالة</th>
                </tr>
              </thead>
              <tbody>
                {data.circles.map((c: any) => (
                  <tr key={c.id}>
                    <td>
                      <Link to={`/circles/${c.id}`} className="font-bold text-primary-700 hover:underline">
                        {c.name}
                      </Link>
                      <span className="block text-[11px] text-slate-400">{c.code}</span>
                    </td>
                    <td className="text-slate-600">{c.primaryTeacher ?? '—'}</td>
                    <td className="text-xs text-slate-500">
                      {c.assistants?.length ? c.assistants.join('، ') : '—'}
                    </td>
                    <td>
                      <span className="numeric font-bold">{c.students}</span>
                      <span className="text-xs text-slate-400"> / {c.capacity}</span>
                    </td>
                    <td className="text-xs text-slate-500">
                      {c.scheduleDays?.map((d: string) => DAY_LABELS[d] ?? d).join('، ') || '—'}
                      <span className="block">{formatTime(c.startTime)}</span>
                    </td>
                    <td>
                      <Badge className={c.isActive ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-600'}>
                        {c.isActive ? 'مفعّلة' : 'موقوفة'}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState title="لم يتم إسنادك لأي حلقة بعد" icon={<IconCircleGroup size={24} />} />
        )}
      </Card>

      {data.suspendedList?.length > 0 && (
        <Card title="الطلاب الموقوفون حالياً">
          <ul className="divide-y divide-slate-100">
            {data.suspendedList.map((s: any) => (
              <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                <div>
                  <Link to={`/students/${s.student.id}`} className="text-sm font-semibold text-slate-700 hover:text-primary-700">
                    {s.student.fullName}
                  </Link>
                  <p className="text-xs text-slate-400">{s.reason}</p>
                </div>
                <Badge className="bg-red-100 text-red-800">
                  متبقٍ <span className="numeric">{s.remainingDays}</span> يوم
                </Badge>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}

// --- teacher ----------------------------------------------------------------

function TeacherDashboard({ data }: { data: any }) {
  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="حلقاتي" value={data.counts.circles} icon={<IconCircleGroup size={22} />} />
        <StatCard label="طلابي" value={data.counts.students} icon={<IconGraduation size={22} />} tone="sky" />
        <StatCard label="تسميع آخر ٧ أيام" value={data.counts.recitationsLast7Days} icon={<IconBook size={22} />} tone="emerald" />
        <StatCard label="طلبات اختبار معلقة" value={data.counts.pendingExamRequests} icon={<IconAward size={22} />} tone="amber" />
      </div>

      <Card title="حلقاتي اليوم" subtitle="سجّل الحضور بنقرة واحدة" padded={false}>
        {data.circles?.length ? (
          <ul className="divide-y divide-slate-100">
            {data.circles.map((c: any) => (
              <li key={c.id} className="flex flex-wrap items-center gap-3 px-5 py-4">
                <div className="min-w-0 flex-1">
                  <Link to={`/circles/${c.id}`} className="font-bold text-slate-800 hover:text-primary-700">
                    {c.name}
                  </Link>
                  <p className="text-xs text-slate-400">
                    {c.scheduleDays?.map((d: string) => DAY_LABELS[d] ?? d).join('، ')} —{' '}
                    {formatTime(c.startTime)} إلى {formatTime(c.endTime)}
                    {c.location ? ` — ${c.location}` : ''}
                  </p>
                </div>
                <Badge className="bg-slate-100 text-slate-600">
                  <span className="numeric">{c.students}</span> طالب
                </Badge>
                {c.attendanceRecordedToday ? (
                  <Badge className="bg-emerald-100 text-emerald-800">تم تسجيل الحضور</Badge>
                ) : (
                  <Link to={`/attendance?circleId=${c.id}`} className="btn-primary btn-sm">
                    تسجيل الحضور
                  </Link>
                )}
                <Link to={`/recitations?circleId=${c.id}`} className="btn-secondary btn-sm">
                  التسميع
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState title="لم يتم إسنادك لأي حلقة" message="يرجى مراجعة الإدارة لإسنادك إلى حلقة." icon={<IconCircleGroup size={24} />} />
        )}
      </Card>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card title="حضور اليوم">
          <AttendanceDonut attendance={data.attendanceToday} />
        </Card>
        <Card title="اختبارات طلابي القادمة">
          {data.upcomingExams?.length ? (
            <ul className="divide-y divide-slate-100">
              {data.upcomingExams.map((exam: any) => (
                <li key={exam.id} className="flex items-center justify-between gap-3 py-2.5">
                  <div className="min-w-0">
                    <Link to={`/students/${exam.student.id}`} className="truncate text-sm font-semibold text-slate-700 hover:text-primary-700">
                      {exam.student.fullName}
                    </Link>
                    <p className="text-xs text-slate-400">{describeExamSections(exam.section, exam.sections)}</p>
                  </div>
                  <p className="shrink-0 text-xs font-bold text-slate-600">{formatDateTime(exam.scheduledAt)}</p>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState title="لا توجد اختبارات مجدولة" icon={<IconAward size={24} />} />
          )}
        </Card>
      </div>

      <Card title="الحضور خلال أسبوعين">
        <WeeklyAttendanceChart data={data.weeklyAttendance} />
      </Card>
    </div>
  );
}

// --- exam committee ---------------------------------------------------------

function CommitteeDashboard({ data }: { data: any }) {
  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="قائمة الانتظار" value={data.counts.waitingList} icon={<IconClipboard size={22} />} tone="amber" />
        <StatCard label="اختبارات مجدولة" value={data.counts.scheduled} icon={<IconCalendar size={22} />} tone="sky" />
        <StatCard label="ناجحون" value={data.counts.passed} icon={<IconAward size={22} />} tone="emerald" hint={`نسبة النجاح ${data.counts.passRate}%`} />
        <StatCard label="لم يجتازوا" value={data.counts.failed} icon={<IconAward size={22} />} tone="red" />
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card
          title="قائمة الانتظار"
          subtitle="طلبات بانتظار الجدولة"
          action={<Link to="/exams" className="text-xs font-bold text-primary-700 hover:underline">إدارة الطلبات</Link>}
        >
          {data.waitingListPreview?.length ? (
            <ul className="divide-y divide-slate-100">
              {data.waitingListPreview.map((req: any) => (
                <li key={req.id} className="flex items-center justify-between gap-3 py-2.5">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-slate-700">{req.student.fullName}</p>
                    <p className="text-xs text-slate-400">
                      {req.student.circle?.name} — بطلب من {req.teacher.user.fullName}
                    </p>
                  </div>
                  <Badge className="bg-gold-100 text-gold-800 shrink-0">{describeExamSections(req.section, req.sections)}</Badge>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState title="قائمة الانتظار فارغة" icon={<IconClipboard size={24} />} />
          )}
        </Card>

        <Card title="الاختبارات القادمة">
          {data.nextExams?.length ? (
            <ul className="divide-y divide-slate-100">
              {data.nextExams.map((exam: any) => (
                <li key={exam.id} className="flex items-center justify-between gap-3 py-2.5">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-slate-700">{exam.student.fullName}</p>
                    <p className="text-xs text-slate-400">
                      {describeExamSections(exam.section, exam.sections)} — {exam.student.circle?.name}
                    </p>
                  </div>
                  <div className="shrink-0 text-left">
                    <p className="text-xs font-bold text-slate-600">{formatDateTime(exam.scheduledAt)}</p>
                    {exam.examiner && <p className="text-[11px] text-slate-400">{exam.examiner.fullName}</p>}
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState title="لا توجد اختبارات مجدولة" icon={<IconCalendar size={24} />} />
          )}
        </Card>
      </div>
    </div>
  );
}

// --- support ----------------------------------------------------------------

function SupportDashboard({ data }: { data: any }) {
  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="مفتوحة" value={data.counts.open} icon={<IconLifeBuoy size={22} />} tone="amber" />
        <StatCard label="قيد المعالجة" value={data.counts.inProgress} icon={<IconClipboard size={22} />} tone="sky" />
        <StatCard label="مُسندة إليّ" value={data.counts.assignedToMe} icon={<IconUsers size={22} />} tone="purple" />
        <StatCard label="تم حلها" value={data.counts.resolved} icon={<IconAward size={22} />} tone="emerald" />
      </div>

      <Card
        title="أحدث التذاكر"
        action={<Link to="/support" className="text-xs font-bold text-primary-700 hover:underline">عرض الكل</Link>}
        padded={false}
      >
        {data.recentTickets?.length ? (
          <ul className="divide-y divide-slate-100">
            {data.recentTickets.map((t: any) => (
              <li key={t.id}>
                <Link to={`/support/${t.id}`} className="flex flex-wrap items-center gap-3 px-5 py-3.5 transition hover:bg-slate-50">
                  <span className="numeric text-xs font-bold text-slate-400">#{t.number}</span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-slate-700">{t.subject}</p>
                    <p className="text-xs text-slate-400">
                      {ticketRequesterName(t)} — {timeAgo(t.createdAt)}
                    </p>
                  </div>
                  <Badge className={TICKET_STATUS_COLORS[t.status as keyof typeof TICKET_STATUS_COLORS]}>
                    {TICKET_STATUS_LABELS[t.status as keyof typeof TICKET_STATUS_LABELS]}
                  </Badge>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState title="لا توجد تذاكر مفتوحة" icon={<IconLifeBuoy size={24} />} />
        )}
      </Card>
    </div>
  );
}

// --- parent -----------------------------------------------------------------

function ParentDashboard({ data }: { data: any }) {
  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="عدد الأبناء" value={data.counts.children} icon={<IconGraduation size={22} />} />
        <StatCard label="غياب هذا الشهر" value={data.counts.absencesThisMonth} icon={<IconClipboard size={22} />} tone="amber" />
        <StatCard label="موقوفون" value={data.counts.suspended} icon={<IconPause size={22} />} tone="red" />
      </div>

      <Card title="أبنائي" action={<Link to="/parent/children" className="text-xs font-bold text-primary-700 hover:underline">المتابعة التفصيلية</Link>} padded={false}>
        {data.children?.length ? (
          <ul className="divide-y divide-slate-100">
            {data.children.map((child: any) => (
              <li key={child.id}>
                <Link to={`/parent/children/${child.id}`} className="flex flex-wrap items-center gap-3 px-5 py-4 transition hover:bg-slate-50">
                  <div className="min-w-0 flex-1">
                    <p className="font-bold text-slate-800">{child.fullName}</p>
                    <p className="numeric text-xs text-slate-400">{formatParts(child.memorizedParts)} جزء محفوظ</p>
                  </div>
                  {child.evaluation && (
                    <Badge className={EVALUATION_COLORS[child.evaluation as Evaluation]}>
                      {EVALUATION_LABELS[child.evaluation as Evaluation]}
                    </Badge>
                  )}
                  <Badge className={STUDENT_STATUS_COLORS[child.status as keyof typeof STUDENT_STATUS_COLORS]}>
                    {STUDENT_STATUS_LABELS[child.status as keyof typeof STUDENT_STATUS_LABELS]}
                  </Badge>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState title="لا يوجد أبناء مرتبطون بحسابك" message="يرجى مراجعة الإدارة لربط أبنائك بالحساب." icon={<IconGraduation size={24} />} />
        )}
      </Card>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card title="الاختبارات القادمة">
          {data.upcomingExams?.length ? (
            <ul className="divide-y divide-slate-100">
              {data.upcomingExams.map((exam: any) => (
                <li key={exam.id} className="flex items-center justify-between gap-3 py-2.5">
                  <div>
                    <p className="text-sm font-semibold text-slate-700">{exam.student.fullName}</p>
                    <p className="text-xs text-slate-400">{describeExamSections(exam.section, exam.sections)}</p>
                  </div>
                  <p className="text-xs font-bold text-slate-600">{formatDateTime(exam.scheduledAt)}</p>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState title="لا توجد اختبارات مجدولة" icon={<IconAward size={24} />} />
          )}
        </Card>

        <Card title="آخر التسميع">
          {data.recentRecitations?.length ? (
            <ul className="divide-y divide-slate-100">
              {data.recentRecitations.map((r: any) => (
                <li key={r.id} className="py-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-semibold text-slate-700">{r.student.fullName}</p>
                    {r.score != null && (
                      <Badge className="bg-primary-50 text-primary-700 numeric">{r.score}/100</Badge>
                    )}
                  </div>
                  <p className="text-xs text-slate-400">
                    {r.fromSurah} <span className="numeric">{r.fromAyah}</span> — {r.toSurah}{' '}
                    <span className="numeric">{r.toAyah}</span> • {formatDateShort(r.date)}
                  </p>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState title="لا توجد سجلات تسميع" icon={<IconBook size={24} />} />
          )}
        </Card>
      </div>
    </div>
  );
}
