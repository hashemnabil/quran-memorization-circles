import { Link, useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { PrayerTimeIcon, usePrayerDay } from '@/components/PrayerCard';
import { Button, Card, PageHeader } from '@/components/ui';
import { CALCULATION_DESCRIPTION, calculateGazaTimes, countdown, nextPrayer, prayerTimeLabel, readPrayerPreferences, type ObligatoryPrayer } from '@/lib/prayer-times';
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
  const today = calculateGazaTimes(date);
  const nextIsToday = today.some(p => p.id === next.id && p.at.getTime() === next.at.getTime());
  return <div className="prayer-page"><PageHeader title="مواقيت الصلاة" subtitle="غزة، فلسطين" action={<PrayerBackButton />} />
    <section className="prayer-hero" aria-label="الصلاة القادمة">
      <div className="prayer-hero-copy"><span className="prayer-hero-kicker">الصلاة القادمة {nextIsToday ? 'اليوم' : 'غدًا'}</span><div className="prayer-hero-name"><span className="prayer-hero-icon"><PrayerTimeIcon id={next.id} size={32}/></span><h2>{next.label}</h2></div><p>يدخل وقت الصلاة الساعة <strong>{prayerTimeLabel(next.at)}</strong></p></div>
      <div className="prayer-hero-countdown"><span>المتبقي على الأذان</span><time dir="ltr" aria-label="الوقت المتبقي على الصلاة القادمة">{countdown(next.at, now)}</time></div>
    </section>
    <Card title="مواقيت اليوم" action={<Link className="prayer-settings-link" to="/prayer-times/reminders">إعدادات التذكير</Link>}><div className="prayer-table">{today.map(p => { const upcoming = next.id === p.id && next.at.getTime() === p.at.getTime(); const reminder = p.id !== 'sunrise' && preferences.enabled && preferences.prayers[p.id as ObligatoryPrayer].enabled; return <div className={`prayer-row ${upcoming ? 'is-next' : ''}`} key={p.id}>
      <strong><span className="prayer-row-icon" aria-hidden="true"><PrayerTimeIcon id={p.id} size={24} /></span><span>{p.label}{upcoming && <small>الصلاة القادمة</small>}</span></strong><time dir="ltr">{prayerTimeLabel(p.at)}</time>
      <Link className="prayer-reminder-link" to="/prayer-times/reminders">{p.id === 'sunrise' ? 'وقت الشروق' : reminder ? `تذكير ${preferences.prayers[p.id as ObligatoryPrayer].before ? `قبل ${preferences.prayers[p.id as ObligatoryPrayer].before} دقائق` : 'عند دخول الوقت'}` : 'التذكير متوقف'}</Link>
    </div>; })}</div></Card>
    <p className="prayer-help">{CALCULATION_DESCRIPTION} المنطقة الزمنية Asia/Gaza وفق قاعدة التوقيت في جهازك؛ حدّث نظام الجهاز عند تغير قواعد التوقيت.</p>
    <p className="prayer-help">التاريخ الهجري حسابي وفق التقويم الهجري المدني، وقد يختلف عن الرؤية المحلية؛ يمكن تعديله في إعدادات التذكير.</p>
  </div>;
}
