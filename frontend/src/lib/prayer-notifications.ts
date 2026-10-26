import { LocalNotifications } from '@capacitor/local-notifications';
import { androidNotifications, configureSound, SchoolNotifications, type ImportedAudio } from './notification-sounds';
import { gazaDateKey, prayerReminders, prayerTimeLabel, readPrayerPreferences, type ReminderPreferences } from './prayer-times';
import { readActiveIdentity } from './active-identity';

let serial: Promise<unknown> = Promise.resolve();
export function refreshPrayerReminders(account: string, requestPermission = false, preferences = readPrayerPreferences(account), imported?: ImportedAudio) {
  const work = async () => {
    if (!androidNotifications()) return 'حُفظت الإعدادات محليًا. تذكيرات الخلفية متاحة في تطبيق أندرويد؛ الموقع يعرض المواقيت والعدّاد فقط.';
    if (readActiveIdentity()?.id !== account) return '';
    if (!preferences.enabled) { await SchoolNotifications.clearPrayers(); return 'تذكيرات الصلاة متوقفة.'; }
    let permission = await LocalNotifications.checkPermissions();
    if (permission.display !== 'granted' && requestPermission && permission.display !== 'denied') permission = await LocalNotifications.requestPermissions();
    if (permission.display !== 'granted') throw new Error('لم يُمنح إذن الإشعارات. فعّله من إعدادات أندرويد ثم أعد الحفظ.');
    const { channelId } = await configureSound(account, 'prayer', preferences.sound, imported);
    if (readActiveIdentity()?.id !== account) return '';
    const reminders = prayerReminders(preferences, new Date(), 370).map(p => ({ at: p.remindAt.getTime(), title: `تذكير صلاة ${p.label} — غزة`, body: `موعد ${p.label} ${prayerTimeLabel(p.at)} — غزة، فلسطين` }));
    const result = await SchoolNotifications.schedulePrayers({ accountId: account, channelId, reminders });
    return `جُدولت التذكيرات محليًا لمدة عام، وتتجدد عند فتح التطبيق. ${result.exact ? '' : 'التنبيهات تقريبية وفق قيود أندرويد وقد تتأخر مع توفير البطارية.'}`;
  };
  const result = serial.then(work, work); serial = result.catch(() => undefined); return result;
}
export { gazaDateKey };
export type { ReminderPreferences };
