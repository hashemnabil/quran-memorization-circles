import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { calculateGazaTimes, countdown, GAZA_ZONE, gazaDateKey, nextPrayer, prayerTimeLabel, readPrayerPreferences } from '@/lib/prayer-times';
import { useAuthStore } from '@/store/auth';
import { IconMosque, IconMoon } from '@/components/ui/Icons';
import './prayer.css';

export function PrayerTimeIcon({ id, size = 24 }: { id: string; size?: number }) {
  if (id === 'fajr' || id === 'isha') return <IconMoon size={size} />;
  if (id === 'sunrise') return <svg className="app-icon" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 18h18M5 15h14M7 12a5 5 0 0 1 10 0M12 2v3M3.5 6l2.5 2M20.5 6 18 8" /></svg>;
  if (id === 'maghrib') return <svg className="app-icon" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 18h18M5 15h14M7 12a5 5 0 0 1 10 0M12 20v2" /></svg>;
  return <svg className="app-icon" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.93 4.93l1.42 1.42M17.65 17.65l1.42 1.42M2 12h2M20 12h2M4.93 19.07l1.42-1.42M17.65 6.35l1.42-1.42" /></svg>;
}
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
  return <div className="prayer-next"><div><span className="prayer-eyebrow">الصلاة القادمة</span><h2 key={next.id}><PrayerTimeIcon id={next.id} size={30} /> {next.label}</h2><span>الساعة {prayerTimeLabel(next.at)}</span></div><div><span className="prayer-eyebrow">متبقي على الأذان</span><time className="prayer-countdown" dir="ltr" aria-label="الوقت المتبقي">{countdown(next.at, now)}</time></div></div>;
}
export default function PrayerCard() {
  const date = usePrayerDay();
  const account = useAuthStore(s => s.user?.id) || '';
  const [revision, setRevision] = useState(0);
  const [now, setNow] = useState(Date.now);
  useEffect(() => { const tick = () => setNow(Date.now()); const timer = window.setInterval(tick, 30000); document.addEventListener('visibilitychange', tick); return () => { window.clearInterval(timer); document.removeEventListener('visibilitychange', tick); }; }, []);
  const [offset, setOffset] = useState(() => readPrayerPreferences(account).hijriOffset);
  useEffect(() => {
    const update = () => setOffset(readPrayerPreferences(account).hijriOffset);
    update(); window.addEventListener('qc:prayer-settings', update);
    return () => window.removeEventListener('qc:prayer-settings', update);
  }, [account]);
  const times = calculateGazaTimes(date);
  const next = nextPrayer(new Date(now));
  const sunrise = times.find(p => p.id === 'sunrise')!.at.getTime();
  const maghrib = times.find(p => p.id === 'maghrib')!.at.getTime();
  const isDay = now >= sunrise && now < maghrib;
  const day = new Date(`${date}T12:00:00Z`);
  const hijri = new Date(day.getTime() + offset * 86400000);
  // Only the countdown ticks each second. The card updates at prayer/day boundaries.
  const onChange = useState(() => () => setRevision(v => v + 1))[0];
  return <section className={`prayer-card ${isDay ? "prayer-card-day" : "prayer-card-night"}`} dir="rtl" aria-label="مواقيت الصلاة — غزة" data-revision={revision}>
    <img className="prayer-mosque" src="/prayer-mosque.jpg" alt="" aria-hidden="true" />
    <div className="prayer-card-heading"><div><p className="prayer-eyebrow">📍 غزة — فلسطين</p><h2>مواقيت الصلاة — غزة</h2></div><span className="prayer-brand-icon" aria-label="رمز المسجد"><IconMosque size={42} /></span></div>
    <NextPrayerCountdown onChange={onChange} />
    <p className="prayer-date">{new Intl.DateTimeFormat('ar', { timeZone: GAZA_ZONE, dateStyle: 'full' }).format(day)} <span> · </span>{new Intl.DateTimeFormat('ar-u-ca-islamic-civil', { timeZone: GAZA_ZONE, day: 'numeric', month: 'long', year: 'numeric' }).format(hijri)}</p>
    <div className="prayer-strip">{times.map(p => <div key={p.id} className={next.id === p.id && gazaDateKey(next.at) === date ? 'prayer-slot is-next' : 'prayer-slot'}><span className="prayer-slot-icon" aria-hidden="true"><PrayerTimeIcon id={p.id} size={24} /></span><strong>{p.label}</strong><time dir="ltr">{prayerTimeLabel(p.at)}</time></div>)}</div>
    <div className="prayer-actions"><Link to="/prayer-times">عرض جميع المواقيت <span aria-hidden>←</span></Link><Link to="/prayer-times/reminders">إعدادات التذكير</Link></div>
  </section>;
}
