import { notifyWriteSuccess } from '@/lib/write-feedback';
import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { api, apiError } from '@/lib/api';
import { examMilestonePath } from '@/lib/exam-milestone-path';
import { Badge, Card, EmptyState, ErrorState, LoadingState } from '@/components/ui';
import { formatDateShort } from '@/lib/format';
import type { Exam, ExamEligibility } from '@/types';
import { combinedPlan, type CombinedStage } from '@/lib/combined-plan';

type ExamRow = Exam & { updatedAt?:string; createdAt?:string; scheduledAt: string; examiner?: { fullName: string } | null; gradedBy?: { fullName: string } | null };
type MilestoneRecord = { id: string; sectionId: string; status: 'NOT_REQUESTED' | 'REQUESTED' | 'SCHEDULED' | 'COMPLETED'; score: number | null; requestedAt: string | null; examDate: string | null; examinerName: string | null; section: { id: string; code: string; name: string; order: number } };
type ExamRequestRow = { id: string; combinedStage?: string | null; createdAt: string; status: 'PENDING' | 'SCHEDULED' | 'REJECTED' | 'CANCELLED' | 'COMPLETED'; sectionId: string; section: { id: string; code: string }; sections?: { section: { id: string; code: string } }[] };

function sequence() {
  const rows: { key: string; label: string; kind: 'HIZB' | 'JUZ' | 'COMBINED'; number: number; stage?: CombinedStage }[] = [];
  for (let hizb = 60, juz = 30; hizb >= 1; ) {
    rows.push({ key: `HIZB-${String(hizb).padStart(2, '0')}`, label: `حزب ${hizb}`, kind: 'HIZB', number: hizb });
    hizb--;
    if (hizb >= 1) {
      rows.push({ key: `HIZB-${String(hizb).padStart(2, '0')}`, label: `حزب ${hizb}`, kind: 'HIZB', number: hizb });
      hizb--;
    }
    rows.push({ key: `JUZ-${String(juz).padStart(2, '0')}`, label: `جزء ${juz}`, kind: 'JUZ', number: juz });
    for (const stage of combinedPlan().filter(stage => stage.at === 31 - juz)) rows.push({ key: stage.code, label: stage.label, kind: 'COMBINED', number: juz, stage });
    juz--;
  }
  return rows;
}

export function ExamProgressionTable({ eligibility, exams, loading, studentId, canEditMilestones = false, canRequest = false, onlyCombined = false }: {
  eligibility?: ExamEligibility;
  exams: ExamRow[];
  loading?: boolean;
  studentId?: string;
  canEditMilestones?: boolean;
  canRequest?: boolean;
  onlyCombined?: boolean;
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
  const submitSectionRequest = useMutation({
    mutationFn: (codeOrSection: string) => api.post('/exams/requests', combinedPlan().some(stage => stage.code === codeOrSection) ? { studentId, combinedStage: codeOrSection } : { studentId, sectionIds: [codeOrSection] }),
    onSuccess: async (_offlineWriteResult) => {
      notifyWriteSuccess(_offlineWriteResult, 'تم تقديم طلب الاختبار وتحديث حالة المقرر');
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['exams'] }),
        queryClient.invalidateQueries({ queryKey: ['students', studentId] }),
        queryClient.invalidateQueries({ queryKey: ['students', studentId, 'history'] }),
      ]);
    },
    onError: (error) => toast.error(apiError(error)),
  });
  const saveRecord = useMutation({
    mutationFn: async (sectionId: string) => (await api.patch(examMilestonePath(studentId, sectionId), {
      status: draft.status,
      score: draft.score === '' ? null : Number(draft.score),
      requestedAt: draft.requestedAt || null,
      examDate: draft.examDate || null,
      examinerName: draft.examinerName || null,
    })).data,
    onSuccess: (_offlineWriteResult) => {
      notifyWriteSuccess(_offlineWriteResult, 'تم حفظ سجل المقرر');
      // Keep every exam screen and the student's progression in sync after an
      // administrative status change, including request/scheduled/completed.
      queryClient.invalidateQueries({ queryKey: ['exams'] });
      queryClient.invalidateQueries({ queryKey: ['exams', 'milestones', studentId] });
      queryClient.invalidateQueries({ queryKey: ['exams', 'eligibility', studentId] });
      queryClient.invalidateQueries({ queryKey: ['students', studentId] });
      queryClient.invalidateQueries({ queryKey: ['students', studentId, 'history'] });
      setEditing(null);
    },
    onError: (error) => toast.error(apiError(error)),
  });
  const rows = useMemo(() => {
    const progression = eligibility?.progression ?? [];
    const all = sequence();
    // Unlock strictly in sequence: only passing the current required item
    // unlocks the next one. A request or scheduled date does not count as a pass.
    let previousRequiredPassed = true;
    return all.map((item) => {
      const section = progression.find((s) => s.code === item.key);
      const related = exams.filter((exam) =>
        item.stage ? exam.combinedStage === item.key : !exam.combinedStage && (exam.section?.code === item.key || exam.sections?.some((entry) => entry.section.code === item.key)),
      ).sort((a, b) => new Date(item.stage?(b.updatedAt||b.createdAt||b.scheduledAt):b.scheduledAt).getTime() - new Date(item.stage?(a.updatedAt||a.createdAt||a.scheduledAt):a.scheduledAt).getTime())[0];
      const record = records.find((entry) => entry.section.code === item.key);
      // Use the newest request for this section. Old rejected/cancelled requests
      // must not hide a newer request.
      const request = [...requests]
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        .find((entry) =>
          item.stage ? entry.combinedStage === item.key : !entry.combinedStage && (entry.section?.code === item.key || entry.sections?.some((part) => part.section.code === item.key)),
        );
      // The live request/exam is authoritative. Manual milestone rows can be stale
      // (e.g. NOT_REQUESTED after a request, or REQUESTED after scheduling).
      const liveCompleted = related?.status === 'COMPLETED' || related?.status === 'ABSENT';
      const liveActive = related?.status === 'SCHEDULED' || request?.status === 'PENDING' || request?.status === 'SCHEDULED';
      const passed = liveCompleted
        ? related?.result === 'PASSED'
        : liveActive ? false : record ? record.status === 'COMPLETED' && record.score != null && record.score >= 80 : Boolean(section?.isPassed);
      const pending = related?.status === 'SCHEDULED' || request?.status === 'SCHEDULED' ||
        (!related && request?.status !== 'PENDING' && record?.status === 'SCHEDULED');
      const requested = !pending && !liveCompleted &&
        (request?.status === 'PENDING' || (!request && record?.status === 'REQUESTED'));
      const currentUnlocked = item.stage
        ? Array.from({ length: item.stage.toJuz - item.stage.fromJuz + 1 }, (_, index) =>
          `JUZ-${String(item.stage!.fromJuz + index).padStart(2, '0')}`).every(code =>
            progression.some(section => section.code === code && section.isPassed) ||
            records.some(record => record.section.code === code && record.status === 'COMPLETED' && record.score != null && record.score >= 80) ||
            exams.some(exam => !exam.combinedStage && exam.status === 'COMPLETED' && exam.result === 'PASSED' && exam.section?.code === code)) &&
          (!item.stage.prerequisite || [...exams].filter(exam=>exam.combinedStage===item.stage!.prerequisite).sort((a,b)=>new Date(b.updatedAt||b.createdAt||b.scheduledAt).getTime()-new Date(a.updatedAt||a.createdAt||a.scheduledAt).getTime()).slice(0,1).some(exam=>exam.status==='COMPLETED'&&exam.result==='PASSED'))
        : previousRequiredPassed;
      // The next row is available only when this row has actually been passed.
      previousRequiredPassed = passed;
      return { ...item, section, related, record, request, passed, pending, requested, unlocked: currentUnlocked };
    });
  }, [eligibility, exams, records, requests]);

  if (loading || recordsQuery.isPending || requestsQuery.isPending) return <LoadingState rows={5} />;
  if(recordsQuery.isError||requestsQuery.isError)return <ErrorState message="تعذر تحميل سجل الاختبارات والطلبات" onRetry={()=>{void recordsQuery.refetch();void requestsQuery.refetch();}}/>;
  return (
    <Card title={onlyCombined?"اختبارات المجمّعة — طلب وتعديل":"تسلسل اختبارات الأحزاب والأجزاء والمجمّعة"} padded={false}>
      <div className="border-b border-slate-100 px-5 py-3 text-xs leading-6 text-slate-500">
        التسلسل: حزبين ثم جزء، بدءًا من الحزب ٦٠ والجزء ٣٠ نزولًا. يمكنك طلب اختبار المجمّعة بعد اجتياز الأجزاء المطلوبة والمجمّعة السابقة، من زر طلب اختبار في نفس الجدول.
      </div>
      <div className="table-wrap border-0 shadow-none">
        <table className="table">
          <thead><tr><th>التسلسل</th><th>الحالة</th><th>العلامة</th><th>تاريخ الاختبار</th><th>الممتحن</th>{canRequest && !canEditMilestones && <th>طلب اختبار</th>}{canEditMilestones && <th>إدارة</th>}</tr></thead>
          <tbody>
            {rows.filter(row=>!onlyCombined||row.stage).map((row) => {
              const record = row.record;
              const groupedExam = (row.related?.sections?.length ?? 0) > 1;
              const score = record ? record.score : row.section?.score ?? (groupedExam && !row.stage ? null : row.related?.score);
              const completed = row.related?.status === 'COMPLETED' || row.related?.status === 'ABSENT' || (!row.related && record?.status === 'COMPLETED');
              const status = completed || row.passed ? 'تم الاختبار' : row.pending ? 'محدد / قيد الاختبار' : row.requested ? 'طُلب اختبار' : row.unlocked ? 'لم يُطلب اختبار' : 'مقفل بالتسلسل';
              return <tr key={row.key}>
                <td className={`font-medium ${row.stage ? 'bg-emerald-50 text-emerald-900' : ''}`}>{row.label}</td>
                <td><Badge className={row.passed ? 'bg-emerald-100 text-emerald-800' : row.pending ? 'bg-blue-100 text-blue-800' : row.unlocked ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-500'}>{status}</Badge></td>
                <td className="numeric">{score == null ? '—' : score}</td>
                <td className="numeric">{record?.examDate ? formatDateShort(record.examDate) : row.related?.scheduledAt && row.related.status !== 'CANCELLED' ? formatDateShort(row.related.scheduledAt) : record?.requestedAt ? formatDateShort(record.requestedAt) : '—'}</td>
                <td>{record?.examinerName || row.related?.examiner?.fullName || row.related?.gradedBy?.fullName || '—'}</td>
                {canRequest && !canEditMilestones && <td>{(row.section || row.stage) && row.unlocked && !row.passed && !row.pending && !row.requested ? <button className="btn btn-primary btn-sm" disabled={submitSectionRequest.isPending} onClick={() => submitSectionRequest.mutate(row.stage?.code || row.section!.id)}>طلب اختبار</button> : <span className="text-xs text-slate-400">{row.passed ? 'مجتاز' : row.pending || row.requested ? 'طلب قائم' : 'حسب التسلسل'}</span>}</td>}
                {canEditMilestones && <td>
                  <div className="flex flex-wrap items-start gap-1">
                  {canRequest && (row.section || row.stage) && row.unlocked && !row.passed && !row.pending && !row.requested && <button className="btn btn-primary btn-sm" disabled={submitSectionRequest.isPending} onClick={() => submitSectionRequest.mutate(row.stage?.code || row.section!.id)}>طلب</button>}
                  {editing === row.key ? (
                    <div className="min-w-56 space-y-1">
                      <select className="form-input w-full" value={draft.status} onChange={(e) => setDraft({ ...draft, status: e.target.value })}>
                        <option value="NOT_REQUESTED">لم يُطلب اختبار</option><option value="REQUESTED">طُلب اختبار</option><option value="SCHEDULED">محدد / قيد الاختبار</option><option value="COMPLETED">تم الاختبار</option>
                      </select>
                      <input className="form-input w-full" type="number" min="0" max="100" placeholder="العلامة / 100" value={draft.score} onChange={(e) => setDraft({ ...draft, score: e.target.value })} />
                      <input className="form-input w-full" type="date" aria-label="تاريخ الطلب" title="تاريخ الطلب" value={draft.requestedAt} onChange={(e) => setDraft({ ...draft, requestedAt: e.target.value })} />
                      <input className="form-input w-full" type="date" aria-label="تاريخ الاختبار" title="تاريخ الاختبار" value={draft.examDate} onChange={(e) => setDraft({ ...draft, examDate: e.target.value })} />
                      <input className="form-input w-full" placeholder="اسم الممتحن" value={draft.examinerName} onChange={(e) => setDraft({ ...draft, examinerName: e.target.value })} />
                      <div className="flex gap-1"><button className="btn btn-primary btn-sm" disabled={saveRecord.isPending} onClick={() => saveRecord.mutate(row.stage?.code || row.section?.id || record?.sectionId || row.key)}>حفظ</button><button className="btn btn-secondary btn-sm" onClick={() => setEditing(null)}>إلغاء</button></div>
                    </div>
                  ) : <button className="btn btn-secondary btn-sm" onClick={() => { setEditing(row.key); setDraft({ status: record?.status ?? (row.pending ? 'SCHEDULED' : completed ? 'COMPLETED' : row.requested ? 'REQUESTED' : 'NOT_REQUESTED'), score: score == null ? '' : String(score), requestedAt: (record?.requestedAt ?? '').slice(0, 10), examDate: (record?.examDate ?? row.related?.scheduledAt ?? '').slice(0, 10), examinerName: record?.examinerName ?? row.related?.examiner?.fullName ?? '' }); }}>تعديل</button>}
                  </div>
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
