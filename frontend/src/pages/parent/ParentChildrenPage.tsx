import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
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
import { IconAward, IconBook, IconGraduation, IconPause, IconPhone } from '@/components/ui/Icons';
import {
  DAY_LABELS,
  STUDENT_STATUS_LABELS,
  describeExamSections,
} from '@/lib/labels';
import { calcAge, formatDateShort, formatDateTime, formatParts, formatTime } from '@/lib/format';
import { StudentPhoto } from '@/components/StudentPhoto';

/**
 * The parent's view of their children.
 *
 * Deliberately quiet: a parent reads this page to find out how their child is
 * doing, and a wall of green, amber, red, sky and gold panels makes every fact
 * look equally urgent. Colour is reserved for the two things that genuinely
 * carry a signal — a poor attendance rate and an active suspension — and
 * everything else is the neutral surface the rest of the system uses.
 */
export default function ParentChildrenPage() {
  const queryClient = useQueryClient();
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
            const flag = statusFlag(c);
            return (
              <button
                key={c.id}
                onClick={() => setActiveId(c.id)}
                aria-pressed={selected}
                className={cx(
                  'card flex items-center gap-3 p-3.5 text-right transition',
                  selected
                    ? 'ring-2 ring-primary-500'
                    : 'hover:border-primary-200 hover:bg-slate-50',
                )}
              >
                <Avatar name={c.fullName} src={c.photoUrl} size={44} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-bold text-slate-800">{c.fullName}</span>
                  <span className="block truncate text-[11px] text-slate-400">
                    {c.circle?.name ?? 'بدون حلقة'}
                  </span>
                  <span className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px]">
                    <span className={cx('font-bold', rateTone(c.attendance.rate))}>
                      حضور <span className="numeric">{c.attendance.rate}%</span>
                    </span>
                    {flag && (
                      <Badge className="bg-amber-100 text-[10px] text-amber-800">{flag}</Badge>
                    )}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      )}

      <ChildPanel
        child={child}
        onPhotoChanged={() => queryClient.invalidateQueries({ queryKey: ['parents', 'my-children'] })}
      />
    </>
  );
}

/** The one label worth flagging on the picker: not in a circle, or suspended. */
function statusFlag(child: any): string | null {
  if (child.status === 'SUSPENDED') return STUDENT_STATUS_LABELS.SUSPENDED;
  if (child.status === 'ACTIVITY') return STUDENT_STATUS_LABELS.ACTIVITY;
  return null;
}

/** Attendance is the one figure that earns a colour, and only when it is low. */
function rateTone(rate: number) {
  if (rate >= 80) return 'text-slate-500';
  if (rate >= 60) return 'text-amber-700';
  return 'text-red-700';
}

function ChildPanel({ child, onPhotoChanged }: { child: any; onPhotoChanged: () => void }) {
  const suspension = child.activeSuspension;
  const inActivity = child.status === 'ACTIVITY' || suspension?.action === 'ACTIVITY_PROGRAM';

  return (
    <Card padded={false}>
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 px-5 py-4">
        <div className="flex min-w-0 items-center gap-3">
          {/* The guardian is the one who has a photo of their own child. */}
          <StudentPhoto
            studentId={child.id}
            fullName={child.fullName}
            photoUrl={child.photoUrl}
            size={52}
            editable
            onChanged={onPhotoChanged}
          />
          <div className="min-w-0">
            <h2 className="truncate text-lg font-extrabold text-slate-800">{child.fullName}</h2>
            <p className="numeric text-xs text-slate-400">
              {child.code} • {calcAge(child.birthDate)}
            </p>
          </div>
        </div>
        <Badge className="bg-slate-100 text-slate-600">
          {STUDENT_STATUS_LABELS[child.status as keyof typeof STUDENT_STATUS_LABELS]}
        </Badge>
      </header>

      <div className="p-5">
        {suspension && (
          <div className="mb-5 flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs leading-6 text-amber-900">
            <IconPause size={16} className="mt-1 shrink-0" />
            <span>
              <span className="font-bold">
                {inActivity ? 'محوّل إلى برنامج النشاط' : 'إيقاف سارٍ'}
              </span>
              {/* An activity transfer is open-ended, so there is no countdown to show. */}
              {!inActivity && suspension.remainingDays != null && (
                <>
                  {' '}
                  — متبقٍ <span className="numeric font-bold">{suspension.remainingDays}</span> يوم
                </>
              )}
              {suspension.reason && <span className="block text-amber-800/80">السبب: {suspension.reason}</span>}
            </span>
          </div>
        )}

        <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Metric label="نسبة الحضور" value={`${child.attendance.rate}%`} tone={rateTone(child.attendance.rate)} />
          <Metric label="غياب" value={child.attendance.absent} />
          <Metric label="بعذر" value={child.attendance.excused} />
          <Metric label="الأجزاء" value={formatParts(child.memorizedParts)} />
        </div>

        <div className="mb-5">
          <div className="mb-1.5 flex justify-between text-xs">
            <span className="text-slate-400">تقدم الحفظ</span>
            <span className="numeric font-bold text-slate-700">{formatParts(child.memorizedParts)} / 30 جزء</span>
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
            body={
              child.lastRecitation ? (
                <>
                  {child.lastRecitation.fromSurah} <span className="numeric">({child.lastRecitation.fromAyah})</span> —{' '}
                  {child.lastRecitation.toSurah} <span className="numeric">({child.lastRecitation.toAyah})</span>
                  <span className="numeric mt-0.5 block text-[11px] font-normal text-slate-400">
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
            body={
              child.upcomingExam ? (
                <>
                  {describeExamSections(child.upcomingExam.section, child.upcomingExam.sections)}
                  <span className="mt-0.5 block text-[11px] font-normal text-slate-400">
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

function Metric({ label, value, tone }: { label: string; value: React.ReactNode; tone?: string }) {
  return (
    <div className="rounded-xl border border-slate-100 bg-slate-50/70 px-3 py-2.5 text-center">
      <p className={cx('numeric text-xl font-extrabold', tone ?? 'text-slate-700')}>{value}</p>
      <p className="text-[10px] font-semibold text-slate-400">{label}</p>
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
}: {
  icon: React.ReactNode;
  title: string;
  body: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-slate-100 bg-white px-4 py-3">
      <p className="mb-1 flex items-center gap-1.5 text-[11px] font-bold text-slate-400">
        <span className="grid h-6 w-6 place-items-center rounded-lg bg-primary-50 text-primary-700">
          {icon}
        </span>
        {title}
      </p>
      <p className="text-sm font-semibold leading-6 text-slate-700">{body}</p>
    </div>
  );
}
