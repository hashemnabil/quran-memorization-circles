import assert from 'node:assert/strict';
import { test } from 'node:test';
import { calculateSurahAchievements, type AchievementRecitation } from './surah-achievements';

const session = (type: string, day: number, fromAyah = 1, toAyah = 7, extra: Partial<AchievementRecitation> = {}): AchievementRecitation => ({
  id: `session-${day}`, type, date: `2026-10-${String(day).padStart(2, '0')}T00:00:00Z`, createdAt: `2026-10-${String(day).padStart(2, '0')}T08:00:00Z`,
  fromSurah: 'الفاتحة', fromAyah, toSurah: 'الفاتحة', toAyah, evaluation: 'EXCELLENT', ...extra,
});
const stages = (records: AchievementRecitation[]) => calculateSurahAchievements(records).map(item => [item.surah, item.stage]);

test('whole excellent memorization qualifies for yellow without a manual completion', () => {
  assert.deepEqual(stages([session('MEMORIZATION', 1)]), [['الفاتحة', 'MEMORIZED']]);
  assert.deepEqual(stages([session('MEMORIZATION', 1, 1, 6)]), []);
});
test('partial sessions require every ayah and overlapping ranges never fill a gap', () => {
  const records = [session('MEMORIZATION', 1, 1, 3), session('MEMORIZATION', 2, 1, 3), session('MEMORIZATION', 3, 5, 7)];
  assert.deepEqual(stages(records), []);
  assert.deepEqual(stages([...records, session('MEMORIZATION', 4, 4, 4)]), [['الفاتحة', 'MEMORIZED']]);
});
test('lower evaluations and tajweed sessions cannot complete a stage', () => {
  assert.deepEqual(stages([session('MEMORIZATION', 1, 1, 7, { evaluation: 'VERY_GOOD' }), session('TAJWEED', 2)]), []);
  assert.deepEqual(stages([session('MEMORIZATION', 1), session('MINOR_REVIEW', 2, 1, 7, { evaluation: 'GOOD' })]), [['الفاتحة', 'MEMORIZED']]);
});
test('excellent review advances yellow to red, and excellent consolidation advances red to green', () => {
  const records = [session('MEMORIZATION', 1), session('MINOR_REVIEW', 2)];
  assert.deepEqual(stages(records), [['الفاتحة', 'REVIEWED']]);
  const [achievement] = calculateSurahAchievements([...records, session('CONSOLIDATION', 3)]);
  assert.equal(achievement.stage, 'CONSOLIDATED');
  assert.ok(achievement.memorizedAt && achievement.reviewedAt && achievement.consolidatedAt);
});
test('every later stage can accumulate over multiple complete excellent ranges', () => {
  const records = [session('MEMORIZATION', 1), session('MAJOR_REVIEW', 2, 1, 4), session('MINOR_REVIEW', 3, 4, 7), session('CONSOLIDATION', 4, 1, 3)];
  assert.deepEqual(stages(records), [['الفاتحة', 'REVIEWED']]);
  assert.deepEqual(stages([...records, session('CONSOLIDATION', 5, 4, 7)]), [['الفاتحة', 'CONSOLIDATED']]);
});
test('review and consolidation cannot skip their prerequisites or use earlier sessions', () => {
  assert.deepEqual(stages([session('MINOR_REVIEW', 1), session('CONSOLIDATION', 2)]), []);
  assert.deepEqual(stages([session('MINOR_REVIEW', 1), session('MEMORIZATION', 2), session('CONSOLIDATION', 3)]), [['الفاتحة', 'MEMORIZED']]);
});
test('a multi-surah session splits its ayah range correctly', () => {
  assert.deepEqual(stages([session('MEMORIZATION', 1, 3, 286, { toSurah: 'البقرة' })]), [['البقرة', 'MEMORIZED']]);
  assert.deepEqual(stages([session('MEMORIZATION', 1, 1, 286, { toSurah: 'البقرة' })]), [['الفاتحة', 'MEMORIZED'], ['البقرة', 'MEMORIZED']]);
});
test('editing and deleting evidence recomputes and can remove a colour without duplicate rewards', () => {
  const memory = session('MEMORIZATION', 1);
  const review = session('MINOR_REVIEW', 2);
  const fixed = session('CONSOLIDATION', 3);
  assert.deepEqual(stages([memory, { ...review, deletedAt: '2026-10-04' }, fixed]), [['الفاتحة', 'MEMORIZED']]);
  assert.deepEqual(stages([{ ...memory, pendingDelete: 1 }, review, fixed]), []);
  assert.deepEqual(stages([{ ...memory, toAyah: 6 }, review, fixed]), []);
  assert.equal(calculateSurahAchievements([memory, memory, review, fixed]).length, 1);
});
test('chronological order uses recitation date then creation time, independent of API row order', () => {
  assert.deepEqual(stages([session('CONSOLIDATION', 3), session('MINOR_REVIEW', 2), session('MEMORIZATION', 1)]), [['الفاتحة', 'CONSOLIDATED']]);
});
test('invalid or unknown ranges cannot generate a completion', () => {
  assert.deepEqual(stages([session('MEMORIZATION', 1, 0, 7), session('MEMORIZATION', 2, 1, 8), session('MEMORIZATION', 3, 1, 7, { fromSurah: 'غير موجودة' })]), []);
});
