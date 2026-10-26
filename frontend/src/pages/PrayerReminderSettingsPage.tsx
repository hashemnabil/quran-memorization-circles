import { useState } from 'react';
import { useAuthStore } from '@/store/auth';
import { Button, Card, PageHeader } from '@/components/ui';
import SoundPicker from '@/components/SoundPicker';
import { obligatoryPrayers, readPrayerPreferences, savePrayerPreferences, type ObligatoryPrayer } from '@/lib/prayer-times';
import { refreshPrayerReminders } from '@/lib/prayer-notifications';
import { androidNotifications, SchoolNotifications, storeImportedAudio, type ImportedAudio } from '@/lib/notification-sounds';
import { PrayerBackButton } from './PrayerTimesPage';

export default function PrayerReminderSettingsPage() {
  const account = useAuthStore(s => s.user!.id);
  const [imported, setImported] = useState<ImportedAudio>();
  const [value, setValue] = useState(() => readPrayerPreferences(account));
  const [status, setStatus] = useState(''); const [busy, setBusy] = useState(false);
  return <div className="prayer-page"><PageHeader title="إعدادات تذكيرات الصلاة" subtitle="إعدادات شخصية — غزة، فلسطين" action={<PrayerBackButton />} />
    <div className="prayer-settings-grid"><Card title="تذكيرات الصلاة"><label className="prayer-check mb-5"><input type="checkbox" checked={value.enabled} onChange={e => setValue({ ...value, enabled: e.target.checked })} />تفعيل تذكيرات الصلاة</label>
      <div className="prayer-table">{obligatoryPrayers.map(p => { const id = p.id as ObligatoryPrayer; return <div className="prayer-row" key={id}><label className="prayer-check"><input type="checkbox" checked={value.prayers[id].enabled} onChange={e => setValue({ ...value, prayers: { ...value.prayers, [id]: { ...value.prayers[id], enabled: e.target.checked } } })} />{p.label}</label><select className="input max-w-52" aria-label={`موعد تذكير ${p.label}`} value={value.prayers[id].before} onChange={e => setValue({ ...value, prayers: { ...value.prayers, [id]: { ...value.prayers[id], before: Number(e.target.value) } } })}>{[0, 5, 10, 15].map(n => <option key={n} value={n}>{n === 0 ? 'عند دخول الوقت' : `قبل الصلاة بـ ${n} دقائق`}</option>)}</select></div>; })}</div>
      <p className="prayer-help">الشروق ليس صلاة مفروضة، ولا تُجدول له تذكيرات. التذكيرات معطّلة افتراضيًا حتى تختار تفعيلها.</p>
    </Card><Card title="أصوات تذكيرات الصلاة"><SoundPicker account={account} scope="prayer" onImport={setImported} value={value.sound} onChange={sound => setValue({ ...value, sound })} /></Card>
    <Card title="التاريخ الهجري"><label className="prayer-check">تصحيح التقويم المحلي<select className="input max-w-40" value={value.hijriOffset} onChange={e => setValue({ ...value, hijriOffset: Number(e.target.value) })}>{[-2, -1, 0, 1, 2].map(n => <option key={n} value={n}>{n > 0 ? '+' : ''}{n} يوم</option>)}</select></label><p className="prayer-help">تقويم هجري مدني حسابي. التصحيح يغيّر عرض التاريخ فقط.</p></Card>
    <p className="prayer-help">في أندرويد تُجدول التنبيهات محليًا، وقد تتأخر بسبب توفير البطارية وعدم الإزعاج. في الموقع تُحفظ الإعدادات وتُعرض المواقيت فقط؛ لا توجد تذكيرات مضمونة عند إغلاق المتصفح.</p>
    {androidNotifications() && <Button variant="secondary" onClick={() => void SchoolNotifications.openSettings({})}>فتح إعدادات إشعارات أندرويد</Button>}
    <Button loading={busy} onClick={async () => { setBusy(true); setStatus(''); try { const message = await refreshPrayerReminders(account, true, value, imported); if (useAuthStore.getState().user?.id !== account) return; if (value.sound === 'custom' && imported) await storeImportedAudio(account, 'prayer', imported); savePrayerPreferences(account, value); setStatus(message || 'حُفظت الإعدادات'); } catch (e) { setStatus(e instanceof Error ? e.message : 'تعذر حفظ إعدادات التذكير'); } finally { setBusy(false); } }}>حفظ الإعدادات</Button>
    {status && <p role="status" className="prayer-status">{status}</p>}</div>
  </div>;
}
