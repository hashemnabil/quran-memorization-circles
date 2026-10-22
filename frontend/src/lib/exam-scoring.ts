export type ExamGrading = { mistakes: number; alerts: number; mistakePenalty: number; alertPenalty: number; tajweed: number };
export function calculateExamGrade(input: ExamGrading) {
  for (const key of ['mistakes','alerts','mistakePenalty','alertPenalty','tajweed'] as const) {
    if (!Number.isFinite(input[key]) || input[key] < 0) throw new Error('قيمة الرصد غير صالحة');
  }
  if (!Number.isInteger(input.mistakes) || !Number.isInteger(input.alerts) || input.mistakes > 500 || input.alerts > 500 || input.tajweed > 10 || input.mistakePenalty > 90 || input.alertPenalty > 90) throw new Error('قيمة الرصد خارج الحدود');
  const recitation = Math.round(Math.max(0, 90 - input.mistakes * input.mistakePenalty - input.alerts * input.alertPenalty) * 100) / 100;
  const score = Math.round((recitation + input.tajweed) * 100) / 100;
  return { ...input, recitation, score, passed: score >= 80 };
}
