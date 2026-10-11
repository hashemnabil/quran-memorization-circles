import { useMemo } from 'react';
import { Badge, Card, EmptyState, LoadingState } from '@/components/ui';
import { formatDateShort } from '@/lib/format';
import type { Exam, ExamEligibility } from '@/types';

type ExamRow = Exam & { scheduledAt: string; examiner?: { fullName: string } | null; gradedBy?: { fullName: string } | null };

function sequence() {
  const rows: { key: string; label: string; kind: 'HIZB' | 'JUZ'; number: number }[] = [];
  for (let hizb = 60, juz = 30; hizb >= 1; ) {
    rows.push({ key: `HIZB-${String(hizb).padStart(2, '0')}`, label: `حزب ${hizb}`, kind: 'HIZB', number: hizb });
    hizb--;
    rows.push({ key: `HIZB-${String(hizb).padStart(2, '0')}`, label: `حزب ${hizb}`, kind: 'HIZB', number: hizb });
    hizb--;
    rows.push({ key: `JUZ-${String(juz).padStart(2, '0')}`, label: `جزء ${juz}`, kind: 'JUZ', number: juz });
    juz--;
  }
  return rows;
}

export function ExamProgressionTable({ eligibility, exams, loading }: {
  eligibility?: ExamEligibility;
  exams: ExamRow[];
  loading?: boolean;
}) {
  const rows = useMemo(() => {
    const progression = eligibility?.progression ?? [];
    const all = sequence();
    let unlocked = true;
    return all.map((item) => {
      const section = progression.find((s) => s.code === item.key);
      const related = exams.filter((exam) =>
        exam.section?.code === item.key || exam.sections?.some((entry) => entry.section.code === item.key),
      ).sort((a, b) => new Date(b.scheduledAt).getTime() - new Date(a.scheduledAt).getTime())[0];
      const passed = Boolean(section?.isPassed || related?.result === 'PASSED');
      const pending = Boolean(section?.hasOpenRequest || related?.status === 'SCHEDULED');
      const currentUnlocked = unlocked || passed || pending;
      if (!passed) unlocked = false;
      return { ...item, section, related, passed, pending, unlocked: currentUnlocked };
    });
  }, [eligibility, exams]);

  if (loading) return <LoadingState rows={5} />;
  return (
    <Card title="تسلسل اختبارات الأحزاب والأجزاء" padded={false}>
      <div className="border-b border-slate-100 px-5 py-3 text-xs leading-6 text-slate-500">
        التسلسل: حزبين ثم جزء، بدءًا من الحزب ٦٠ والجزء ٣٠ نزولًا. العلامة محفوظة لكل عنصر حتى عند طلب التسميع مجتمعة.
      </div>
      <div className="table-wrap border-0 shadow-none">
        <table className="table">
          <thead><tr><th>التسلسل</th><th>الحالة</th><th>العلامة</th><th>تاريخ الاختبار</th><th>الممتحن</th></tr></thead>
          <tbody>
            {rows.map((row) => {
              const score = row.section?.score ?? row.related?.score;
              const status = row.passed ? 'تم الاختبار' : row.pending ? 'محدد / قيد الاختبار' : row.unlocked ? 'لم يُطلب اختبار' : 'مقفل بالتسلسل';
              return <tr key={row.key}>
                <td className="font-medium">{row.label}</td>
                <td><Badge className={row.passed ? 'bg-emerald-100 text-emerald-800' : row.pending ? 'bg-blue-100 text-blue-800' : row.unlocked ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-500'}>{status}</Badge></td>
                <td className="numeric">{score == null ? '—' : score}</td>
                <td className="numeric">{row.related?.scheduledAt ? formatDateShort(row.related.scheduledAt) : '—'}</td>
                <td>{row.related?.examiner?.fullName || row.related?.gradedBy?.fullName || '—'}</td>
              </tr>;
            })}
          </tbody>
        </table>
      </div>
      {!eligibility?.progression?.length && <div className="px-5 py-3"><EmptyState title="لم تُحمّل بيانات مقررات الاختبار بعد" /></div>}
    </Card>
  );
}
