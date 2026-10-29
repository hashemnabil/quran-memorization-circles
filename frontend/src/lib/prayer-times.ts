import { CalculationMethod, Coordinates, Madhab, PrayerTimes } from 'adhan';

export const GAZA_ZONE = 'Asia/Gaza';
export const PRAYERS = [
  { id: 'fajr', label: 'الفجر', icon: '☾' },
  { id: 'sunrise', label: 'الشروق', icon: '☀' },
  { id: 'dhuhr', label: 'الظهر', icon: '☀' },
  { id: 'asr', label: 'العصر', icon: '◷' },
  { id: 'maghrib', label: 'المغرب', icon: '◒' },
  { id: 'isha', label: 'العشاء', icon: '☾' },
] as const;
export type PrayerId = typeof PRAYERS[number]['id'];
export type ObligatoryPrayer = Exclude<PrayerId, 'sunrise'>;
export const obligatoryPrayers = PRAYERS.filter(p => p.id !== 'sunrise');
export const CALCULATION_DESCRIPTION = 'حساب فلكي محلي بطريقة الهيئة المصرية للمساحة: الفجر 19.5° والعشاء 17.5°، والعصر وفق الجمهور. يلزم مطابقة تقويم الأوقاف المحلي قبل اعتماد التذكيرات رسميًا.';

export function gazaDateKey(date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en', { timeZone: GAZA_ZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date);
  const part = (name: string) => parts.find(p => p.type === name)!.value;
  return `${part('year')}-${part('month')}-${part('day')}`;
}
export function shiftDate(key: string, days: number): string {
  const date = new Date(`${key}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}
export function calculateGazaTimes(key = gazaDateKey()) {
  const [year, month, day] = key.split('-').map(Number);
  const parameters = CalculationMethod.Egyptian();
  parameters.madhab = Madhab.Shafi;
  // Adhan reads the calendar fields in the device timezone, then returns UTC instants.
  // Supply Gaza's calendar date explicitly; never derive it from the device date.
  const times = new PrayerTimes(new Coordinates(31.5017, 34.4668), new Date(year, month - 1, day, 12), parameters);
  return PRAYERS.map(prayer => ({ ...prayer, at: times[prayer.id] }));
}
export function nextPrayer(now = new Date()) {
  const key = gazaDateKey(now);
  return [...calculateGazaTimes(key), ...calculateGazaTimes(shiftDate(key, 1))]
    .find(prayer => prayer.id !== 'sunrise' && prayer.at.getTime() > now.getTime())!;
}
export function prayerTimeLabel(at: Date) {
  return new Intl.DateTimeFormat('ar', { timeZone: GAZA_ZONE, hour: '2-digit', minute: '2-digit', hour12: false, numberingSystem: 'latn' }).format(at);
}
export function countdown(at: Date, now = Date.now()) {
  const seconds = Math.max(0, Math.ceil((at.getTime() - now) / 1000));
  return [Math.floor(seconds / 3600), Math.floor(seconds / 60) % 60, seconds % 60].map(v => String(v).padStart(2, '0')).join(':');
}
export type ReminderPreferences = {
  enabled: boolean;
  sound: string;
  adhanEnabled?: boolean;
  adhanSource?: 'builtin' | 'custom';
  hijriOffset: number;
  prayers: Record<ObligatoryPrayer, { enabled: boolean; before: number }>;
};
export function defaultPrayerPreferences(): ReminderPreferences {
  return { enabled: false, sound: 'default', adhanEnabled: false, adhanSource: 'builtin', hijriOffset: 0, prayers: Object.fromEntries(obligatoryPrayers.map(p => [p.id, { enabled: true, before: 0 }])) as ReminderPreferences['prayers'] };
}
export function readPrayerPreferences(account: string): ReminderPreferences {
  const defaults = defaultPrayerPreferences();
  try {
    const value = JSON.parse(localStorage.getItem(`qc.prayers.v1:${account}`) || '{}');
    return { enabled: value.enabled === true, sound: ['default', 'silent', 'calm', 'electronic', 'clear', 'custom'].includes(value.sound) ? value.sound : 'default',
      adhanEnabled: typeof value.adhanEnabled === 'boolean' ? value.adhanEnabled : value.sound === 'custom',
      adhanSource: value.adhanSource === 'custom' || value.adhanSource === undefined && value.sound === 'custom' ? 'custom' : 'builtin',
      hijriOffset: [-2, -1, 0, 1, 2].includes(value.hijriOffset) ? value.hijriOffset : 0,
      prayers: Object.fromEntries(obligatoryPrayers.map(p => [p.id, { enabled: typeof value.prayers?.[p.id]?.enabled === 'boolean' ? value.prayers[p.id].enabled : true,
        before: [0, 5, 10, 15].includes(value.prayers?.[p.id]?.before) ? value.prayers[p.id].before : 0 }])) as ReminderPreferences['prayers'] };
  } catch { return defaults; }
}
export function savePrayerPreferences(account: string, value: ReminderPreferences) {
  localStorage.setItem(`qc.prayers.v1:${account}`, JSON.stringify(value));
  window.dispatchEvent(new CustomEvent('qc:prayer-settings', { detail: account }));
}
export function prayerReminders(preferences: ReminderPreferences, now = new Date(), days = 30) {
  if (!preferences.enabled) return [];
  const start = gazaDateKey(now);
  return Array.from({ length: days }, (_, i) => calculateGazaTimes(shiftDate(start, i))).flat()
    .filter(p => p.id !== 'sunrise' && preferences.prayers[p.id].enabled)
    .map(p => ({ ...p, remindAt: new Date(p.at.getTime() - preferences.prayers[p.id as ObligatoryPrayer].before * 60000) }))
    .filter(p => p.remindAt.getTime() > now.getTime());
}
/** Early reminders and the actual adhan are independent, chronologically ordered events. */
export function prayerAlarmEvents(preferences: ReminderPreferences, now = new Date(), days = 30) {
  const events = prayerReminders(preferences, now, days).map(p => ({ ...p, adhan: preferences.adhanEnabled === true && p.remindAt.getTime() === p.at.getTime(), adhanSource: preferences.adhanSource || 'builtin' }));
  if (preferences.adhanEnabled) {
    const atTime = { ...preferences, prayers: Object.fromEntries(obligatoryPrayers.map(p => [p.id, { ...preferences.prayers[p.id], before: 0 }])) as ReminderPreferences['prayers'] };
    for (const prayer of prayerReminders(atTime, now, days)) if (preferences.prayers[prayer.id as ObligatoryPrayer].before > 0) events.push({ ...prayer, adhan: true, adhanSource: preferences.adhanSource || 'builtin' });
  }
  return events.sort((a, b) => a.remindAt.getTime() - b.remindAt.getTime());
}
