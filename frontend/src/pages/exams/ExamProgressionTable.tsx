import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { api, apiError } from '@/lib/api';
import { Badge, Card, EmptyState, LoadingState } from '@/components/ui';
import { formatDateShort } from '@/lib/format';
import type { Exam, ExamEligibility } from '@/types';

type ExamRow = Exam & { scheduledAt: string; examiner?: { fullName: string } | null; gradedBy?: { fullName: string } | null };
type MilestoneRecord = { id: string; sectionId: string; status: 'NOT_REQUESTED' | 'REQUESTED' | 'SCHEDULED' | 'COMPLETED'; score: number | null; requestedAt: string | null; examDate: string | null; examinerName: string | null; section: { id: string; code: string; name: string; order: number } };
type ExamRequestRow = { status: 'PENDING' | 'SCHEDULED' | 'REJECTED' | 'CANCELLED' | 'COMPLETED'; sectionId: string; section: { id: string; code: string }; sections?: { section: { id: string; code: string } }[] };

function sequence() {
  const rows: { key: string; label: string; kind: 'HIZB' | 'JUZ'; number: number }[] = [];
  for (let hizb = 60, juz = 30; hizb >= 1; ) {
    rows.push({ key: `HIZB-${String(hizb).padStart(2, '0')}`, label: `حزب ${hizb}`, kind: 'HIZB', number: hizb });
    hizb--;
    if (hizb >= 1) {
      rows.push({ key: `HIZB-${String(hizb).padStart(2, '0')}`, label: `حزب ${hizb}`, kind: 'HIZB', number: hizb });
      hizb--;
    }
    rows.push({ key: `JUZ-${String(juz).padStart(2, '0')}`, label: `جزء ${juz}`, kind: 'JUZ', number: juz });
    juz--;
  }
  return rows;
}

export function ExamProgressionTable({ eligibility, exams, loading, studentId, canEditMilestones = false }: {
  eligibility?: ExamEligibility;
  exams: ExamRow[];
  loading?: boolean;
  studentId?: string;
  canEditMilestones?: boolean;
}) {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState<{ status: string; score: string; requestedAt: string; examDate: string; examinerName: string }>({ status: 'NOT_REQUESTED', score: '', requestedAt: '', examDate: '', examinerName: '' });
  const recordsQuery = useQuery({
    queryKey: ['exams', 'milestones', studentId],
    enabled: !!studentId,
    queryFn: async () => (await api.get<MilestoneRecord[]>(`/exams/milestones/${studentId}`)).data,
  });
  const records = recordsQuery.data ?? [];
  const requestsQuery = useQuery({
    queryKey: ['exams', 'milestones-requests', studentId],
    enabled: !!studentId,
    queryFn: async () => (await api.get<{ data: ExamRequestRow[] }>('/exams/requests', { params: { studentId, limit: 100 } })).data,
  });
  const requests = requestsQuery.data?.data ?? [];
  const saveRecord = useMutation({
    mutationFn: async (sectionId: string) => (await api.patch(`/exams/milestones/${studentId}/${sectionId}`, {
      status: draft.status,
      score: draft.score === '' ? null : Number(draft.score),
      requestedAt: draft.requestedAt || null,
      examDate: draft.examDate || null,
      examinerName: draft.examinerName || null,
    })).data,
    onSuccess: () => {
      toast.success('تم حفظ سجل المقرر');
      queryClient.invalidateQueries({ queryKey: ['exams', 'milestones', studentId] });
      queryClient.invalidateQueries({ queryKey: ['exams', 'eligibility', studentId] });
      setEditing(null);
    },
    onError: (error) => toast.error(apiError(error)),
  });
  const rows = useMemo(() => {
    const progression = eligibility?.progression ?? [];
    const all = sequence();
    let unlocked = true;
    return all.map((item) => {
      const section = progression.find((s) => s.code === item.key);
      const related = exams.filter((exam) =>
        exam.section?.code === item.key || exam.sections?.some((entry) => entry.section.code === item.key),
      ).sort((a, b) => new Date(b.scheduledAt).getTime() - new Date(a.scheduledAt).getTime())[0];
      const record = records.find((entry) => entry.section.code === item.key);
      const request = requests.find((entry) =>
        entry.section?.code === item.key || entry.sections?.some((part) => part.section.code === item.key),
      );
      const passed = record ? record.status === 'COMPLETED' : Boolean(section?.isPassed || related?.result === 'PASSED');
      const pending = record ? record.status === 'SCHEDULED' : Boolean(related?.status === 'SCHEDULED' || request?.status === 'SCHEDULED');
      const requested = record ? record.status === 'REQUESTED' : request?.status === 'PENDING';
      const currentUnlocked = unlocked || passed || pending || requested;
      if (!passed) unlocked = false;
      return { ...item, section, related, record, request, passed, pending, requested, unlocked: currentUnlocked };
    });
  }, [eligibility, exams, records, requests]);

  if (loading) return <LoadingState rows={5} />;
  return (
    <Card title="تسلسل اختبارات الأحزاب والأجزاء" padded={false}>
      <div className="border-b border-slate-100 px-5 py-3 text-xs leading-6 text-slate-500">
        التسلسل: حزبين ثم جزء، بدءًا من الحزب ٦٠ والجزء ٣٠ نزولًا. العلامة محفوظة لكل عنصر حتى عند طلب التسميع مجتمعة.
      </div>
      <div className="table-wrap border-0 shadow-none">
        <table className="table">
          <thead><tr><th>التسلسل</th><th>الحالة</th><th>العلامة</th><th>تاريخ الاختبار</th><th>الممتحن</th>{canEditMilestones && <th>إدارة</th>}</tr></thead>
          <tbody>
            {rows.map((row) => {
              const record = row.record;
              const groupedExam = (row.related?.sections?.length ?? 0) > 1;
              const score = record?.score ?? row.section?.score ?? (groupedExam ? null : row.related?.score);
              const completed = record ? record.status === 'COMPLETED' : row.related?.status === 'COMPLETED' || row.related?.status === 'ABSENT';
              const status = completed || row.passed ? 'تم الاختبار' : row.pending ? 'محدد / قيد الاختبار' : row.requested ? 'طُلب اختبار' : row.unlocked ? 'لم يُطلب اختبار' : 'مقفل بالتسلسل';
              return <tr key={row.key}>
                <td className="font-medium">{row.label}</td>
                <td><Badge className={row.passed ? 'bg-emerald-100 text-emerald-800' : row.pending ? 'bg-blue-100 text-blue-800' : row.unlocked ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-500'}>{status}</Badge></td>
                <td className="numeric">{score == null ? '—' : score}</td>
                <td className="numeric">{record?.examDate ? formatDateShort(record.examDate) : row.related?.scheduledAt ? formatDateShort(row.related.scheduledAt) : record?.requestedAt ? formatDateShort(record.requestedAt) : '—'}</td>
                <td>{record?.examinerName || row.related?.examiner?.fullName || row.related?.gradedBy?.fullName || '—'}</td>
                {canEditMilestones && <td>
                  {editing === row.key ? (
                    <div className="min-w-56 space-y-1">
                      <select className="form-input w-full" value={draft.status} onChange={(e) => setDraft({ ...draft, status: e.target.value })}>
                        <option value="NOT_REQUESTED">لم يُطلب اختبار</option><option value="REQUESTED">طُلب اختبار</option><option value="SCHEDULED">محدد / قيد الاختبار</option><option value="COMPLETED">تم الاختبار</option>
                      </select>
                      <input className="form-input w-full" type="number" min="0" max="100" placeholder="العلامة / 100" value={draft.score} onChange={(e) => setDraft({ ...draft, score: e.target.value })} />
                      <input className="form-input w-full" type="date" aria-label="تاريخ الطلب" title="تاريخ الطلب" value={draft.requestedAt} onChange={(e) => setDraft({ ...draft, requestedAt: e.target.value })} />
                      <input className="form-input w-full" type="date" aria-label="تاريخ الاختبار" title="تاريخ الاختبار" value={draft.examDate} onChange={(e) => setDraft({ ...draft, examDate: e.target.value })} />
                      <input className="form-input w-full" placeholder="اسم الممتحن" value={draft.examinerName} onChange={(e) => setDraft({ ...draft, examinerName: e.target.value })} />
                      <div className="flex gap-1"><button className="btn btn-primary btn-sm" disabled={saveRecord.isPending} onClick={() => saveRecord.mutate(row.section?.id || record?.sectionId || '')}>حفظ</button><button className="btn btn-secondary btn-sm" onClick={() => setEditing(null)}>إلغاء</button></div>
                    </div>
                  ) : <button className="btn btn-secondary btn-sm" onClick={() => { setEditing(row.key); setDraft({ status: record?.status ?? (row.pending ? 'SCHEDULED' : row.passed ? 'COMPLETED' : 'NOT_REQUESTED'), score: score == null ? '' : String(score), requestedAt: (record?.requestedAt ?? '').slice(0, 10), examDate: (record?.examDate ?? row.related?.scheduledAt ?? '').slice(0, 10), examinerName: record?.examinerName ?? row.related?.examiner?.fullName ?? '' }); }}>تعديل</button>}
                </td>}
              </tr>;
            })}
          </tbody>
        </table>
      </div>
      {!eligibility?.progression?.length && <div className="px-5 py-3"><EmptyState title="لم تُحمّل بيانات مقررات الاختبار بعد" /></div>}
    </Card>
  );
}
