/**
 * Recitation points — the single source of truth for the scoring rules.
 *
 *   one recited ayah  = +1
 *   one mistake       = -1     (خطأ)
 *   one warning       = -0.25  (تنبيه)
 *
 * A session can never be worth less than zero: a student who struggles through
 * a passage should end the day with nothing added, not with points taken off a
 * balance they earned on other days.
 */
export const POINTS_PER_VERSE = 1;
export const POINTS_PER_MISTAKE = 1;
export const POINTS_PER_WARNING = 0.25;

/** Points awarded on top of the recitation itself when a whole surah is finished. */
export const SURAH_COMPLETION_POINTS = 10;

export interface PointsInput {
  versesCount?: number | null;
  mistakes?: number | null;
  warnings?: number | null;
}

export function calculatePoints({ versesCount, mistakes, warnings }: PointsInput): number {
  const verses = Math.max(0, versesCount ?? 0);
  const raw =
    verses * POINTS_PER_VERSE -
    Math.max(0, mistakes ?? 0) * POINTS_PER_MISTAKE -
    Math.max(0, warnings ?? 0) * POINTS_PER_WARNING;
  // Quarter-point deductions produce values such as 19.75; two decimals is
  // exact for every reachable result and keeps floating-point noise out of the DB.
  return Math.round(Math.max(0, raw) * 100) / 100;
}

/** Human-readable breakdown, used by the UI to explain how a score was reached. */
export function pointsBreakdown(input: PointsInput) {
  const verses = Math.max(0, input.versesCount ?? 0);
  const mistakes = Math.max(0, input.mistakes ?? 0);
  const warnings = Math.max(0, input.warnings ?? 0);
  return {
    verses,
    mistakes,
    warnings,
    earned: verses * POINTS_PER_VERSE,
    deducted: Math.round((mistakes * POINTS_PER_MISTAKE + warnings * POINTS_PER_WARNING) * 100) / 100,
    total: calculatePoints(input),
  };
}
