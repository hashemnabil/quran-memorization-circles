import { useEffect, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';
import { Button, Modal } from '@/components/ui';

export default function NotificationPermissionPrompt() {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    if (!Capacitor.isNativePlatform()) return;
    try { if (localStorage.getItem('qc.notifications.intro')) return; } catch { /* Permission remains available. */ }
    void LocalNotifications.checkPermissions().then(permission => {
      if (active && permission.display === 'prompt') setOpen(true);
    }).catch(() => undefined);
    return () => { active = false; };
  }, []);
  const close = () => {
    try { localStorage.setItem('qc.notifications.intro', '1'); } catch { /* Optional preference. */ }
    setOpen(false);
  };
  return <Modal open={open} onClose={close} title="ابقَ على اطلاع">
    <div className="text-center"><span aria-hidden="true" className="mb-4 inline-grid h-16 w-16 place-items-center rounded-2xl bg-primary-50 text-3xl">♧</span><p className="mb-6 text-sm leading-7 text-slate-600">اسمح بالإشعارات لتصلك تنبيهات الحلقات والمحادثات وتذكيرات الصلاة التي تختار تفعيلها. يمكنك تعديلها من إعدادات حسابك.</p></div>
    <Button className="w-full" loading={busy} onClick={async () => {
      setBusy(true); setError('');
      try { await LocalNotifications.requestPermissions(); window.dispatchEvent(new Event('qc:notification-sound')); close(); }
      catch { setError('تعذر فتح طلب الإذن. يمكنك المحاولة من إعدادات الحساب.'); }
      finally { setBusy(false); }
    }}>السماح بالإشعارات</Button>
    <Button variant="secondary" className="mt-3 w-full" disabled={busy} onClick={close}>لاحقًا</Button>
    {error && <p role="alert" className="mt-3 text-sm text-red-600">{error}</p>}
  </Modal>;
}
