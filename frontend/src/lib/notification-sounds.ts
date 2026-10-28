import { Capacitor, registerPlugin, type PluginListenerHandle } from '@capacitor/core';
import { openDB } from 'idb';
import { readActiveIdentity } from './active-identity';
import { dataKey, openValue, sealValue } from './local-encryption';
import { audioMime, parseSoundPreferences, SOUND_IDS, type SoundPreferences } from './notification-sound-policy';

export const SOUNDS = [
  { id: 'default', name: 'استخدام صوت الجهاز', description: 'نغمة الإشعارات التي اخترتها في إعدادات الهاتف', group: 'device' },
  { id: 'school', name: 'صوت المدرسة', description: 'لمسة إلكترونية أصلية، ناعمة وقصيرة', group: 'school', url: '/sounds/school.wav' },
  { id: 'calm', name: 'إشراقة', description: 'تنبيه هادئ وخفيف', group: 'library', url: '/sounds/calm.wav' },
  { id: 'electronic', name: 'صفاء', description: 'نغمة إلكترونية بسيطة', group: 'library', url: '/sounds/electronic.wav' },
  { id: 'clear', name: 'نور', description: 'تنبيه واضح وقصير', group: 'library', url: '/sounds/clear.wav' },
  { id: 'soft', name: 'سكينة', description: 'نبرة دافئة وناعمة', group: 'library', url: '/sounds/soft.wav' },
  { id: 'bright', name: 'إشراق', description: 'نغمة صافية وخفيفة', group: 'library', url: '/sounds/bright.wav' },
  { id: 'pulse', name: 'أثر', description: 'نبضتان إلكترونيتان لطيفتان', group: 'library', url: '/sounds/pulse.wav' },
  { id: 'silent', name: 'صامت', description: 'تصل الإشعارات دون صوت؛ الاهتزاز له إعداد مستقل', group: 'silent' },
] as const;
export type SoundScope = 'general' | 'prayer';
export interface SchoolNotificationsPlugin {
  configureChannel(options: { accountId: string; scope: SoundScope; sound: string; customData?: string; mime?: string; vibrate?: boolean; explicit?: boolean }): Promise<{ channelId: string }>;
  confirmGeneralChannel(options: { accountId: string; channelId: string }): Promise<void>;
  showGeneral(options: { accountId: string; id: number; title: string; body: string; link: string }): Promise<void>;
  openSettings(options: { channelId?: string }): Promise<void>;
  previewDefault(): Promise<void>;
  stopPreview(): Promise<void>;
  schedulePrayers(options: { accountId: string; channelId: string; reminders: { at: number; title: string; body: string; adhan?: boolean }[] }): Promise<{ exact: boolean }>;
  clearPrayers(): Promise<void>;
  requestExactAlarm(): Promise<void>;
  consumePrayerOpen(): Promise<{ opened: boolean; link?: string }>;
  addListener(event: 'notificationOpened', listener: () => void): Promise<PluginListenerHandle>;
}
export const SchoolNotifications = registerPlugin<SchoolNotificationsPlugin>('SchoolNotifications');
export const androidNotifications = () => Capacitor.getPlatform() === 'android' && Capacitor.isPluginAvailable('SchoolNotifications');
const preferenceKey = (account: string) => `qc.notification-preferences.v2:${account}`;
export function readGeneralPreferences(account: string): SoundPreferences {
  try { return parseSoundPreferences(localStorage.getItem(preferenceKey(account)), localStorage.getItem(`qc.notification-sound.v1:${account}`)); }
  catch { return { sound: 'default', vibrate: false }; }
}
export const readGeneralSound = (account: string) => readGeneralPreferences(account).sound;
const mediaDB = () => openDB('qc-notification-audio', 1, { upgrade(db) { db.createObjectStore('files'); } });
export type ImportedAudio = { name: string; mime: string; data: string };
const mediaKey = (account: string, scope: SoundScope) => `${account}:${scope}`;
function assertOwner(account: string) { if (readActiveIdentity()?.id !== account) throw new Error('تغير الحساب النشط، أعد فتح الإعدادات'); }
export async function readImportedAudio(account: string, scope: SoundScope): Promise<ImportedAudio | undefined> {
  assertOwner(account);
  const db = await mediaDB();
  try {
    const raw = await db.get('files', mediaKey(account, scope)); if (!raw) return undefined;
    if (!dataKey(account)) throw new Error('افتح الحساب للوصول إلى الصوت المحفوظ');
    const result = openValue<ImportedAudio>(account, `notification-audio:${scope}`, raw);
    // Migrate a previously saved plain record without changing the selected sound.
    if (raw.__localCipher !== 1) await db.put('files', sealValue(account, `notification-audio:${scope}`, result), mediaKey(account, scope));
    assertOwner(account); return result;
  } finally { db.close(); }
}
export async function importAudio(_account: string, scope: SoundScope, file: File): Promise<ImportedAudio> {
  const mime = audioMime(file.name, file.type);
  if (!mime || file.size > 5 * 1024 * 1024 || file.size === 0) throw new Error('اختر ملفًا صوتيًا صالحًا لا يتجاوز 5 ميجابايت.');
  const data = await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result).replace(/^data:[^;]*;/, `data:${mime};`)); reader.onerror = () => reject(new Error('تعذرت قراءة الملف')); reader.readAsDataURL(file); });
  const audio = new Audio(); audio.preload = 'metadata';
  try {
    await new Promise<void>((resolve, reject) => { const timer = setTimeout(() => reject(new Error('تعذرت قراءة مدة الملف الصوتي')), 8000); audio.onloadedmetadata = () => { clearTimeout(timer); resolve(); }; audio.onerror = () => { clearTimeout(timer); reject(new Error('صيغة الصوت غير مدعومة على هذا الجهاز')); }; audio.src = data; });
    if (!Number.isFinite(audio.duration) || audio.duration <= 0 || audio.duration > (scope === 'prayer' ? 600 : 30)) throw new Error(scope === 'prayer' ? 'اختر ملف أذان لا يتجاوز 10 دقائق.' : 'اختر تنبيهًا لا يتجاوز 30 ثانية.');
  } finally { audio.onloadedmetadata = null; audio.onerror = null; audio.removeAttribute('src'); audio.load(); }
  return { name: file.name, mime, data };
}
export async function storeImportedAudio(account: string, scope: SoundScope, audio: ImportedAudio) {
  assertOwner(account); if (!dataKey(account)) throw new Error('مفتاح حماية الصوت غير متاح؛ افتح الحساب مجددًا');
  const db = await mediaDB();
  try { await db.put('files', sealValue(account, `notification-audio:${scope}`, audio), mediaKey(account, scope)); }
  finally { db.close(); }
}
export async function configureSound(account: string, scope: SoundScope, sound: string, imported?: ImportedAudio, vibrate = readGeneralPreferences(account).vibrate, explicit = false) {
  if (!(SOUND_IDS as readonly string[]).includes(sound)) throw new Error('الصوت المحدد غير متاح');
  const custom = sound === 'custom' ? imported ?? await readImportedAudio(account, scope) : undefined;
  if (sound === 'custom' && !custom) throw new Error('اختر ملف الصوت من الجهاز أولًا');
  if (!androidNotifications()) return { channelId: `school-${scope}-${sound}-v1` };
  assertOwner(account);
  return SchoolNotifications.configureChannel({ accountId: account, scope, sound, customData: custom?.data.split(',')[1], mime: custom?.mime, ...(scope === 'general' ? { vibrate } : {}), explicit: explicit || !!imported });
}
export async function saveGeneralSound(account: string, sound: string, imported?: ImportedAudio, vibrate = readGeneralPreferences(account).vibrate) {
  assertOwner(account);
  const previous = readGeneralPreferences(account);
  const database = await mediaDB(); const key = mediaKey(account, 'general'); const previousFile = await database.get('files', key);
  let configured = false;
  try {
    if (sound === 'custom' && imported) await storeImportedAudio(account, 'general', imported);
    const channel = await configureSound(account, 'general', sound, imported, vibrate, true); configured = true;
    assertOwner(account);
    localStorage.setItem(preferenceKey(account), JSON.stringify({ sound, vibrate, channelId: channel.channelId }));
    try { localStorage.setItem(`qc.notification-sound.v1:${account}`, sound); } catch { /* v2 is the authoritative atomic preference. */ }
    window.dispatchEvent(new CustomEvent('qc:notification-sound', { detail: channel.channelId }));
    return channel;
  } catch (error) {
    if (previousFile === undefined) await database.delete('files', key); else await database.put('files', previousFile, key);
    if (configured && readActiveIdentity()?.id === account) await configureSound(account, 'general', previous.sound, undefined, previous.vibrate, true).catch(() => undefined);
    throw error;
  } finally { database.close(); }
}
