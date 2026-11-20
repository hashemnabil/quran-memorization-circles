import { Navigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import PrayerCard from '@/components/PrayerCard';
import HonorRoll, { CircleHonorRoll } from '@/components/HonorRoll';
import { ErrorState, LoadingState, PageHeader, StatCard } from '@/components/ui';
import { IconAward, IconBook, IconClipboard, IconTrendUp } from '@/components/ui/Icons';
import { api } from '@/lib/api';
import { formatParts } from '@/lib/format';
import { useAuthStore } from '@/store/auth';

export default function StudentHomePage() {
  const user = useAuthStore((state) => state.user);
  const student = useQuery({
    queryKey: ['student', 'me'],
    enabled: !user?.mustChangePassword,
    queryFn: async () => (await api.get('/students/me')).data,
  });

  if (user?.mustChangePassword) return <Navigate to="/student" replace />;

  return (
    <>
      <PageHeader
        title={`أهلًا بك${student.data?.fullName || user?.fullName ? ` يا ${student.data?.fullName ?? user?.fullName}` : ''}`}
        subtitle="رحلتك مع القرآن مستمرة؛ اجعل لك اليوم وردًا وإنجازًا جديدًا."
      />

      <PrayerCard />

      {student.isLoading ? <LoadingState rows={2} /> : student.isError || !student.data ? (
        <ErrorState message="تعذر تحميل إحصائياتك" onRetry={() => student.refetch()} />
      ) : (
        <section className="my-5 grid grid-cols-2 gap-3 lg:grid-cols-4" aria-label="إحصائياتي">
          <StatCard label="نسبة الحضور" value={`${student.data.attendanceSummary?.attendanceRate ?? 0}%`} icon={<IconClipboard size={22} />} />
          <StatCard label="النقاط" value={student.data.points?.total ?? student.data.totalPoints ?? 0} icon={<IconTrendUp size={22} />} tone="amber" />
          <StatCard label="الأجزاء المحفوظة" value={formatParts(student.data.memorizedParts ?? 0)} icon={<IconBook size={22} />} tone="sky" />
          <StatCard label="الاختبارات المجتازة" value={student.data.examSummary?.passed ?? 0} icon={<IconAward size={22} />} tone="emerald" />
        </section>
      )}

      <section className="grid items-start gap-3 xl:grid-cols-2" aria-label="لوحات الشرف">
        <HonorRoll />
        <CircleHonorRoll />
      </section>
    </>
  );
}
