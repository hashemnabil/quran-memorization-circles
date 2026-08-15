import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import {
  Avatar,
  Badge,
  Card,
  EmptyState,
  ErrorState,
  LoadingState,
  PageHeader,
  ProgressBar,
  cx,
} from '@/components/ui';
import { IconAward, IconBook, IconClipboard, IconGraduation, IconPause, IconPhone } from '@/components/ui/Icons';
import {
  DAY_LABELS,
  EVALUATION_COLORS,
  EVALUATION_LABELS,
  STUDENT_STATUS_COLORS,
  STUDENT_STATUS_LABELS,
} from '@/lib/labels';
import { calcAge, formatDateShort, formatDateTime, formatTime } from '@/lib/format';

export default function ParentChildrenPage() {
  const [activeId, setActiveId] = useState<string | null>(null);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['parents', 'my-children'],
    queryFn: async () => (await api.get('/parents/my-children')).data,
  });

  // Default to the first child once the list arrives.
  useEffect(() => {
    if (data?.length && !data.some((c: any) => c.id === activeId)) setActiveId(data[0].id);
  }, [data, activeId]);

  if (isLoading) return <LoadingState rows={4} />;
  if (isError) return <ErrorState message="تعذر تحميل بيانات الأبناء" onRetry={() => refetch()} />;

  if (!data?.length) {
    return (
      <>
        <PageHeader title="متابعة الأبناء" />
        <Card>
          <EmptyState
            title="لا يوجد أبناء مرتبطون بحسابك"
            message="يرجى مراجعة إدارة المدرسة لربط أبنائك بحسابك في النظام."
            icon={<IconGraduation size={24} />}
          />
        </Card>
      </>
    );
  }

  const child = data.find((c: any) => c.id === activeId) ?? data[0];
  const multiple = data.length > 1;

  return (
    <>
      <PageHeader
        title="متابعة الأبناء"
        subtitle={
          multiple
            ? `لديك ${data.length} أبناء — اختر أحدهم لعرض تفاصيله`
            : 'ملخص حالة ابنك ومستواه في الحلقة'
        }
      />

      {/* With several children a full card each becomes a wall of text, so the
          children collapse into a compact picker and only one detail panel shows. */}
      {multiple && (
        <div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {data.map((c: any) => {
            const selected = c.id === child.id;
            return (
              <button
                key={c.id}
                onClick={() => setActiveId(c.id)}
                aria-pressed={selected}
                className={cx(
                  'card card-hover flex items-center gap-3 p-3.5 text-right transition',
                  selected ? 'ring-2 ring-primary-500' : 'hover:bg-slate-50',
                )}
              >
                <Avatar name={c.fullName} size={44} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-bold text-slate-800">{c.fullName}</span>
                  <span className="numeric block text-[11px] text-slate-400">
                    {c.circle?.name ?? 'بدون حلقة'}
                  </span>
                  <span className="mt-1 flex flex-wrap items-center gap-1">
                    <Badge
                      className={cx(
                        'text-[10px]',
                        c.attendance.rate >= 80
                          ? 'bg-emerald-100 text-emerald-800'
                          : c.attendance.rate >= 60
                            ? 'bg-amber-100 text-amber-800'
                            : 'bg-red-100 text-red-800',
                      )}
                    >
                      حضور <span className="numeric">{c.attendance.rate}%</span>
                    </Badge>
                    {c.status === 'SUSPENDED' && (
                      <Badge className="bg-red-100 text-red-800 text-[10px]">موقوف</Badge>
                    )}
                    {c.activeSuspension && c.status !== 'SUSPENDED' && (
                      <Badge className="bg-amber-100 text-amber-800 text-[10px]">إيقاف سارٍ</Badge>
                    )}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      )}

      <ChildPanel child={child} />
    </>
  );
}

function ChildPanel({ child }: { child: any }) {
  return (
    <Card padded={false}>
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 px-5 py-4">
        <div className="flex min-w-0 items-center gap-3">
          <Avatar name={child.fullName} size={48} />
          <div className="min-w-0">
            <h2 className="truncate text-lg font-extrabold text-slate-800">{child.fullName}</h2>
            <p className="numeric text-xs text-slate-400">
              {child.code} • {calcAge(child.birthDate)}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {child.evaluation && (
            <Badge className={EVALUATION_COLORS[child.evaluation as keyof typeof EVALUATION_COLORS]}>
              {EVALUATION_LABELS[child.evaluation as keyof typeof EVALUATION_LABELS]}
            </Badge>
          )}
          <Badge className={STUDENT_STATUS_COLORS[child.status as keyof typeof STUDENT_STATUS_COLORS]}>
            {STUDENT_STATUS_LABELS[child.status as keyof typeof STUDENT_STATUS_LABELS]}
          </Badge>
        </div>
      </header>

      <div className="p-5">
        {child.activeSuspension && (
          <div className="mb-5 flex items-start gap-2 rounded-xl bg-red-50 px-4 py-3 text-xs text-red-800">
            <IconPause size={16} className="mt-0.5 shrink-0" />
            <span>
              موقوف — متبقٍ <span className="numeric font-bold">{child.activeSuspension.remainingDays}</span> يوم.
              السبب: {child.activeSuspension.reason}
            </span>
          </div>
        )}

        <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Metric
            label="نسبة الحضور"
            value={`${child.attendance.rate}%`}
            tone={child.attendance.rate >= 80 ? 'emerald' : child.attendance.rate >= 60 ? 'amber' : 'red'}
          />
          <Metric label="غياب" value={child.attendance.absent} tone="red" />
          <Metric label="بعذر" value={child.attendance.excused} tone="slate" />
          <Metric label="الأجزاء" value={child.memorizedParts} tone="primary" />
        </div>

        <div className="mb-5">
          <div className="mb-1.5 flex justify-between text-xs">
            <span className="text-slate-400">تقدم الحفظ</span>
            <span className="numeric font-bold text-slate-700">{child.memorizedParts} / 30 جزء</span>
          </div>
          <ProgressBar value={child.memorizedParts} max={30} showLabel />
        </div>

        <div className="grid gap-x-8 gap-y-2 border-t border-slate-100 pt-4 text-xs md:grid-cols-2">
          <Row label="الحلقة" value={child.circle?.name} />
          <Row label="المعلم" value={child.teacherName} />
          <Row
            label="جوال المعلم"
            value={
              child.teacherPhone ? (
                <a
                  href={`tel:${child.teacherPhone}`}
                  className="numeric inline-flex items-center gap-1 text-primary-700 hover:underline"
                >
                  <IconPhone size={13} /> {child.teacherPhone}
                </a>
              ) : null
            }
          />
          <Row label="المشرف" value={child.circle?.supervisor?.fullName} />
          <Row
            label="موعد الحلقة"
            value={
              child.circle
                ? `${child.circle.scheduleDays?.map((d: string) => DAY_LABELS[d] ?? d).join('، ')} — ${formatTime(
                    child.circle.startTime,
                  )}`
                : null
            }
          />
          <Row label="المكان" value={child.circle?.location} />
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <Highlight
            icon={<IconBook size={16} />}
            title="آخر تسميع"
            tone="sky"
            body={
              child.lastRecitation ? (
                <>
                  {child.lastRecitation.fromSurah} <span className="numeric">({child.lastRecitation.fromAyah})</span> —{' '}
                  {child.lastRecitation.toSurah} <span className="numeric">({child.lastRecitation.toAyah})</span>
                  <span className="numeric mt-0.5 block text-[11px] opacity-70">
                    {formatDateShort(child.lastRecitation.date)}
                  </span>
                </>
              ) : (
                'لا يوجد تسميع مسجّل بعد'
              )
            }
          />
          <Highlight
            icon={<IconAward size={16} />}
            title="الاختبار القادم"
            tone="gold"
            body={
              child.upcomingExam ? (
                <>
                  {child.upcomingExam.section.name}
                  <span className="mt-0.5 block text-[11px] opacity-70">
                    {formatDateTime(child.upcomingExam.scheduledAt)}
                  </span>
                </>
              ) : (
                'لا يوجد اختبار مجدول'
              )
            }
          />
        </div>

        <Link to={`/parent/children/${child.id}`} className="btn-primary mt-5 w-full">
          عرض التفاصيل الكاملة
        </Link>
      </div>
    </Card>
  );
}

function Metric({ label, value, tone }: { label: string; value: React.ReactNode; tone: string }) {
  const tones: Record<string, string> = {
    emerald: 'bg-emerald-50 text-emerald-700',
    amber: 'bg-amber-50 text-amber-700',
    red: 'bg-red-50 text-red-700',
    primary: 'bg-primary-50 text-primary-700',
    slate: 'bg-slate-100 text-slate-600',
  };
  return (
    <div className={cx('rounded-xl px-3 py-2.5 text-center', tones[tone])}>
      <p className="numeric text-xl font-extrabold">{value}</p>
      <p className="text-[10px] font-semibold opacity-80">{label}</p>
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-slate-50 py-1.5 last:border-0">
      <span className="shrink-0 text-slate-400">{label}</span>
      <span className="text-left font-semibold text-slate-700">{value || '—'}</span>
    </div>
  );
}

function Highlight({
  icon,
  title,
  body,
  tone,
}: {
  icon: React.ReactNode;
  title: string;
  body: React.ReactNode;
  tone: 'sky' | 'gold';
}) {
  const tones = {
    sky: 'bg-sky-50 text-sky-900',
    gold: 'bg-gold-50 text-gold-900',
  };
  return (
    <div className={cx('rounded-xl px-4 py-3', tones[tone])}>
      <p className="mb-1 flex items-center gap-1.5 text-[11px] font-bold opacity-80">
        {icon}
        {title}
      </p>
      <p className="text-sm font-semibold leading-6">{body}</p>
    </div>
  );
}
