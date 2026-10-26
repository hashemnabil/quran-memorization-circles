import { Capacitor, registerPlugin, type PluginListenerHandle } from '@capacitor/core';
import { openDB } from 'idb';
import { readActiveIdentity } from './active-identity';

export const SOUNDS = [
  { id: 'default', name: 'استخدام صوت الجهاز الافتراضي' },
  { id: 'calm', name: 'إشراقة — صوت هادئ', url: '/sounds/calm.wav' },
  { id: 'electronic', name: 'صفاء — تنبيه إلكتروني', url: '/sounds/electronic.wav' },
  { id: 'clear', name: 'نور — تنبيه واضح وقصير', url: '/sounds/clear.wav' },
  { id: 'silent', name: 'بدون صوت' },
] as const;
export type SoundScope = 'general' | 'prayer';
export interface SchoolNotificationsPlugin {
  configureChannel(options: { accountId: string; scope: SoundScope; sound: string; customData?: string; mime?: string }): Promise<{ channelId: string }>;
  showGeneral(options: { accountId: string; id: number; title: string; body: string; link: string }): Promise<void>;
  openSettings(options: { channelId?: string }): Promise<void>;
  previewDefault(): Promise<void>;
  stopPreview(): Promise<void>;
  schedulePrayers(options: { accountId: string; channelId: string; reminders: { at: number; title: string; body: string }[] }): Promise<{ exact: boolean }>;
  clearPrayers(): Promise<void>;
  consumePrayerOpen(): Promise<{ opened: boolean; link?: string }>;
  addListener(event: 'notificationOpened', listener: () => void): Promise<PluginListenerHandle>;
}
export const SchoolNotifications = registerPlugin<SchoolNotificationsPlugin>('SchoolNotifications');
export const androidNotifications = () => Capacitor.getPlatform() === 'android' && Capacitor.isPluginAvailable('SchoolNotifications');
const validIds = [...SOUNDS.map(s => s.id), 'custom'] as string[];
export function readGeneralSound(account: string) {
  try { const value = localStorage.getItem(`qc.notification-sound.v1:${account}`); return value && validIds.includes(value) ? value : 'default'; } catch { return 'default'; }
}
const mediaDB = () => openDB('qc-notification-audio', 1, { upgrade(db) { db.createObjectStore('files'); } });
export type ImportedAudio = { name: string; mime: string; data: string };
export async function readImportedAudio(account: string, scope: SoundScope): Promise<ImportedAudio | undefined> {
  const db = await mediaDB(); try { return await db.get('files', `${account}:${scope}`); } finally { db.close(); }
}
export async function importAudio(account: string, scope: SoundScope, file: File) {
  if (!file.type.startsWith('audio/') || file.size > 5 * 1024 * 1024 || file.size === 0) throw new Error('اختر ملفًا صوتيًا صالحًا لا يتجاوز 5 ميجابايت.');
  const data = await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = () => reject(new Error('تعذرت قراءة الملف')); reader.readAsDataURL(file); });
  const audio = new Audio(data);
  try {
    await new Promise<void>((resolve, reject) => { const timer = setTimeout(() => reject(new Error('تعذرت معاينة الملف الصوتي')), 8000); audio.onloadedmetadata = () => { clearTimeout(timer); resolve(); }; audio.onerror = () => { clearTimeout(timer); reject(new Error('صيغة الصوت غير مدعومة')); }; });
    if (!Number.isFinite(audio.duration) || audio.duration > 30) throw new Error('اختر تنبيهًا قصيرًا لا تتجاوز مدته 30 ثانية.');
  } finally { audio.src = ''; }
  return { name: file.name, mime: file.type, data };
}
export async function storeImportedAudio(account: string, scope: SoundScope, audio: ImportedAudio) {
  const db = await mediaDB(); try { await db.put('files', audio, `${account}:${scope}`); } finally { db.close(); }
}
export async function configureSound(account: string, scope: SoundScope, sound: string, imported?: ImportedAudio) {
  if (!validIds.includes(sound)) throw new Error('الصوت المحدد غير متاح');
  const custom = sound === 'custom' ? imported ?? await readImportedAudio(account, scope) : undefined;
  if (sound === 'custom' && !custom) throw new Error('اختر ملف الصوت من الجهاز أولًا');
  if (!androidNotifications()) return { channelId: `school-${scope}-${sound}-v1` };
  if (readActiveIdentity()?.id !== account) throw new Error('تغير الحساب النشط، أعد فتح الإعدادات');
  return SchoolNotifications.configureChannel({ accountId: account, scope, sound, customData: custom?.data.split(',')[1], mime: custom?.mime });
}
export async function saveGeneralSound(account: string, sound: string, imported?: ImportedAudio) {
  const channel = await configureSound(account, 'general', sound, imported);
  if (readActiveIdentity()?.id !== account) throw new Error('تغير الحساب النشط');
  if (sound === 'custom' && imported) await storeImportedAudio(account, 'general', imported);
  localStorage.setItem(`qc.notification-sound.v1:${account}`, sound);
  window.dispatchEvent(new CustomEvent('qc:notification-sound', { detail: channel.channelId }));
}
