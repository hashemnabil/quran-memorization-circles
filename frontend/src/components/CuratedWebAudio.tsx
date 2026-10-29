import { useEffect, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { useAuthStore } from '@/store/auth';
import { calculateGazaTimes, readPrayerPreferences } from '@/lib/prayer-times';
import { useCuratedBackground } from './CuratedBackground';
import { Card } from './ui';

const savedAudio = (account: string) => { try { return localStorage.getItem(`qc.web-audio.${account}`) === '1'; } catch { return false; } };

export function WebAudioPermission() {
  const account = useAuthStore(state => state.user?.id || '');
  const [enabled, setEnabled] = useState(() => savedAudio(account));
  const [error, setError] = useState('');
  useEffect(() => setEnabled(savedAudio(account)), [account]);
  if (Capacitor.isNativePlatform()) return null;
  return <Card title="أصوات الموقع"><label className="flex min-h-11 items-center gap-3"><input type="checkbox" checked={enabled} onChange={event => { const value = event.target.checked; try { localStorage.setItem(`qc.web-audio.${account}`, value ? '1' : '0'); setEnabled(value); setError(''); window.dispatchEvent(new Event('qc:web-audio')); } catch { setError('تعذر حفظ إعداد الصوت على الجهاز'); } }} />تفعيل الإشعارات الصوتية والأذان أثناء فتح الموقع</label>{error && <p role="alert">{error}</p>}<p className="mt-2 text-xs leading-6 text-slate-500">جرّب معاينة الصوت لمنح المتصفح فرصة السماح بالتشغيل. قد يمنعه المتصفح، ولا نضمن تشغيل الأذان عند إغلاق الموقع أو قفل الهاتف. تفعيل الأذان نفسه يتم من إعدادات تذكير الصلاة.</p></Card>;
}

export default function CuratedWebAudio() {
  const [blocked, setBlocked] = useState(false);
  const account = useAuthStore(state => state.user?.id || '');
  const notification = useCuratedBackground('NOTIFICATION_SOUND'), adhan = useCuratedBackground('ADHAN_SOUND');
  useEffect(() => { const listener = () => setBlocked(true); window.addEventListener('qc:web-audio-blocked', listener); return () => window.removeEventListener('qc:web-audio-blocked', listener); }, []);
  useEffect(() => {
    if (!account || Capacitor.isNativePlatform()) return;
    const audio = new Audio();
    const received = new Set<string>();
    const canPlay = () => useAuthStore.getState().user?.id === account && document.visibilityState === 'visible' && document.documentElement.dataset.appLocked !== '1' && savedAudio(account);
    const play = (source: string) => { audio.pause(); audio.src = source; void audio.play().catch(() => { window.dispatchEvent(new CustomEvent('qc:web-audio-blocked')); }); };
    const onNotification = (event: Event) => {
      const id = (event as CustomEvent<string>).detail;
      if (!id || received.has(id) || !notification.url || !canPlay() || !audio.paused) return;
      received.add(id); if (received.size > 100) received.delete(received.values().next().value!);
      play(notification.url);
    };
    const tick = () => {
      if (!canPlay()) return;
      const preferences = readPrayerPreferences(account);
      if (!preferences.enabled || !preferences.adhanEnabled) return;
      const prayer = calculateGazaTimes().find(prayer => prayer.id !== 'sunrise' && preferences.prayers[prayer.id]?.enabled && Date.now() >= prayer.at.getTime() && Date.now() - prayer.at.getTime() < 20000);
      if (!prayer) return;
      const key = `qc.web-adhan.${account}.${prayer.at.toISOString()}`;
      if (localStorage.getItem(key)) return;
      localStorage.setItem(key, '1'); play(adhan.url || '/sounds/adhan.ogg');
    };
    const stop = () => { if (!canPlay()) audio.pause(); };
    const observer = new MutationObserver(stop); observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-app-locked'] });
    const timer = setInterval(tick, 10000);
    window.addEventListener('qc:web-notification', onNotification); window.addEventListener('qc:web-audio', stop); document.addEventListener('visibilitychange', stop);
    return () => { clearInterval(timer); observer.disconnect(); audio.pause(); audio.removeAttribute('src'); window.removeEventListener('qc:web-notification', onNotification); window.removeEventListener('qc:web-audio', stop); document.removeEventListener('visibilitychange', stop); };
  }, [account, notification.url, adhan.url]);
  return blocked ? <div role="status" className="fixed bottom-24 inset-x-4 z-40 mx-auto max-w-md rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">منع المتصفح تشغيل الصوت. جرّب معاينته من إعدادات الأصوات.<button type="button" className="min-h-11 px-3 underline" onClick={() => setBlocked(false)}>إغلاق</button></div> : null;
}
