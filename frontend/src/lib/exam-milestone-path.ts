/** A missing row reference must never turn a save into PATCH /milestones/:studentId/. */
export function examMilestonePath(studentId: string | undefined, sectionIdOrCode: string) {
  if (!studentId || !sectionIdOrCode) throw new Error('تعذر تحديد الطالب أو مقرر الاختبار. أعد تحميل الصفحة وحاول مجدداً.');
  const route = sectionIdOrCode.startsWith('COMBINED-') || sectionIdOrCode === 'KHATMA-MUSHAF' ? 'combined-milestones' : 'milestones';
  return `/exams/${route}/${encodeURIComponent(studentId)}/${encodeURIComponent(sectionIdOrCode)}`;
}
