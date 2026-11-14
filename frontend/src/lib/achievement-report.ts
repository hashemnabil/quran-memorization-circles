import { exportLocalPdf } from './local-pdf';
import { SURAHS } from './quran-surahs';
import type { SurahAchievement } from './surah-achievements';

type AchievementStudent = {
  fullName: string;
  memorizedParts?: number | string | null;
  circle?: { name: string } | null;
  surahAchievements?: SurahAchievement[];
};

const dateLabel = (value?: string | null) => {
  if (!value) return 'غير مسجل';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'غير مسجل' : new Intl.DateTimeFormat('ar-PS', { year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
};

export async function exportAchievementReport(student: AchievementStudent) {
  const completions = student.surahAchievements ?? [];
  const completedByName = new Map(completions.map(item => [item.surah, item]));
  const completed = SURAHS.filter(surah => completedByName.has(surah.name));
  const parts = Math.max(0, Math.min(30, Number(student.memorizedParts) || 0));
  const issuedAt = dateLabel(new Date().toISOString());
  const rows = [
    { 'الرقم': '—', 'السورة / البيان': 'الطالب: ' + student.fullName, 'الحالة / القيمة': 'الحلقة: ' + (student.circle?.name ?? 'غير محددة'), 'تاريخ الإكمال': 'تاريخ الإصدار: ' + issuedAt },
    { 'الرقم': '—', 'السورة / البيان': 'الأجزاء المحفوظة', 'الحالة / القيمة': parts + ' من 30', 'تاريخ الإكمال': '—' },
    { 'الرقم': '—', 'السورة / البيان': 'السور المكتملة', 'الحالة / القيمة': completed.length + ' من 114', 'تاريخ الإكمال': '—' },
    ...completed.map((surah, index) => ({
      'الرقم': index + 1,
      'السورة / البيان': surah.name,
      'الحالة / القيمة': ({MEMORIZED:'حفظ بممتاز',REVIEWED:'مراجعة بممتاز',CONSOLIDATED:'تثبيت بممتاز'} as const)[completedByName.get(surah.name)!.stage],
      'تاريخ الإكمال': dateLabel(completedByName.get(surah.name)?.consolidatedAt ?? completedByName.get(surah.name)?.reviewedAt ?? completedByName.get(surah.name)?.memorizedAt),
    })),
  ];
  return exportLocalPdf('تقرير الإنجازات القرآنية', rows, { student: student.fullName, circle: student.circle?.name ?? 'غير محددة', period: 'تاريخ الإصدار: ' + issuedAt });
}
