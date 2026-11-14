import { Evaluation } from '@prisma/client';

/**
 * The school's grading scale. An exam is graded out of 100 and its evaluation
 * follows from that score — the examiner never picks it by hand, so the same
 * mark always earns the same wording.
 *
 *   90 – 100  ممتاز
 *   80 –  89  جيد جداً
 *   70 –  79  جيد
 *   60 –  69  مقبول
 *   أقل من 60 غير مرضٍ
 */
export const GRADING_SCALE: { min: number; evaluation: Evaluation }[] = [
  { min: 90, evaluation: Evaluation.EXCELLENT },
  { min: 80, evaluation: Evaluation.VERY_GOOD },
  { min: 70, evaluation: Evaluation.GOOD },
  { min: 60, evaluation: Evaluation.ACCEPTABLE },
];

/** Maps a score out of 100 onto its evaluation. */
export function evaluationFromScore(score: number): Evaluation {
  return (
    GRADING_SCALE.find((band) => score >= band.min)?.evaluation ?? Evaluation.UNSATISFACTORY
  );
}

export interface RecitationThresholds { excellent: number; veryGood: number; good: number; acceptable: number }
export const DEFAULT_RECITATION_THRESHOLDS: RecitationThresholds = { excellent: 90, veryGood: 80, good: 70, acceptable: 60 };
export function recitationEvaluation(score: number, limits: RecitationThresholds = DEFAULT_RECITATION_THRESHOLDS): Evaluation {
  if (score >= limits.excellent) return Evaluation.EXCELLENT;
  if (score >= limits.veryGood) return Evaluation.VERY_GOOD;
  if (score >= limits.good) return Evaluation.GOOD;
  if (score >= limits.acceptable) return Evaluation.ACCEPTABLE;
  return Evaluation.UNSATISFACTORY;
}

/** Arabic wording, used in notifications and the activity log. */
export const EVALUATION_LABELS: Record<Evaluation, string> = {
  EXCELLENT: 'ممتاز',
  VERY_GOOD: 'جيد جداً',
  GOOD: 'جيد',
  ACCEPTABLE: 'مقبول',
  UNSATISFACTORY: 'غير مرضٍ',
};
