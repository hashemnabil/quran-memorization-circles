import { SURAHS } from './quran-surahs';

export type SurahAchievementStage = 'MEMORIZED' | 'REVIEWED' | 'CONSOLIDATED';
export interface SurahAchievement {
  surah: string;
  stage: SurahAchievementStage;
  memorizedAt: string;
  reviewedAt?: string;
  consolidatedAt?: string;
}
export interface AchievementRecitation {
  id?: string;
  type?: string;
  fromSurah: string;
  fromAyah: number;
  toSurah: string;
  toAyah: number;
  evaluation?: string | null;
  date: string | Date;
  createdAt?: string | Date;
  deletedAt?: string | Date | null;
  pendingDelete?: number | boolean;
}
const timestamp = (value: string | Date | undefined) => value ? new Date(value).getTime() : 0;

/** Recomputed from active, excellent sessions: overlapping ayat count once; later stages need earlier stages. */
export function calculateSurahAchievements(records: readonly AchievementRecitation[]): SurahAchievement[] {
  const states = new Map<string, { achievement?: SurahAchievement; ranges: [number, number][][] }>();
  const sorted = records.filter(record => !record.deletedAt && !record.pendingDelete && record.evaluation === 'EXCELLENT')
    .slice().sort((a, b) => timestamp(a.date) - timestamp(b.date) || timestamp(a.createdAt) - timestamp(b.createdAt) || (a.id || '').localeCompare(b.id || ''));
  for (const record of sorted) {
    const stage = record.type === 'MEMORIZATION' || !record.type ? 0 : ['MINOR_REVIEW', 'MAJOR_REVIEW'].includes(record.type) ? 1 : record.type === 'CONSOLIDATION' ? 2 : -1;
    if (stage < 0 || !record.date || !Number.isFinite(timestamp(record.date))) continue;
    const from = SURAHS.find(surah => surah.name === record.fromSurah?.trim());
    const to = SURAHS.find(surah => surah.name === record.toSurah?.trim());
    if (!from || !to || from.number > to.number || !Number.isInteger(record.fromAyah) || !Number.isInteger(record.toAyah)
      || record.fromAyah < 1 || record.fromAyah > from.ayahs || record.toAyah < 1 || record.toAyah > to.ayahs
      || from.number === to.number && record.fromAyah > record.toAyah) continue;
    for (const surah of SURAHS.slice(from.number - 1, to.number)) {
      const state = states.get(surah.name) || { ranges: [[], [], []] };
      states.set(surah.name, state);
      if (stage === 1 && !state.achievement || stage === 2 && !state.achievement?.reviewedAt) continue;
      const start = surah.number === from.number ? record.fromAyah : 1;
      const end = surah.number === to.number ? record.toAyah : surah.ayahs;
      const ranges = [...state.ranges[stage], [start, end] as [number, number]].sort((a, b) => a[0] - b[0]);
      const merged: [number, number][] = [];
      for (const range of ranges) {
        const previous = merged[merged.length - 1];
        if (previous && range[0] <= previous[1] + 1) previous[1] = Math.max(previous[1], range[1]);
        else merged.push([...range]);
      }
      state.ranges[stage] = merged;
      if (merged.length !== 1 || merged[0][0] !== 1 || merged[0][1] !== surah.ayahs) continue;
      const at = new Date(record.date).toISOString();
      if (stage === 0 && !state.achievement) state.achievement = { surah: surah.name, stage: 'MEMORIZED', memorizedAt: at };
      else if (stage === 1 && state.achievement && !state.achievement.reviewedAt) state.achievement = { ...state.achievement, stage: 'REVIEWED', reviewedAt: at };
      else if (stage === 2 && state.achievement && !state.achievement.consolidatedAt) state.achievement = { ...state.achievement, stage: 'CONSOLIDATED', consolidatedAt: at };
    }
  }
  return SURAHS.flatMap(surah => states.get(surah.name)?.achievement ? [states.get(surah.name)!.achievement!] : []);
}
