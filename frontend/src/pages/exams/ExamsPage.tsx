import { useState } from 'react';
import NotificationRecord from '@/components/NotificationRecord';
import { canOpenPath } from '@/config/navigation';
import { Link, useLocation } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { api, apiError } from '@/lib/api';
import { useAuthStore } from '@/store/auth';
import { useDebounce } from '@/hooks/useDebounce';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorState,
  Input,
  LoadingState,
  Modal,
  PageHeader,
  Pagination,
  Select,
  StatCard,
  Tabs,
  Textarea,
  useConfirm,
} from '@/components/ui';
import { IconAward, IconCalendar, IconCheck, IconClock, IconPlus, IconX } from '@/components/ui/Icons';
import {
  EVALUATION_COLORS,
  EVALUATION_LABELS,
  EXAM_REQUEST_STATUS_COLORS,
  EXAM_REQUEST_STATUS_LABELS,
  EXAM_STATUS_COLORS,
  EXAM_STATUS_LABELS,
  describeExamSections,
  scoreEvaluation,
} from '@/lib/labels';
import { formatDateShort, formatDateTime, toInputDateTime } from '@/lib/format';
import type { Exam, ExamEligibility, ExamRequest, PaginatedResponse, Student } from '@/types';
import { ExamProgressionTable } from './ExamProgressionTable';

interface ExamStats {
  pendingRequests: number;
  scheduled: number;
  completed: number;
  passed: number;
  failed: number;
  passRate: number;
}

interface Examiner {
  id: string;
  fullName: string;
}

function ExamStudentName({ student }: { student: { id: string; fullName: string } }) {
  const role = useAuthStore(state => state.user?.role);
  const path = `/students/${student.id}`;
  return role && canOpenPath(role, path)
    ? <Link to={path} className="font-bold text-slate-800 hover:text-primary-700">{student.fullName}</Link>
    : <span className="font-bold text-slate-800">{student.fullName}</span>;
}

/** Show the exact sections selected in a request, especially combined requests. */
function describeRequest(r: ExamRequest): string {
  const parts: string[] = [];
  if (r.requestedHizb != null) parts.push(`حزب ${r.requestedHizb}`);
  if (r.requestedJuz != null) parts.push(`جزء ${r.requestedJuz}`);
  if (r.requestedCombined != null) {
    const stage = r.note?.match(/نوع الاختبار: مجتمعة \d+ (داخلي|خارجي)/)?.[1];
    parts.push(`مجتمعة ${r.requestedCombined}${stage ? ` ${stage}` : ''}`);
  }
  if (parts.length) return parts.join(' + ');

  const selectedSections = r.sections?.map((entry) => entry.section.name).filter(Boolean) ?? [];
  if (selectedSections.length > 1) {
    return `اختبار مجمّع: ${selectedSections.join('، ')}`;
  }
  if (selectedSections.length === 1) return selectedSections[0];
  return describeExamSections(r.section, r.sections);
}

// ============================================================================
// PAGE
// ============================================================================

export default function ExamsPage() {
  const location = useLocation();
  const requestStudent = (location.state as { requestStudent?: Student } | null)?.requestStudent ?? null;
  const user = useAuthStore((s) => s.user)!;
  const canManage = user.role === 'ADMIN' || user.role === 'EXAM_COMMITTEE';
  const canRequest = ['ADMIN', 'SUPERVISOR', 'TEACHER'].includes(user.role);

  const [tab, setTab] = useState<'requests' | 'scheduled' | 'history' | 'progression'>('requests');
  const [creating, setCreating] = useState(!!requestStudent);
  const [progressSearch, setProgressSearch] = useState('');
  const debouncedProgressSearch = useDebounce(progressSearch);
  const [progressStudent, setProgressStudent] = useState<Student | null>(null);
  const progressStudents = useQuery({
    queryKey: ['exams', 'progress-students', debouncedProgressSearch],
    enabled: tab === 'progression' && debouncedProgressSearch.trim().length > 0 && !progressStudent,
    queryFn: async () => (await api.get<PaginatedResponse<Student>>('/students', { params: { search: debouncedProgressSearch, limit: 8 } })).data,
  });
  const progressEligibility = useQuery({
    queryKey: ['exams', 'eligibility', progressStudent?.id],
    enabled: tab === 'progression' && !!progressStudent,
    queryFn: async () => (await api.get<ExamEligibility>(`/exams/eligibility/${progressStudent!.id}`)).data,
  });
  const progressExams = useQuery({
    queryKey: ['exams', 'progression-history', progressStudent?.id],
    enabled: tab === 'progression' && !!progressStudent,
    queryFn: async () => (await api.get<PaginatedResponse<Exam>>('/exams', { params: { studentId: progressStudent!.id, limit: 100 } })).data,
  });

  const stats = useQuery({
    queryKey: ['exams', 'stats'],
    queryFn: async () => (await api.get<ExamStats>('/exams/stats')).data,
  });

  return (
    <>
      <PageHeader
        title="الاختبارات"
        subtitle={canManage ? 'جدولة الاختبارات ورصد نتائج الطلاب' : 'متابعة طلبات اختبار الطلاب ونتائجهم'}
        action={
          canRequest && (
            <Button icon={<IconPlus size={16} />} onClick={() => setCreating(true)}>
              طلب اختبار
            </Button>
          )
        }
      />

      <NotificationRecord />
      <div className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="طلبات بالانتظار" value={stats.data?.pendingRequests ?? 0} icon={<IconClock size={20} />} tone="amber" />
        <StatCard label="اختبارات مجدولة" value={stats.data?.scheduled ?? 0} icon={<IconCalendar size={20} />} tone="sky" />
        <StatCard label="اختبارات مكتملة" value={stats.data?.completed ?? 0} icon={<IconCheck size={20} />} tone="primary" />
        <StatCard label="نسبة النجاح" value={`${stats.data?.passRate ?? 0}%`} icon={<IconAward size={20} />} tone="emerald" />
      </div>

      <Tabs
        tabs={[
          { key: 'requests', label: 'طلبات الاختبار', badge: stats.data?.pendingRequests },
          { key: 'scheduled', label: 'الاختبارات المجدولة', badge: stats.data?.scheduled },
          { key: 'history', label: 'سجل الاختبارات' },
          { key: 'progression', label: 'تسلسل الأحزاب والأجزاء' },
        ]}
        active={tab}
        onChange={(key) => setTab(key as typeof tab)}
      />

      {tab === 'requests' && <RequestsTab canManage={canManage} />}
      {tab === 'scheduled' && <ExamsTab mode="scheduled" canManage={canManage} />}
      {tab === 'history' && <ExamsTab mode="history" canManage={canManage} />}
      {tab === 'progression' && (
        <div className="mt-5 space-y-4">
          <Card title="متابعة تسلسل الاختبارات">
            {progressStudent ? (
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="text-sm font-semibold">{progressStudent.fullName} <span className="numeric text-slate-400">{progressStudent.code}</span></div>
                <Button variant="secondary" size="sm" onClick={() => setProgressStudent(null)}>اختيار طالب آخر</Button>
              </div>
            ) : (
              <div>
                <Input label="ابحث عن طالب" placeholder="الاسم أو رقم الطالب" value={progressSearch} onChange={(e) => setProgressSearch(e.target.value)} />
                {progressStudents.data?.data.length ? (
                  <ul className="mt-2 divide-y divide-slate-100 rounded-xl border border-slate-100">
                    {progressStudents.data.data.map((s) => <li key={s.id}><button className="w-full px-3 py-2 text-start text-sm hover:bg-slate-50" onClick={() => setProgressStudent(s)}>{s.fullName} <span className="numeric text-xs text-slate-400">{s.code}</span></button></li>)}
                  </ul>
                ) : progressSearch.trim() && !progressStudents.isLoading ? <p className="mt-2 text-xs text-slate-400">لا توجد نتائج</p> : null}
              </div>
            )}
          </Card>
          {progressStudent && <ExamProgressionTable studentId={progressStudent.id} canEditMilestones={user.role === 'ADMIN'} eligibility={progressEligibility.data} exams={progressExams.data?.data ?? []} loading={progressEligibility.isLoading || progressExams.isLoading} />}
        </div>
      )}

      {creating && <CreateRequestModal initialStudent={requestStudent} onClose={() => setCreating(false)} />}
    </>
  );
}

// ============================================================================
// REQUESTS TAB
// ============================================================================

function RequestsTab({ canManage }: { canManage: boolean }) {
  const queryClient = useQueryClient();
  const confirm = useConfirm();
  const [status, setStatus] = useState('PENDING');
  const [page, setPage] = useState(1);
  const [scheduling, setScheduling] = useState<ExamRequest | null>(null);
  const [rejecting, setRejecting] = useState<ExamRequest | null>(null);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['exams', 'requests', { status, page }],
    queryFn: async () =>
      (
        await api.get<PaginatedResponse<ExamRequest>>('/exams/requests', {
          params: { page, limit: 20, status: status || undefined },
        })
      ).data,
  });

  const cancel = useMutation({
    mutationFn: (id: string) => api.patch(`/exams/requests/${id}/cancel`),
    onSuccess: () => {
      toast.success('تم إلغاء الطلب');
      queryClient.invalidateQueries({ queryKey: ['exams'] });
    },
    onError: (error) => toast.error(apiError(error)),
  });

  const onCancel = async (r: ExamRequest) => {
    const ok = await confirm({
      title: 'إلغاء طلب الاختبار',
      message: `هل تريد إلغاء طلب اختبار ${r.student.fullName}؟`,
      confirmLabel: 'إلغاء الطلب',
    });
    if (ok) cancel.mutate(r.id);
  };

  return (
    <>
      <Card className="mb-5">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Select
            label="الحالة"
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setPage(1);
            }}
          >
            <option value="">كل الحالات</option>
            {Object.entries(EXAM_REQUEST_STATUS_LABELS).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </Select>
        </div>
      </Card>

      <Card padded={false}>
        {isLoading ? (
          <LoadingState />
        ) : isError ? (
          <ErrorState message="تعذر تحميل طلبات الاختبار" onRetry={() => refetch()} />
        ) : !data?.data.length ? (
          <EmptyState
            title="لا توجد طلبات اختبار"
            message="لا توجد طلبات مطابقة للتصفية المحددة."
            icon={<IconAward size={24} />}
          />
        ) : (
          <>
            <div className="table-wrap border-0 shadow-none">
              <table className="table">
                <thead>
                  <tr>
                    <th>الطالب</th>
                    <th>المطلوب</th>
                    <th>المعلم</th>
                    <th>تاريخ الطلب</th>
                    <th>الحالة</th>
                    <th className="text-center">إجراءات</th>
                  </tr>
                </thead>
                <tbody>
                  {data.data.map((r) => (
                    <tr key={r.id}>
                      <td>
                        <ExamStudentName student={r.student} />
                        <span className="block text-[11px] text-slate-400">{r.student.circle?.name ?? '—'}</span>
                      </td>
                      <td className="text-sm">
                        {describeRequest(r)}
                        {r.note && <span className="block text-[11px] text-slate-400">{r.note}</span>}
                      </td>
                      <td className="text-sm text-slate-600">{r.teacher?.user.fullName ?? '—'}</td>
                      <td className="numeric text-sm text-slate-500">{formatDateShort(r.createdAt)}</td>
                      <td>
                        <Badge className={EXAM_REQUEST_STATUS_COLORS[r.status]}>{EXAM_REQUEST_STATUS_LABELS[r.status]}</Badge>
                        {r.status === 'REJECTED' && r.reviewNote && (
                          <span className="block text-[11px] text-slate-400">{r.reviewNote}</span>
                        )}
                      </td>
                      <td>
                        {r.status === 'PENDING' ? (
                          <div className="flex justify-center gap-1.5">
                            {canManage && (
                              <>
                                <Button size="sm" variant="success" icon={<IconCalendar size={14} />} onClick={() => setScheduling(r)}>
                                  جدولة
                                </Button>
                                <Button size="sm" variant="danger" icon={<IconX size={14} />} onClick={() => setRejecting(r)}>
                                  رفض
                                </Button>
                              </>
                            )}
                            {!canManage && (
                              <Button size="sm" variant="secondary" onClick={() => onCancel(r)}>
                                إلغاء الطلب
                              </Button>
                            )}
                          </div>
                        ) : (
                          <span className="block text-center text-slate-300">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination page={page} totalPages={data.meta.totalPages} total={data.meta.total} onChange={setPage} />
          </>
        )}
      </Card>

      {scheduling && <ScheduleModal request={scheduling} onClose={() => setScheduling(null)} />}
      {rejecting && <RejectModal request={rejecting} onClose={() => setRejecting(null)} />}
    </>
  );
}

// ============================================================================
// EXAMS TAB (scheduled + history)
// ============================================================================

function ExamsTab({ mode, canManage }: { mode: 'scheduled' | 'history'; canManage: boolean }) {
  const queryClient = useQueryClient();
  const confirm = useConfirm();
  const [historyStatus, setHistoryStatus] = useState('COMPLETED');
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search);
  const [page, setPage] = useState(1);
  const [grading, setGrading] = useState<Exam | null>(null);
  const [editing, setEditing] = useState<Exam | null>(null);

  const status = mode === 'scheduled' ? 'SCHEDULED' : historyStatus;

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['exams', 'list', { status, page, search: debouncedSearch }],
    queryFn: async () =>
      (
        await api.get<PaginatedResponse<Exam>>('/exams', {
          params: { page, limit: 20, status: status || undefined, search: debouncedSearch || undefined },
        })
      ).data,
  });

  const absent = useMutation({
    mutationFn: (id: string) => api.patch(`/exams/${id}/absent`),
    onSuccess: () => {
      toast.success('تم تسجيل الغياب');
      queryClient.invalidateQueries({ queryKey: ['exams'] });
    },
    onError: (error) => toast.error(apiError(error)),
  });

  const onAbsent = async (exam: Exam) => {
    const ok = await confirm({
      title: 'تسجيل غياب',
      message: `تسجيل غياب ${exam.student.fullName} عن الاختبار؟`,
      confirmLabel: 'تسجيل الغياب',
    });
    if (ok) absent.mutate(exam.id);
  };

  return (
    <>
      <Card className="mb-5">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Input
            label="بحث"
            placeholder="اسم الطالب أو رقمه"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
          />
          {mode === 'history' && (
            <Select
              label="الحالة"
              value={historyStatus}
              onChange={(e) => {
                setHistoryStatus(e.target.value);
                setPage(1);
              }}
            >
              <option value="COMPLETED">مكتمل</option>
              <option value="ABSENT">غائب</option>
              <option value="CANCELLED">ملغى</option>
            </Select>
          )}
        </div>
      </Card>

      <Card padded={false}>
        {isLoading ? (
          <LoadingState />
        ) : isError ? (
          <ErrorState message="تعذر تحميل الاختبارات" onRetry={() => refetch()} />
        ) : !data?.data.length ? (
          <EmptyState
            title={mode === 'scheduled' ? 'لا توجد اختبارات مجدولة' : 'لا توجد اختبارات في السجل'}
            message="لا توجد اختبارات مطابقة للتصفية المحددة."
            icon={<IconAward size={24} />}
          />
        ) : (
          <>
            <div className="table-wrap border-0 shadow-none">
              <table className="table">
                <thead>
                  <tr>
                    <th>الطالب</th>
                    <th>المقرر</th>
                    <th>الموعد</th>
                    <th>الممتحن</th>
                    <th>{mode === 'scheduled' ? 'المكان' : 'النتيجة'}</th>
                    <th>الحالة</th>
                    {mode === 'scheduled' && canManage && <th className="text-center">إجراءات</th>}
                  </tr>
                </thead>
                <tbody>
                  {data.data.map((exam) => (
                    <tr key={exam.id}>
                      <td>
                        <ExamStudentName student={exam.student} />
                        <span className="block text-[11px] text-slate-400">{exam.student.circle?.name ?? '—'}</span>
                      </td>
                      <td className="text-sm">{describeExamSections(exam.section, exam.sections)}</td>
                      <td className="numeric text-sm text-slate-600">{formatDateTime(exam.scheduledAt)}</td>
                      <td className="text-sm text-slate-600">{exam.examiner?.fullName ?? '—'}</td>
                      <td className="text-sm">
                        {mode === 'scheduled' ? (
                          exam.location || '—'
                        ) : exam.score != null ? (
                          <>
                            <span className="numeric font-bold">{exam.score}</span>
                            <span className="text-slate-400"> / 100</span>
                            {exam.evaluation && (
                              <Badge className={`ms-2 ${EVALUATION_COLORS[exam.evaluation]}`}>
                                {EVALUATION_LABELS[exam.evaluation]}
                              </Badge>
                            )}
                          </>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td>
                        <Badge className={EXAM_STATUS_COLORS[exam.status]}>{EXAM_STATUS_LABELS[exam.status]}</Badge>
                        {exam.result && (
                          <span className={`block text-[11px] font-bold ${exam.result === 'PASSED' ? 'text-emerald-600' : 'text-red-600'}`}>
                            {exam.result === 'PASSED' ? 'ناجح' : 'راسب'}
                          </span>
                        )}
                      </td>
                      {mode === 'scheduled' && canManage && (
                        <td>
                          <div className="flex justify-center gap-1.5">
                            <Button size="sm" variant="success" icon={<IconCheck size={14} />} onClick={() => setGrading(exam)}>
                              رصد النتيجة
                            </Button>
                            <Button size="sm" variant="secondary" onClick={() => setEditing(exam)}>
                              تعديل
                            </Button>
                            <Button size="sm" variant="danger" onClick={() => onAbsent(exam)}>
                              غياب
                            </Button>
                          </div>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination page={page} totalPages={data.meta.totalPages} total={data.meta.total} onChange={setPage} />
          </>
        )}
      </Card>

      {grading && <ResultModal exam={grading} onClose={() => setGrading(null)} />}
      {editing && <EditExamModal exam={editing} onClose={() => setEditing(null)} />}
    </>
  );
}

// ============================================================================
// MODALS
// ============================================================================

function useExaminers() {
  return useQuery({
    queryKey: ['exams', 'examiners'],
    queryFn: async () => (await api.get<Examiner[]>('/exams/examiners')).data,
  });
}

function ScheduleModal({ request, onClose }: { request: ExamRequest; onClose: () => void }) {
  const queryClient = useQueryClient();
  const examiners = useExaminers();
  const [scheduledAt, setScheduledAt] = useState('');
  const [examinerId, setExaminerId] = useState('');
  const [location, setLocation] = useState('');
  const [notes, setNotes] = useState('');
  const [committeeNumber, setCommitteeNumber] = useState('');
  const [committees] = useState<Array<{id:string;number:string;date:string;location:string;members:string;weekday:string}>>(() => {
    try { const value = JSON.parse(localStorage.getItem('indibat.committees.v1') || '[]'); return Array.isArray(value) ? value : []; } catch { return []; }
  });
  const selectedCommittee = committees.find(item => item.number === committeeNumber);

  const mutation = useMutation({
    mutationFn: () =>
      api.post(`/exams/requests/${request.id}/schedule`, {
        scheduledAt: new Date(scheduledAt).toISOString(),
        examinerId: examinerId || undefined,
        location: location || selectedCommittee?.location || undefined,
        notes: [selectedCommittee ? `اللجنة رقم ${selectedCommittee.number} — ${selectedCommittee.date} (${selectedCommittee.weekday}) — ${selectedCommittee.location} — الأعضاء: ${selectedCommittee.members}` : '', notes.trim()].filter(Boolean).join(' | ') || undefined,
      }),
    onSuccess: () => {
      toast.success('تمت جدولة الاختبار');
      queryClient.invalidateQueries({ queryKey: ['exams'] });
      onClose();
    },
    onError: (error) => toast.error(apiError(error)),
  });

  return (
    <Modal
      open
      onClose={onClose}
      title={`جدولة اختبار ${request.student.fullName}`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            إلغاء
          </Button>
          <Button loading={mutation.isPending} disabled={!scheduledAt} onClick={() => mutation.mutate()}>
            جدولة
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <p className="text-sm text-slate-500">المطلوب: {describeRequest(request)}</p>
        <Input label="موعد الاختبار" type="datetime-local" required value={scheduledAt} onChange={(e) => setScheduledAt(e.target.value)} />
        {committees.length > 0 && <Select label="اللجنة" value={committeeNumber} onChange={(e) => setCommitteeNumber(e.target.value)} required>
          <option value="">اختر اللجنة</option>
          {committees.map((committee) => <option key={committee.id} value={committee.number}>لجنة {committee.number} — {committee.date} — {committee.location || 'دون مكان'}</option>)}
        </Select>}
        {selectedCommittee && <p className="rounded-lg bg-slate-50 p-3 text-xs leading-6 text-slate-600">اليوم: {selectedCommittee.weekday} · المكان: {selectedCommittee.location || '—'} · الأعضاء: {selectedCommittee.members || '—'}</p>}
        <Select label="الممتحن" value={examinerId} onChange={(e) => setExaminerId(e.target.value)}>
          <option value="">غير محدد</option>
          {examiners.data?.map((u) => (
            <option key={u.id} value={u.id}>
              {u.fullName}
            </option>
          ))}
        </Select>
        <Input label="المكان" placeholder="قاعة الاختبارات" value={location} onChange={(e) => setLocation(e.target.value)} />
        <Textarea label="ملاحظات" value={notes} onChange={(e) => setNotes(e.target.value)} />
      </div>
    </Modal>
  );
}

function RejectModal({ request, onClose }: { request: ExamRequest; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [reviewNote, setReviewNote] = useState('');

  const mutation = useMutation({
    mutationFn: () => api.patch(`/exams/requests/${request.id}/reject`, { reviewNote: reviewNote || undefined }),
    onSuccess: () => {
      toast.success('تم رفض الطلب');
      queryClient.invalidateQueries({ queryKey: ['exams'] });
      onClose();
    },
    onError: (error) => toast.error(apiError(error)),
  });

  return (
    <Modal
      open
      onClose={onClose}
      title={`رفض طلب اختبار ${request.student.fullName}`}
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            إلغاء
          </Button>
          <Button variant="danger" loading={mutation.isPending} onClick={() => mutation.mutate()}>
            رفض الطلب
          </Button>
        </>
      }
    >
      <Textarea label="سبب الرفض" value={reviewNote} onChange={(e) => setReviewNote(e.target.value)} />
    </Modal>
  );
}

function ResultModal({ exam, onClose }: { exam: Exam; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [score, setScore] = useState('');
  const [sectionScores, setSectionScores] = useState<Record<string, string>>({});
  const [mistakes, setMistakes] = useState('');
  const [notes, setNotes] = useState('');
  const sections = exam.sections?.length ? exam.sections.map((entry) => entry.section) : [exam.section];
  const grouped = sections.length > 1;
  const values = sections.map((section) => {
    const raw = sectionScores[section.id] ?? '';
    const value = raw === '' ? null : Number(raw);
    return { section, raw, value, valid: value !== null && Number.isInteger(value) && value >= 0 && value <= 100 };
  });
  const numeric = score === '' ? null : Number(score);
  const overallScore = grouped
    ? values.every((entry) => entry.valid)
      ? Math.round(values.reduce((sum, entry) => sum + (entry.value ?? 0), 0) / values.length)
      : null
    : numeric;
  const valid = grouped
    ? values.every((entry) => entry.valid)
    : numeric !== null && Number.isInteger(numeric) && numeric >= 0 && numeric <= 100;
  const preview = overallScore !== null && Number.isInteger(overallScore) ? scoreEvaluation(overallScore) : null;

  const mutation = useMutation({
    mutationFn: () =>
      api.patch(`/exams/${exam.id}/result`, {
        score: overallScore,
        sectionScores: grouped ? values.map((entry) => ({ sectionId: entry.section.id, score: entry.value })) : undefined,
        mistakes: mistakes === '' ? undefined : Number(mistakes),
        notes: notes || undefined,
      }),
    onSuccess: () => {
      toast.success('تم رصد النتائج المستقلة لكل مقرر');
      queryClient.invalidateQueries({ queryKey: ['exams'] });
      queryClient.invalidateQueries({ queryKey: ['exams', 'milestones', exam.student.id] });
      queryClient.invalidateQueries({ queryKey: ['exams', 'eligibility', exam.student.id] });
      onClose();
    },
    onError: (error) => toast.error(apiError(error)),
  });

  return (
    <Modal
      open
      onClose={onClose}
      title={`نتيجة ${exam.student.fullName}`}
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>إلغاء</Button>
          <Button loading={mutation.isPending} disabled={!valid} onClick={() => mutation.mutate()}>حفظ النتيجة</Button>
        </>
      }
    >
      <div className="space-y-3">
        {grouped ? (
          <>
            <p className="text-sm text-slate-500">أدخل علامة مستقلة لكل حزب أو جزء ضمن هذا الاختبار المجمع.</p>
            {values.map(({ section, raw }) => (
              <Input
                key={section.id}
                label={section.name}
                type="number"
                min={0}
                max={100}
                required
                value={raw}
                onChange={(e) => setSectionScores((current) => ({ ...current, [section.id]: e.target.value }))}
              />
            ))}
            {overallScore !== null && <p className="text-xs text-slate-500">المتوسط العام: {overallScore} من 100</p>}
          </>
        ) : (
          <Input label="الدرجة من 100" type="number" min={0} max={100} required value={score} onChange={(e) => setScore(e.target.value)} />
        )}
        {preview && <p className="text-sm">التقدير العام: <Badge className={EVALUATION_COLORS[preview]}>{EVALUATION_LABELS[preview]}</Badge></p>}
        <Input label="عدد الأخطاء (اختياري)" type="number" min={0} value={mistakes} onChange={(e) => setMistakes(e.target.value)} />
        <Textarea label="ملاحظات" value={notes} onChange={(e) => setNotes(e.target.value)} />
      </div>
    </Modal>
  );
}

function EditExamModal({ exam, onClose }: { exam: Exam; onClose: () => void }) {
  const queryClient = useQueryClient();
  const examiners = useExaminers();
  const [scheduledAt, setScheduledAt] = useState(toInputDateTime(exam.scheduledAt));
  const [examinerId, setExaminerId] = useState(exam.examiner?.id ?? '');
  const [location, setLocation] = useState(exam.location ?? '');

  const mutation = useMutation({
    mutationFn: () =>
      api.patch(`/exams/${exam.id}`, {
        scheduledAt: scheduledAt ? new Date(scheduledAt).toISOString() : undefined,
        examinerId: examinerId || undefined,
        location: location || undefined,
      }),
    onSuccess: () => {
      toast.success('تم تعديل الاختبار');
      queryClient.invalidateQueries({ queryKey: ['exams'] });
      onClose();
    },
    onError: (error) => toast.error(apiError(error)),
  });

  return (
    <Modal
      open
      onClose={onClose}
      title={`تعديل اختبار ${exam.student.fullName}`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            إلغاء
          </Button>
          <Button loading={mutation.isPending} disabled={!scheduledAt} onClick={() => mutation.mutate()}>
            حفظ
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <Input label="موعد الاختبار" type="datetime-local" value={scheduledAt} onChange={(e) => setScheduledAt(e.target.value)} />
        <Select label="الممتحن" value={examinerId} onChange={(e) => setExaminerId(e.target.value)}>
          <option value="">غير محدد</option>
          {examiners.data?.map((u) => (
            <option key={u.id} value={u.id}>
              {u.fullName}
            </option>
          ))}
        </Select>
        <Input label="المكان" value={location} onChange={(e) => setLocation(e.target.value)} />
      </div>
    </Modal>
  );
}

function CreateRequestModal({ initialStudent, onClose }: { initialStudent?: Student | null; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const debounced = useDebounce(search);
  const [student, setStudent] = useState<Student | null>(initialStudent ?? null);
  const [sectionIds, setSectionIds] = useState<string[]>([]);
  const [combinedSize, setCombinedSize] = useState('');
  const [combinedStage, setCombinedStage] = useState<'داخلي' | 'خارجي'>('داخلي');
  const [note, setNote] = useState('');

  const students = useQuery({
    queryKey: ['exams', 'student-search', debounced],
    enabled: !student && debounced.trim().length > 0,
    queryFn: async () =>
      (await api.get<PaginatedResponse<Student>>('/students', { params: { search: debounced, limit: 8 } })).data,
  });
  const eligibility = useQuery({
    queryKey: ['exams', 'eligibility', student?.id],
    enabled: !!student,
    queryFn: async () => (await api.get<ExamEligibility>(`/exams/eligibility/${student!.id}`)).data,
  });
  const progression = eligibility.data?.progression ?? [];
  const firstAvailable = progression.findIndex((item) => item.eligible);
  const remainingProgression = firstAvailable < 0 ? [] : progression.slice(firstAvailable);
  const nextBlockEnd = remainingProgression.findIndex((item) => item.isPassed || item.hasOpenRequest);
  const selectableBlock = nextBlockEnd < 0 ? remainingProgression : remainingProgression.slice(0, nextBlockEnd);

  const mutation = useMutation({
    mutationFn: () =>
      api.post('/exams/requests', {
        studentId: student!.id,
        sectionIds,
        requestedCombined: combinedSize ? Number(combinedSize) : undefined,
        note: [combinedSize ? `نوع الاختبار: مجتمعة ${combinedSize} ${combinedStage}` : '', note.trim()].filter(Boolean).join(' — ') || undefined,
      }),
    onSuccess: () => {
      toast.success('تم تقديم طلب الاختبار');
      queryClient.invalidateQueries({ queryKey: ['exams'] });
      onClose();
    },
    onError: (error) => toast.error(apiError(error)),
  });

  return (
    <Modal
      open
      onClose={onClose}
      title="طلب اختبار جديد"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>إلغاء</Button>
          <Button loading={mutation.isPending} disabled={!student || !sectionIds.length || eligibility.isLoading} onClick={() => mutation.mutate()}>
            تقديم الطلب ({sectionIds.length})
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        {student ? (
          <div className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2">
            <span className="text-sm font-bold text-slate-800">
              {student.fullName} <span className="numeric text-xs font-normal text-slate-400">{student.code}</span>
            </span>
            <button className="text-xs text-primary-700" onClick={() => { setStudent(null); setSectionIds([]); }}>تغيير</button>
          </div>
        ) : (
          <div>
            <Input label="الطالب" required placeholder="ابحث باسم الطالب أو رقمه" value={search} onChange={(e) => setSearch(e.target.value)} />
            {students.data?.data.length ? (
              <ul className="mt-2 divide-y divide-slate-100 rounded-xl border border-slate-100">
                {students.data.data.map((s) => (
                  <li key={s.id}>
                    <button className="w-full px-3 py-2 text-start text-sm hover:bg-slate-50" onClick={() => setStudent(s)}>
                      {s.fullName} <span className="numeric text-xs text-slate-400">{s.code}</span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : debounced.trim() && !students.isLoading ? <p className="mt-2 text-xs text-slate-400">لا توجد نتائج</p> : null}
          </div>
        )}
        {student && (
          <div>
            <div className="mb-3 grid gap-3 sm:grid-cols-2">
              <Select label="نوع الطلب" value={combinedSize} onChange={(e) => setCombinedSize(e.target.value)}>
                <option value="">حزب / جزء عادي</option>
                <option value="3">مجتمعة 3</option>
                <option value="5">مجتمعة 5</option>
                <option value="10">مجتمعة 10</option>
                <option value="20">مجتمعة 20</option>
                <option value="30">مجتمعة 30</option>
              </Select>
              {combinedSize && <Select label="مرحلة الاختبار" value={combinedStage} onChange={(e) => setCombinedStage(e.target.value as 'داخلي' | 'خارجي')}>
                <option value="داخلي">داخلي</option>
                <option value="خارجي">خارجي</option>
              </Select>}
            </div>
            <p className="mb-2 text-sm font-semibold">اختر الأحزاب والأجزاء التي يشملها الطلب</p>
            {eligibility.isLoading ? <LoadingState rows={3} /> : !selectableBlock.length ? (
              <p className="rounded-lg bg-slate-50 p-3 text-sm text-slate-500">لا توجد مقررات متاحة للطلب حالياً.</p>
            ) : (
              <div className="max-h-64 space-y-1 overflow-y-auto rounded-xl border border-slate-200 p-2">
                {selectableBlock.map((item) => (
                  <label key={item.id} className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-2 text-sm hover:bg-slate-50">
                    <input
                      type="checkbox"
                      checked={sectionIds.includes(item.id)}
                      onChange={(event) => setSectionIds((current) => event.target.checked ? [...current, item.id] : current.filter((id) => id !== item.id))}
                    />
                    <span>{item.name}</span>
                    <span className="mr-auto text-xs text-slate-400">{item.kind === 'HIZB' ? 'حزب' : 'جزء'}</span>
                  </label>
                ))}
              </div>
            )}
            <p className="mt-2 text-xs leading-5 text-slate-400">يُحفظ طلب المجموعة كطلب واحد، وتبقى نتيجة كل حزب أو جزء مسجلة بشكل مستقل. يجب أن تكون المقررات المختارة متتابعة حسب التسلسل.</p>
          </div>
        )}
        <Textarea label="ملاحظات" value={note} onChange={(e) => setNote(e.target.value)} />
      </div>
    </Modal>
  );
}
