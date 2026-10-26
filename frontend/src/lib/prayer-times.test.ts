import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calculateGazaTimes, countdown, defaultPrayerPreferences, gazaDateKey, nextPrayer, prayerReminders, prayerTimeLabel, readPrayerPreferences, shiftDate } from './prayer-times';

test('Gaza calendar date is independent of the device timezone', () => {
  assert.equal(gazaDateKey(new Date('2026-07-01T22:30:00Z')), '2026-07-02');
  assert.equal(gazaDateKey(new Date('2026-01-01T21:30:00Z')), '2026-01-01');
  assert.equal(shiftDate('2026-12-31', 1), '2027-01-01');
  assert.equal(shiftDate('2028-02-28', 1), '2028-02-29');
});
test('all six calculated events are finite and ordered throughout the year', () => {
  for (let month = 1; month <= 12; month++) {
    const times = calculateGazaTimes(`2026-${String(month).padStart(2, '0')}-15`);
    assert.equal(times.length, 6);
    times.forEach((p, i) => { assert.ok(Number.isFinite(p.at.getTime())); if (i) assert.ok(p.at > times[i - 1].at); });
  }
  assert.notEqual(prayerTimeLabel(calculateGazaTimes('2026-01-15')[0].at), prayerTimeLabel(calculateGazaTimes('2026-07-15')[0].at));
});
test('summer and winter clock offsets follow Asia/Gaza', () => {
  const offset = (key: string) => { const at = calculateGazaTimes(key)[2].at; return Number(prayerTimeLabel(at).split(':')[0]) - at.getUTCHours(); };
  assert.equal(offset('2026-01-15'), 2); assert.equal(offset('2026-07-15'), 3);
});
test('consecutive dates across the actual DST transition remain valid', () => {
  for (const key of ['2026-03-27', '2026-03-28', '2026-03-29', '2026-10-23', '2026-10-24', '2026-10-25']) {
    const today = calculateGazaTimes(key); const tomorrow = calculateGazaTimes(shiftDate(key, 1));
    const delta = tomorrow[2].at.getTime() - today[2].at.getTime();
    assert.ok(delta > 23 * 3600000 && delta < 25 * 3600000);
    assert.equal(gazaDateKey(today[0].at), key);
  }
});
test('next prayer skips sunrise and rolls to tomorrow fajr after isha', () => {
  const times = calculateGazaTimes('2026-10-25');
  assert.equal(nextPrayer(new Date(times[0].at.getTime() + 1000)).id, 'dhuhr');
  const next = nextPrayer(new Date(times[5].at.getTime() + 1000));
  assert.equal(next.id, 'fajr'); assert.equal(gazaDateKey(next.at), '2026-10-26');
  assert.equal(nextPrayer(times[2].at).id, 'asr');
});
test('countdown clamps at zero', () => {
  assert.equal(countdown(new Date(3661000), 0), '01:01:01'); assert.equal(countdown(new Date(0), 1000), '00:00:00');
});
test('reminders are opt-in, exclude sunrise and support lead times', () => {
  const now = new Date('2026-10-25T00:00:00Z'); const prefs = defaultPrayerPreferences();
  assert.deepEqual(prayerReminders(prefs, now, 1), []);
  prefs.enabled = true; prefs.prayers.fajr.before = 15; prefs.prayers.isha.enabled = false;
  const reminders = prayerReminders(prefs, now, 1);
  assert.equal(reminders.length, 4); assert.ok(reminders.every(p => p.id !== 'sunrise' && p.id !== 'isha'));
  assert.equal(reminders[0].at.getTime() - reminders[0].remindAt.getTime(), 900000);
  assert.ok(prayerReminders(prefs, new Date('2026-10-25T23:00:00Z'), 1).every(p => p.remindAt.getTime() > new Date('2026-10-25T23:00:00Z').getTime()));
});
test('account preferences stay separate and invalid values fall back safely', () => {
  const original = globalThis.localStorage; const store = new Map<string, string>();
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { getItem: (key: string) => store.get(key) ?? null } });
  try {
    store.set('qc.prayers.v1:alice', JSON.stringify({ enabled: true, hijriOffset: 99, prayers: { fajr: { before: -1 } } }));
    assert.equal(readPrayerPreferences('alice').enabled, true); assert.equal(readPrayerPreferences('bob').enabled, false);
    assert.equal(readPrayerPreferences('alice').hijriOffset, 0); assert.equal(readPrayerPreferences('alice').prayers.fajr.before, 0);
  } finally { Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: original }); }
});
