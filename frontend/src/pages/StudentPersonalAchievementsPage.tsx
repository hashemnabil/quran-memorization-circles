import { Link, Navigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import QuranAchievementHeart from '@/components/QuranAchievementHeart';
import { Button, Card, ErrorState, LoadingState, PageHeader, ProgressBar } from '@/components/ui';
import { api } from '@/lib/api';
import { SURAHS } from '@/lib/quran-surahs';
import { exportAchievementReport } from '@/lib/achievement-report';
import { saveDeviceFile } from '@/lib/save-device-file';
import { useAuthStore } from '@/store/auth';
import type { Student } from '@/types';

export default function StudentPersonalAchievementsPage() {
  const user = useAuthStore(state => state.user);
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['student', 'me'],
    queryFn: async () => (await api.get<Student>('/students/me')).data,
    enabled: !user?.mustChangePassword,
  });
  if (user?.mustChangePassword) return <Navigate to="/student" replace />;
  if (isLoading) return <LoadingState rows={4} />;
  if (isError || !data) return <ErrorState message="تعذر تحميل إنجازاتك" onRetry={() => void refetch()} />;
  return <>
    <PageHeader title="إنجازاتي القرآنية" subtitle="متابعة الحفظ والمراجعة والتثبيت" breadcrumb={<Link to="/student">ملفي الدراسي</Link>} />
      <section id="my-achievements" className="mb-5 scroll-mt-24">
        <Card title="لوحة إنجازاتي القرآنية">
          <><div className="mb-5 rounded-3xl bg-gradient-to-l from-emerald-900 to-teal-700 p-6 text-white"><p className="text-sm">لوحة الإنجازات الشخصية</p><h1 className="mt-2 text-3xl font-extrabold">{data.fullName}</h1><p className="mt-2">{data.circle?.name ?? "بدون حلقة"}</p></div><div className="mb-5 grid gap-3 sm:grid-cols-3"><div className="rounded-2xl bg-emerald-50 p-5"><p>الأجزاء المحفوظة</p><strong className="text-3xl text-emerald-800">{Math.max(0, Math.min(30, Number(data.memorizedParts) || 0))} / 30</strong></div><div className="rounded-2xl bg-rose-50 p-5"><p>السور المكتملة</p><strong className="text-3xl text-rose-700">{SURAHS.filter(surah => (data.surahAchievements ?? []).some((entry: {surah: string}) => entry.surah === surah.name)).length} / 114</strong></div><div className="rounded-2xl bg-amber-50 p-5"><p>نسبة حفظ الأجزاء</p><strong className="text-3xl text-amber-800">{Math.round(Math.max(0, Math.min(30, Number(data.memorizedParts) || 0)) / 30 * 100)}٪</strong></div></div></>
          <p className="text-sm text-slate-600">الأجزاء المحفوظة: <strong>{Math.max(0, Math.min(30, Number(data.memorizedParts) || 0))} من 30</strong></p>
          <ProgressBar value={Math.max(0, Math.min(30, Number(data.memorizedParts) || 0))} max={30} showLabel />
          <h3 className="mt-5 text-center text-lg font-bold text-rose-700">قلبي القرآني</h3>
          <p className="mb-3 text-center text-sm text-slate-600">{SURAHS.filter(surah => (data.surahAchievements ?? []).some((entry: {surah: string}) => entry.surah === surah.name)).length} من 114 سورة مكتملة</p>
          <QuranAchievementHeart achievements={data.surahAchievements ?? []} />
          <p className="mt-3 text-xs text-slate-500">الحفظ بممتاز أصفر، والمراجعة بممتاز أحمر، والتثبيت بممتاز أخضر. ويُشترط إتمام السورة كاملة في كل مرحلة.</p>
          <Button variant="secondary" className="mt-4" onClick={async () => {
            try {
              const pdf = await exportAchievementReport(data);
              await saveDeviceFile(pdf, 'إنجازاتي-القرآنية.pdf');
            } catch { toast.error('تعذّر حفظ تقرير الإنجازات'); }
          }}>تنزيل تقرير إنجازاتي PDF</Button>
        </Card>
      </section>

  </>;
}
