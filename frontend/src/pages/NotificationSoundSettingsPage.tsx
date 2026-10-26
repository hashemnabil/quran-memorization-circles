import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuthStore } from '@/store/auth';
import { Button, Card, PageHeader } from '@/components/ui';
import SoundPicker from '@/components/SoundPicker';
import { NativePushSettings } from '@/components/NativePush';
import { androidNotifications, readGeneralSound, saveGeneralSound, SchoolNotifications, type ImportedAudio } from '@/lib/notification-sounds';
import { PrayerBackButton } from './PrayerTimesPage';
import '@/components/prayer.css';

export default function NotificationSoundSettingsPage() {
  const account = useAuthStore(s => s.user!.id);
  const [imported, setImported] = useState<ImportedAudio>();
  const [sound, setSound] = useState(() => readGeneralSound(account));
  const [busy, setBusy] = useState(false); const [status, setStatus] = useState('');
  return <div className="prayer-page"><PageHeader title="صوت الإشعارات" subtitle="الملف الشخصي ← الإعدادات ← الإشعارات" action={<PrayerBackButton />} />
    <Card title="اختر صوت إشعاراتك"><SoundPicker account={account} scope="general" value={sound} onChange={setSound} onImport={setImported} /><p className="prayer-help">أصوات إشراقة وصفاء ونور أصلية مولّدة لهذا المشروع. إعدادات قنوات أندرويد والوضع الصامت وعدم الإزعاج لها الأولوية؛ إذا غيّرت صوت قناة سابقًا، راجع إعدادات النظام. أصوات الصلاة مستقلة عن هذا الاختيار.</p>
      <Button loading={busy} onClick={async () => { setBusy(true); setStatus(''); try { await saveGeneralSound(account, sound, imported); setStatus('حُفظ الاختيار لهذا الحساب على هذا الجهاز. تُزامَن قناة إشعارات أندرويد مع الخادم عند الاتصال.'); } catch (e) { setStatus(e instanceof Error ? e.message : 'تعذر حفظ الاختيار'); } finally { setBusy(false); } }}>حفظ الاختيار</Button>
      {androidNotifications() && <Button variant="secondary" onClick={() => void SchoolNotifications.openSettings({ channelId: `school-general-${sound}-v1` })}>إعدادات الصوت في أندرويد</Button>}
      {status && <p role="status" className="prayer-status">{status}</p>}
    </Card><div className="mt-4"><NativePushSettings /></div><Link to="/prayer-times/reminders" className="mt-4 block underline">أصوات وتذكيرات الصلاة</Link>
  </div>;
}
