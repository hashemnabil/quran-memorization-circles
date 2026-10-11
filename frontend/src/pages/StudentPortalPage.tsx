import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Card, ErrorState, LoadingState, PageHeader, ProgressBar, StatCard } from '@/components/ui';
import { IconAward, IconBook, IconClipboard } from '@/components/ui/Icons';
import { formatDateShort, formatParts } from '@/lib/format';

export default function StudentPortalPage() {
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['student', 'me'],
    queryFn: async () => (await api.get('/students/me')).data,
  });

  const history = useQuery({
    queryKey: ['student', 'me', 'history'],
    queryFn: async () => (await api.get('/students/me/history')).data,
  });

  if (isLoading) return <LoadingState rows={5} />;
  if (isError || !data) return <ErrorState message="تعذر تحميل ملفك الدراسي" onRetry={() => refetch()} />;

  return (
    <>
      <PageHeader title={data.fullName ?? 'ملفي الدراسي'} subtitle="متابعة الحضور والحفظ والتسميع والاختبارات" />
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

function Info({ label, value }: { label: string; value: unknown }) {
  return <div className="rounded-xl border border-slate-100 bg-slate-50 px-4 py-3"><p className="text-xs text-slate-500">{label}</p><p className="mt-1 text-sm font-bold text-slate-800">{value === null || value === undefined || value === '' ? '—' : String(value)}</p></div>;
}
