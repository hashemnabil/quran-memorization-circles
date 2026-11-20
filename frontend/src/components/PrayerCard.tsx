import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { countdown, gazaDateKey, nextPrayer, prayerTimeLabel } from '@/lib/prayer-times';
import { IconMoon } from '@/components/ui/Icons';
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
  const [now, setNow] = useState(Date.now);
  useEffect(() => { const tick = () => setNow(Date.now()); const timer = window.setInterval(tick, 1000); document.addEventListener('visibilitychange', tick); return () => { window.clearInterval(timer); document.removeEventListener('visibilitychange', tick); }; }, []);
  const next = nextPrayer(new Date(now));
  return <Link to="/prayer-times" className="prayer-compact group mb-5" dir="rtl" aria-label={`الصلاة القادمة ${next.label} الساعة ${prayerTimeLabel(next.at)}، اضغط لعرض جميع المواقيت`}>
    <span className="prayer-compact__identity">
      <span className="prayer-compact__icon"><PrayerTimeIcon id={next.id} size={27} /></span>
      <span className="min-w-0"><span className="prayer-compact__eyebrow">الصلاة القادمة · غزة</span><strong className="prayer-compact__name">{next.label}</strong><span className="prayer-compact__time">الساعة {prayerTimeLabel(next.at)}</span></span>
    </span>
    <span className="prayer-compact__countdown"><small>متبقي على الأذان</small><time dir="ltr">{countdown(next.at, now)}</time></span>
    <span className="prayer-compact__open"><span>جميع المواقيت</span><b aria-hidden="true">←</b></span>
  </Link>;
}
