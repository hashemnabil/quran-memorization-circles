import { notifyWriteSuccess } from '@/lib/write-feedback';
import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { api, apiError } from '@/lib/api';
import { examMilestonePath } from '@/lib/exam-milestone-path';
import { Badge, Button, Card, EmptyState, ErrorState, Input, LoadingState, Modal, Select } from '@/components/ui';
import { formatDateShort } from '@/lib/format';
import type { Exam, ExamEligibility } from '@/types';
import { combinedPlan, type CombinedStage } from '@/lib/combined-plan';
import { calculateExamGrade } from '@/lib/exam-scoring';

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
  const [filter,setFilter]=useState('all');
  const [search,setSearch]=useState('');
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState<{ status: string; score: string; requestedAt: string; examDate: string; examinerName: string }>({ status: 'NOT_REQUESTED', score: '', requestedAt: '', examDate: '', examinerName: '' });
  const [useBreakdown,setUseBreakdown]=useState(false);
  const [gradingDraft,setGradingDraft]=useState({mistakes:0,alerts:0,tajweed:10});
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
      score: useBreakdown&&draft.status==='COMPLETED'?calculated?.score:draft.score === '' ? null : Number(draft.score),
      ...(useBreakdown&&draft.status==='COMPLETED'?gradingDraft:{}),
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
        : previousRequiredPassed && Boolean(section?.eligible);
      // The next row is available only when this row has actually been passed.
      previousRequiredPassed = passed;
      return { ...item, section, related, record, request, passed, pending, requested, unlocked: currentUnlocked };
    });
  }, [eligibility, exams, records, requests]);

  const canSubmit=(row:typeof rows[number])=>canRequest&&!!(row.section||row.stage)&&row.unlocked&&!row.passed&&!row.pending&&!row.requested;
  const programmeRows=rows.filter(row=>!onlyCombined||row.stage);
  const available=programmeRows.filter(canSubmit).length;
  const active=programmeRows.filter(row=>row.pending||row.requested).length;
  const completedCount=programmeRows.filter(row=>row.passed||row.related?.status==='COMPLETED'||row.record?.status==='COMPLETED').length;
  const visibleRows=programmeRows.filter(row=>(!search.trim()||row.label.includes(search.trim()))&&(filter==='all'||filter==='available'&&canSubmit(row)||filter==='active'&&(row.pending||row.requested)||filter==='completed'&&(row.passed||row.related?.status==='COMPLETED'||row.record?.status==='COMPLETED')));
  const editingRow=rows.find(row=>row.key===editing);
  const savedGrading=editingRow?.related?.grading;
  const gradingSettings=useQuery({queryKey:['exam-grading-settings',editingRow?.related?.committeeId],enabled:!!editing&&draft.status==='COMPLETED'&&useBreakdown,queryFn:async()=>(await api.get<{mistakePenalty:number;alertPenalty:number}>(editingRow?.related?.committeeId?`/exams/committees/${editingRow.related.committeeId}/grading-settings`:'/exams/grading-settings')).data});
  const penalties=savedGrading?.mistakePenalty!=null&&savedGrading?.alertPenalty!=null?savedGrading:gradingSettings.data;
  let calculated:ReturnType<typeof calculateExamGrade>|undefined;
  try{if(penalties)calculated=calculateExamGrade({...gradingDraft,mistakePenalty:penalties.mistakePenalty,alertPenalty:penalties.alertPenalty});}catch{/* Invalid numeric inputs cannot be saved. */}
  const validScore=useBreakdown&&draft.status==='COMPLETED'?!!calculated:draft.score===''||(Number.isFinite(Number(draft.score))&&Number(draft.score)>=0&&Number(draft.score)<=100);
  if (loading || recordsQuery.isPending || requestsQuery.isPending) return <LoadingState rows={5} />;
  if(recordsQuery.isError||requestsQuery.isError)return <ErrorState message="تعذر تحميل سجل الاختبارات والطلبات" onRetry={()=>{void recordsQuery.refetch();void requestsQuery.refetch();}}/>;
  return <>
    <Card title={onlyCombined?'اختبارات المجمّعة':'تسلسل اختبارات الأحزاب والأجزاء والمجمّعة'} subtitle="يظهر زر طلب الاختبار عند استيفاء المتطلبات وعدم وجود طلب قائم." padded={false}>
      <div className="space-y-4 border-b border-slate-100 p-4 sm:p-5">
        <div className="flex flex-wrap gap-2">
          {[{key:'all',label:'الكل',count:programmeRows.length},...(canRequest?[{key:'available',label:'متاح للطلب',count:available}]:[]),{key:'active',label:'طلبات قائمة',count:active},{key:'completed',label:'تم الاختبار',count:completedCount}].map(item=><button type="button" key={item.key} aria-pressed={filter===item.key} onClick={()=>setFilter(item.key)} className={`flex min-h-10 items-center gap-2 rounded-xl border px-3 py-2 text-xs font-bold transition ${filter===item.key?'border-primary-600 bg-primary-50 text-primary-800':'border-slate-200 text-slate-500 hover:bg-slate-50'}`}>{item.label}<span className="numeric rounded-md bg-white/70 px-1.5 py-0.5">{item.count}</span></button>)}
        </div>
        <div className="sm:max-w-sm"><Input label="بحث في المقررات" placeholder="حزب، جزء، أو مجمّعة…" value={search} onChange={event=>setSearch(event.target.value)}/></div>
      </div>
      <div className="table-wrap border-0 shadow-none">
        <table className="table min-w-[680px]">
          <thead className="bg-slate-50"><tr><th>المقرر</th><th>الحالة</th><th>العلامة / 100</th><th>التاريخ</th><th>الممتحن</th>{(canRequest||canEditMilestones)&&<th className="text-end">الإجراءات</th>}</tr></thead>
          <tbody>
            {visibleRows.map(row=>{
              const record=row.record;
              const grouped=(row.related?.sections?.length??0)>1;
              const score=record?record.score:row.section?.score??(grouped&&!row.stage?null:row.related?.score);
              const completed=row.related?.status==='COMPLETED'||row.related?.status==='ABSENT'||(!row.related&&record?.status==='COMPLETED');
              const status=row.passed?'مجتاز':completed?'لم يجتز':row.pending?'مجدول':row.requested?'بانتظار المراجعة':row.unlocked?'متاح للطلب':'بانتظار المتطلبات';
              return <tr key={row.key} className={canSubmit(row)?'bg-emerald-50/40':'hover:bg-slate-50/60'}>
                <td className="min-w-48"><span className="mb-1 block text-[10px] font-semibold text-slate-400">{row.stage?'مجمّعة':row.kind==='HIZB'?'حزب':'جزء'}</span><span className="font-bold text-slate-800">{row.label}</span></td>
                <td><Badge className={row.passed?'bg-emerald-100 text-emerald-800':completed?'bg-red-50 text-red-700':row.pending||row.requested?'bg-blue-50 text-blue-700':row.unlocked?'bg-amber-50 text-amber-800':'bg-slate-100 text-slate-500'}>{status}</Badge></td>
                <td className="numeric font-bold">{score??'—'}</td>
                <td className="numeric whitespace-nowrap text-xs text-slate-500">{record?.examDate?formatDateShort(record.examDate):row.related?.scheduledAt&&row.related.status!=='CANCELLED'?formatDateShort(row.related.scheduledAt):record?.requestedAt?formatDateShort(record.requestedAt):'—'}</td>
                <td className="text-xs text-slate-500">{record?.examinerName||row.related?.examiner?.fullName||row.related?.gradedBy?.fullName||'—'}</td>
                {(canRequest||canEditMilestones)&&<td><div className="flex flex-wrap justify-end gap-2">
                  {canSubmit(row)&&<Button size="sm" loading={submitSectionRequest.isPending} onClick={()=>submitSectionRequest.mutate(row.stage?.code||row.section!.id)}>طلب اختبار</Button>}
                  {canEditMilestones&&<Button size="sm" variant="secondary" onClick={()=>{setEditing(row.key);setUseBreakdown(row.related?.grading?.tajweed!=null);setGradingDraft({mistakes:row.related?.grading?.mistakes??row.related?.mistakes??0,alerts:row.related?.grading?.alerts??0,tajweed:row.related?.grading?.tajweed??10});setDraft({status:record?.status??(row.pending?'SCHEDULED':completed?'COMPLETED':row.requested?'REQUESTED':'NOT_REQUESTED'),score:score==null?'':String(score),requestedAt:(record?.requestedAt??'').slice(0,10),examDate:(record?.examDate??row.related?.scheduledAt??'').slice(0,10),examinerName:record?.examinerName??row.related?.examiner?.fullName??''});}}>تعديل</Button>}
                </div></td>}
              </tr>;
            })}
          </tbody>
        </table>
      </div>
      {!visibleRows.length&&<EmptyState title={filter==='available'?'لا توجد اختبارات متاحة للطلب حاليًا':'لا توجد مقررات مطابقة'} message={filter==='available'?'تظهر الاختبارات هنا بعد اجتياز المتطلبات السابقة.':'جرّب تغيير البحث أو التصفية.'}/>}
    </Card>
    {editingRow&&<Modal open title={`تعديل سجل ${editingRow.label}`} onClose={()=>{if(!saveRecord.isPending)setEditing(null);}} size="md">
      <form className="space-y-4" onSubmit={event=>{event.preventDefault();if(validScore)saveRecord.mutate(editingRow.stage?.code||editingRow.section?.id||editingRow.record?.sectionId||editingRow.key);}}>
        <Select label="حالة الاختبار" value={draft.status} onChange={event=>setDraft({...draft,status:event.target.value})}><option value="NOT_REQUESTED">لم يُطلب اختبار</option><option value="REQUESTED">طُلب اختبار</option><option value="SCHEDULED">مجدول / قيد الاختبار</option><option value="COMPLETED">تم الاختبار</option></Select>
        {draft.status==='COMPLETED'&&<div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
          <Select label="طريقة حساب العلامة" value={useBreakdown?'calculated':'manual'} onChange={event=>setUseBreakdown(event.target.value==='calculated')}><option value="calculated">الأخطاء والتنبيهات والأحكام</option><option value="manual">علامة سابقة بدون تفاصيل</option></Select>
          <div className="grid gap-3 sm:grid-cols-3">{([{key:'mistakes',label:'عدد الأخطاء',max:500,step:1},{key:'alerts',label:'عدد التنبيهات',max:500,step:1},{key:'tajweed',label:'الأحكام من 10',max:10,step:0.25}] as const).map(field=><Input key={field.key} label={field.label} type="number" min={0} max={field.max} step={field.step} required={useBreakdown} value={useBreakdown?gradingDraft[field.key]:''} placeholder="غير مسجّل" onChange={event=>{setUseBreakdown(true);setGradingDraft({...gradingDraft,[field.key]:event.target.value===''?NaN:Number(event.target.value)});}}/>)}</div>
          {useBreakdown&&<p className="text-sm font-bold text-primary-800">{calculated?`العلامة: ${calculated.score} / 100 · التسميع: ${calculated.recitation} / 90 · الأحكام: ${calculated.tajweed} / 10`:gradingSettings.isError?'تعذر تحميل معدّل الخصم؛ أعد فتح التعديل وحاول مجددًا.':'جارٍ تحميل معدّل الخصم، أو أكمل قيم الرصد.'}</p>}
        </div>}
        <div className="grid gap-4 sm:grid-cols-2">
          <Input label="العلامة من 100" type="number" min={0} max={100} step="0.01" readOnly={useBreakdown&&draft.status==='COMPLETED'} value={useBreakdown&&draft.status==='COMPLETED'?calculated?.score??'':draft.score} onChange={event=>setDraft({...draft,score:event.target.value})}/>
          <Input label="اسم الممتحن" maxLength={120} value={draft.examinerName} onChange={event=>setDraft({...draft,examinerName:event.target.value})}/>
          <Input label="تاريخ الطلب" type="date" value={draft.requestedAt} onChange={event=>setDraft({...draft,requestedAt:event.target.value})}/>
          <Input label="تاريخ الاختبار" type="date" value={draft.examDate} onChange={event=>setDraft({...draft,examDate:event.target.value})}/>
        </div>
        <div className="flex justify-end gap-2 border-t border-slate-100 pt-4"><Button type="button" variant="secondary" disabled={saveRecord.isPending} onClick={()=>setEditing(null)}>إلغاء</Button><Button type="submit" loading={saveRecord.isPending} disabled={!validScore}>حفظ التعديل</Button></div>
      </form>
    </Modal>}
  </>;
}
