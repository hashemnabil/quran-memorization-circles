import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuthStore } from '@/store/auth';
import { Button, Card, PageHeader } from '@/components/ui';
import SoundPicker from '@/components/SoundPicker';
import { NativePushSettings } from '@/components/NativePush';
import { androidNotifications, configureSound, readGeneralPreferences, saveGeneralSound, SchoolNotifications, type ImportedAudio } from '@/lib/notification-sounds';
import { notificationPreview } from '@/lib/notification-preview';
import { PrayerBackButton } from './PrayerTimesPage';
import { IconBell } from '@/components/ui/Icons';
import '@/components/prayer.css';

export default function NotificationSoundSettingsPage() {
  const account = useAuthStore(state => state.user!.id);
  const [sound, setSound] = useState(() => readGeneralPreferences(account).sound as string);
  const [vibrate, setVibrate] = useState(() => readGeneralPreferences(account).vibrate);
  const [imported, setImported] = useState<ImportedAudio>();
  const soundRef = useRef(sound);
  const [savedToken, setSavedToken] = useState(0);
  const [busy, setBusy] = useState(false); const [status, setStatus] = useState('');
  const save = async (selected = soundRef.current) => {
    setBusy(true); setStatus('');
    try {
      await notificationPreview.stop();
      await saveGeneralSound(account, selected, selected === 'custom' ? imported : undefined, vibrate);
      soundRef.current = selected; setSound(selected); setImported(undefined); setSavedToken(token => token + 1);
      setStatus('حُفظ اختيارك على هذا الجهاز. يُستخدم عند وصول الإشعارات، وتُحدّث قناة إشعارات الخلفية عند اتصال التطبيق بالخادم.');
    } catch (cause) {
      // Keep the web/PWA preference durable even when a native channel is unavailable.
      try { localStorage.setItem(`qc.notification-sound.v1:${account}`, selected); } catch { /* storage policy */ }
      soundRef.current = selected; setSound(selected);
      setStatus(cause instanceof Error ? cause.message : 'تعذر حفظ الاختيار');
    }
    finally { setBusy(false); }
  };
  return <div className="prayer-page notification-sound-page"><PageHeader title="صوت الإشعارات" subtitle="الملف الشخصي ← الإعدادات ← الإشعارات" action={<PrayerBackButton />} />
    <div className="sound-library-intro"><span aria-hidden="true"><IconBell size={25} /></span><div><h2>نغمة تناسبك</h2><p>استمع، اختر، ثم احفظ. المعاينة تعمل بزر التشغيل فقط.</p></div></div>
    <Card><fieldset disabled={busy}><SoundPicker account={account} scope="general" value={sound} savedToken={savedToken} onChange={selected => { soundRef.current = selected; setSound(selected); setStatus(''); }} onImport={setImported} />
      <section className="sound-vibration"><label><input type="checkbox" checked={vibrate} onChange={event => setVibrate(event.target.checked)} /><span><strong>الاهتزاز</strong><small>إعداد مستقل؛ يمكنك استخدام الاهتزاز مع الوضع الصامت.</small></span></label></section>
    </fieldset>
    <div className="sound-save-actions"><Button loading={busy} onClick={() => void save()}>حفظ الاختيار</Button><Button variant="secondary" disabled={busy} onClick={() => void save('default')}>استعادة صوت الجهاز</Button></div>
    {status && <p role="status" className="prayer-status">{status}</p>}
    </Card>
    <Card title="إعدادات الهاتف"><p className="prayer-help">إعدادات أندرويد والوضع الصامت وعدم الإزعاج لها الأولوية. بعد إنشاء قناة إشعارات، قد تحتاج إلى تغيير صوتها أو اهتزازها من إعدادات النظام. الملفات المخصصة لإشعارات الخلفية تحتاج أندرويد 8 أو أحدث.</p><p className="prayer-help">نحتفظ بحد أقصى 8 قنوات مخصصة نشطة لكل نوع إشعارات، وننظف الأقدم غير المستخدمة. نحافظ على القناة الحالية وعلى القنوات التي خصصتها في النظام.</p>
      {androidNotifications() && <div className="flex flex-wrap gap-3"><Button variant="secondary" disabled={busy} onClick={() => { void notificationPreview.stop().then(async () => { const saved = readGeneralPreferences(account); const channel = await configureSound(account, 'general', saved.sound); await SchoolNotifications.openSettings({ channelId: channel.channelId }); }).catch(() => setStatus('تعذر فتح إعدادات قناة الصوت')); }}>إعدادات قناة الصوت</Button><Button variant="secondary" onClick={() => { void notificationPreview.stop().then(() => SchoolNotifications.openSettings({})).catch(() => setStatus('تعذر فتح إعدادات أندرويد')); }}>إشعارات التطبيق في أندرويد</Button></div>}
      {!androidNotifications() && <p className="prayer-help">معاينة أصوات المكتبة متاحة هنا. نغمة الهاتف وقنوات الإشعارات والاهتزاز تُطبق في نسخة أندرويد.</p>}
    </Card>
    <NativePushSettings /><Link to="/prayer-times/reminders" className="mt-4 block underline">أصوات وتذكيرات الصلاة</Link>
  </div>;
}
