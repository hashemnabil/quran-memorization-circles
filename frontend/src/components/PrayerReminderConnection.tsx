import { useEffect } from 'react';
import { App as NativeApp } from '@capacitor/app';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/store/auth';
import { androidNotifications, configureSound, readGeneralSound, SchoolNotifications } from '@/lib/notification-sounds';
import { refreshPrayerReminders } from '@/lib/prayer-notifications';

export default function PrayerReminderConnection() {
  const account = useAuthStore(s => s.user?.id);
  const navigate = useNavigate();
  useEffect(() => {
    if (!account || !androidNotifications()) return;
    let active = true;
    const refresh = () => {
      if (!active) return;
      void refreshPrayerReminders(account).catch(() => undefined);
      void configureSound(account, 'general', readGeneralSound(account)).catch(() => undefined);
      void SchoolNotifications.consumePrayerOpen().then(result => { if (active && result.opened) navigate(result.link && /^\/(?!\/)[a-zA-Z0-9/_?=&%-]*$/.test(result.link) ? result.link : '/prayer-times'); }).catch(() => undefined);
    };
    refresh();
    const handler = () => refresh();
    const listener = NativeApp.addListener('appStateChange', state => { if (state.isActive) refresh(); });
    const opened = SchoolNotifications.addListener('notificationOpened', refresh);
    window.addEventListener('qc:prayer-settings', handler);
    const timer = setInterval(refresh, 60 * 60 * 1000);
    return () => { active = false; clearInterval(timer); window.removeEventListener('qc:prayer-settings', handler); void listener.then(l => l.remove()); void opened.then(l => l.remove()); };
  }, [account, navigate]);
  return null;
}
