import { readActiveIdentity } from './active-identity';
import { Capacitor, type PluginListenerHandle } from '@capacitor/core';
import { Preferences } from '@capacitor/preferences';
import { PushNotifications } from '@capacitor/push-notifications';
import { LocalNotifications } from '@capacitor/local-notifications';
import { api } from './api';
import { androidNotifications, configureSound, readGeneralSound, SchoolNotifications } from './notification-sounds';

export const nativePushAvailable = () => Capacitor.isNativePlatform() && Capacitor.isPluginAvailable('PushNotifications');
export const nativePushClientConfigured = () => Capacitor.getPlatform() !== 'android' || import.meta.env.VITE_ANDROID_FCM_CONFIGURED === 'true';
export class PushSetupError extends Error {}
export function hideNotificationPreview(account: string) { try { return localStorage.getItem('qc.push-private:'+account) !== '0'; } catch { return true; } }
export function saveNotificationPrivacy(account: string, hidden: boolean) { localStorage.setItem('qc.push-private:'+account, hidden?'1':'0'); window.dispatchEvent(new Event('qc:notification-sound')); }
const installationKey = 'halaqat.push.installation';
async function installationId() {
  const existing = (await Preferences.get({ key: installationKey })).value;
  if (existing) return existing;
  const id = crypto.randomUUID(); await Preferences.set({ key: installationKey, value: id }); return id;
}
function currentAccount() { try { return readActiveIdentity()?.id; } catch { return undefined; } }
export function notificationLink(data: any) {
  const link = data?.link;
  return typeof link === 'string' && /^\/(?!\/)[a-zA-Z0-9/_?=&%-]*$/.test(link) ? link : '/notifications';
}
async function configured() {
  const { data } = await api.get('/push/config', { timeout: 15000 });
  return !!data[Capacitor.getPlatform()];
}
export async function enableNativePush() {
  if (!nativePushAvailable()) throw new PushSetupError('هذه الميزة متاحة في نسخة الجوال المحدّثة');
  if (!nativePushClientConfigured()) throw new PushSetupError('نسخة أندرويد غير مربوطة بإعداد Firebase. أضف ملف google-services.json ثم أعد بناء التطبيق؛ لم يتم طلب الإذن أو تسجيل الإشعار.');
  if (!navigator.onLine) throw new PushSetupError('اتصل بالإنترنت لتفعيل إشعارات الجوال');
  if (!await configured()) throw new PushSetupError('خدمة الإشعارات غير مهيأة على الخادم؛ يلزم إعداد Firebase لأندرويد أو Apple لآيفون، ثم إعادة المحاولة');
  const permission = await PushNotifications.requestPermissions();
  if (permission.receive !== 'granted') throw new PushSetupError('لم يُمنح إذن الإشعارات؛ فعّله من إعدادات الجوال');
  if (Capacitor.getPlatform() === 'android') {
    await LocalNotifications.requestPermissions();
    await LocalNotifications.createChannel({ id: 'halaqat-updates', name: 'إشعارات الحلقات', importance: 4, visibility: 0 });
    await PushNotifications.createChannel({ id: 'halaqat-updates', name: 'إشعارات الحلقات', importance: 4, visibility: 0 });
  }
  await PushNotifications.register();
}
export async function connectNativePush(account: string, navigate: (path: string) => void) {
  if (!nativePushAvailable() || !nativePushClientConfigured()) return () => undefined;
  let active = true; const handles: PluginListenerHandle[] = [];
  const owned = () => active && currentAccount() === account;
  handles.push(await PushNotifications.addListener('registration', token => {
    if (!owned()) return;
    void installationId().then(async id => {
      const channel = androidNotifications() ? await configureSound(account, 'general', readGeneralSound(account)) : undefined;
      if (owned()) { await api.post('/push/devices', { installationId: id, platform: Capacitor.getPlatform(), token: token.value, notificationChannelId: channel?.channelId, hidePreview: hideNotificationPreview(account) }); if (owned() && androidNotifications() && channel) await SchoolNotifications.confirmGeneralChannel({ accountId: account, channelId: channel.channelId }).catch(() => undefined); window.dispatchEvent(new CustomEvent('halaqat:push-status', { detail: 'تم تفعيل إشعارات الجوال' })); }
    }).catch(() => {
      window.dispatchEvent(new CustomEvent('halaqat:push-status', { detail: 'تعذر تسجيل الجهاز؛ أعد تفعيل الإشعارات عند الاتصال' }));
    });
  }));
  handles.push(await PushNotifications.addListener('registrationError', () => { if (owned()) window.dispatchEvent(new CustomEvent('halaqat:push-status', { detail: 'تعذر تفعيل الإشعارات؛ تحقق من إعداد نسخة الجوال' })); }));
  handles.push(await PushNotifications.addListener('pushNotificationActionPerformed', action => { if (owned() && (!action.notification.data?.accountId || action.notification.data.accountId === account)) navigate(notificationLink(action.notification.data)); }));
  handles.push(await PushNotifications.addListener('pushNotificationReceived', notification => {
    if (!owned() || notification.data?.accountId && notification.data.accountId !== account || Capacitor.getPlatform() !== 'android') return;
    // Android displays background FCM notifications itself. This callback covers foreground delivery.
    void (async () => {
      const channel = androidNotifications() ? await configureSound(account, 'general', readGeneralSound(account)) : { channelId: 'halaqat-updates' };
      if (!owned()) return;
      if (androidNotifications()) {
        await SchoolNotifications.showGeneral({ accountId: account, id: hashNotification(notification.data?.notificationId || notification.id), title: hideNotificationPreview(account) || document.querySelector('[data-security-blocked]') ? 'مدرسة عبدالله بن عمر' : notification.title || 'حلقات القرآن', body: hideNotificationPreview(account) || document.querySelector('[data-security-blocked]') ? 'لديك إشعار جديد. افتح التطبيق لعرض التفاصيل.' : notification.body || 'لديك إشعار جديد', link: notificationLink(notification.data) });
        return;
      }
      await LocalNotifications.schedule({ notifications: [{ id: hashNotification(notification.data?.notificationId || notification.id), title: notification.title || 'حلقات القرآن', body: notification.body || 'لديك إشعار جديد', channelId: channel.channelId, smallIcon: 'ic_stat_halaqat', extra: { ...notification.data, accountId: account } }] });
    })().catch(() => undefined);
  }));
  handles.push(await LocalNotifications.addListener('localNotificationActionPerformed', action => {
    if (owned() && action.notification.extra?.accountId === account) navigate(notificationLink(action.notification.extra));
  }));
  const resume = async () => {
    if (!owned() || !navigator.onLine) return;
    try { if ((await PushNotifications.checkPermissions()).receive === 'granted' && await configured()) await PushNotifications.register(); } catch { /* Unconfigured apps remain usable. */ }
  };
  window.addEventListener('online', resume); void resume();
  window.addEventListener('qc:notification-sound', resume);
  return () => { active = false; window.removeEventListener('online', resume); window.removeEventListener('qc:notification-sound', resume); for (const handle of handles) void handle.remove(); };
}
function hashNotification(id: string) { let hash = 0; for (const char of id) hash = (hash * 31 + char.charCodeAt(0)) | 0; return (hash & 0x7fffffff) || 1; }
export async function disableNativePush() {
  if (androidNotifications()) await SchoolNotifications.clearPrayers().catch(() => undefined);
  if (!nativePushAvailable() || !nativePushClientConfigured()) return;
  const id = await installationId();
  // Remove OS-delivered previews when changing accounts, including offline logout.
  await PushNotifications.removeAllDeliveredNotifications().catch(() => undefined);
  await LocalNotifications.removeAllDeliveredNotifications().catch(() => undefined);
  if (navigator.onLine) await api.delete('/push/devices', { data: { installationId: id }, timeout: 5000 }).catch(() => undefined);
  // Firebase token deletion can wait for a network connection; offline logout cannot.
  const unregister = PushNotifications.unregister().catch(() => undefined);
  if (navigator.onLine) await Promise.race([unregister, new Promise(resolve => setTimeout(resolve, 3000))]);
}
