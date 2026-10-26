import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { calculateGazaTimes, countdown, GAZA_ZONE, gazaDateKey, nextPrayer, prayerTimeLabel, readPrayerPreferences } from '@/lib/prayer-times';
import { useAuthStore } from '@/store/auth';
import { IconMosque } from '@/components/ui/Icons';
import './prayer.css';

export function usePrayerDay() {
  const [date, setDate] = useState(gazaDateKey);
  useEffect(() => {
    const update = () => setDate(gazaDateKey());
    const timer = window.setInterval(update, 15000);
    document.addEventListener('visibilitychange', update);
    return () => { clearInterval(timer); document.removeEventListener('visibilitychange', update); };
  }, []);
  return date;
}
function NextPrayerCountdown({ onChange }: { onChange: () => void }) {
  const [now, setNow] = useState(Date.now);
  const next = nextPrayer(new Date(now));
  useEffect(() => {
    const timer = window.setInterval(() => {
      if (Date.now() >= next.at.getTime()) onChange();
      setNow(Date.now());
    }, 1000);
    return () => clearInterval(timer);
  }, [next.at.getTime(), onChange]);
  return <div className="prayer-next"><div><span className="prayer-eyebrow">الصلاة القادمة</span><h2 key={next.id}><span aria-hidden>{next.icon}</span> {next.label}</h2><span>الساعة {prayerTimeLabel(next.at)}</span></div><div><span className="prayer-eyebrow">متبقي على الأذان</span><time className="prayer-countdown" dir="ltr" aria-label="الوقت المتبقي">{countdown(next.at, now)}</time></div></div>;
}
export default function PrayerCard() {
  const date = usePrayerDay();
  const account = useAuthStore(s => s.user?.id) || '';
  const [revision, setRevision] = useState(0);
  const [offset, setOffset] = useState(() => readPrayerPreferences(account).hijriOffset);
  useEffect(() => {
    const update = () => setOffset(readPrayerPreferences(account).hijriOffset);
    update(); window.addEventListener('qc:prayer-settings', update);
    return () => window.removeEventListener('qc:prayer-settings', update);
  }, [account]);
  const times = calculateGazaTimes(date);
  const next = nextPrayer();
  const day = new Date(`${date}T12:00:00Z`);
  const hijri = new Date(day.getTime() + offset * 86400000);
  // Only the countdown ticks each second. The card updates at prayer/day boundaries.
  const onChange = useState(() => () => setRevision(v => v + 1))[0];
  return <section className="prayer-card" dir="rtl" aria-label="مواقيت الصلاة — غزة" data-revision={revision}>
    <img className="prayer-mosque" src="/onboarding/quran-mosque.jpg" alt="" aria-hidden="true" />
    <div className="prayer-card-heading"><div><p className="prayer-eyebrow">📍 غزة — فلسطين</p><h2>مواقيت الصلاة — غزة</h2></div><IconMosque size={48} aria-hidden="true" /></div>
    <NextPrayerCountdown onChange={onChange} />
    <p className="prayer-date">{new Intl.DateTimeFormat('ar', { timeZone: GAZA_ZONE, dateStyle: 'full' }).format(day)} <span> · </span>{new Intl.DateTimeFormat('ar-u-ca-islamic-civil', { timeZone: GAZA_ZONE, day: 'numeric', month: 'long', year: 'numeric' }).format(hijri)}</p>
    <div className="prayer-strip">{times.map(p => <div key={p.id} className={next.id === p.id && gazaDateKey(next.at) === date ? 'prayer-slot is-next' : 'prayer-slot'}><span aria-hidden>{p.icon}</span><strong>{p.label}</strong><time dir="ltr">{prayerTimeLabel(p.at)}</time></div>)}</div>
    <div className="prayer-actions"><Link to="/prayer-times">عرض جميع المواقيت <span aria-hidden>←</span></Link><Link to="/prayer-times/reminders">إعدادات التذكير</Link></div>
  </section>;
}
