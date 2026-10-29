import { Link, useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import PrayerCard, { usePrayerDay } from '@/components/PrayerCard';
import { Button, Card, PageHeader } from '@/components/ui';
import { CALCULATION_DESCRIPTION, calculateGazaTimes, nextPrayer, prayerTimeLabel, readPrayerPreferences, type ObligatoryPrayer } from '@/lib/prayer-times';
import { useAuthStore } from '@/store/auth';

export function PrayerBackButton() {
  const navigate = useNavigate();
  return <Button variant="secondary" onClick={() => (window.history.state?.idx ?? 0) > 0 ? navigate(-1) : navigate('/')}>→ رجوع</Button>;
}
export default function PrayerTimesPage() {
  const date = usePrayerDay();
  const account = useAuthStore(s => s.user!.id);
  const [now, setNow] = useState(Date.now);
  const preferences = readPrayerPreferences(account);
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 15000); return () => clearInterval(timer); }, []);
  const next = nextPrayer(new Date(now));
  return <div className="prayer-page"><PageHeader title="مواقيت الصلاة" subtitle="📍 غزة — فلسطين" action={<PrayerBackButton />} /><PrayerCard />
    <Card title="مواقيت اليوم"><div className="prayer-table">{calculateGazaTimes(date).map(p => <div className={`prayer-row ${next.id === p.id && next.at.toDateString() === p.at.toDateString() ? 'is-next' : ''}`} key={p.id}>
      <strong><span aria-hidden>{p.icon}</span> {p.label}</strong><time dir="ltr">{prayerTimeLabel(p.at)}</time>
      {p.id === 'sunrise' ? <span className="text-xs">شروق الشمس — دون تذكير صلاة</span> : <Link className="text-xs underline" to="/prayer-times/reminders">{preferences.enabled && preferences.prayers[p.id as ObligatoryPrayer].enabled ? `تذكير ${preferences.prayers[p.id as ObligatoryPrayer].before ? `قبل ${preferences.prayers[p.id as ObligatoryPrayer].before} دقائق` : 'عند دخول الوقت'}` : 'التذكير متوقف'} — تعديل</Link>}
    </div>)}</div></Card>
    <p className="prayer-help">{CALCULATION_DESCRIPTION} المنطقة الزمنية Asia/Gaza وفق قاعدة التوقيت في جهازك؛ حدّث نظام الجهاز عند تغير قواعد التوقيت.</p>
    <p className="prayer-help">التاريخ الهجري حسابي وفق التقويم الهجري المدني، وقد يختلف عن الرؤية المحلية؛ يمكن تعديله في إعدادات التذكير.</p>
  </div>;
}
