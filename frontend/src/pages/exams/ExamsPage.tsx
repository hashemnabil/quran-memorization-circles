import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { api, apiError } from '@/lib/api';
import { useAuthStore } from '@/store/auth';
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
  cx,
  useConfirm,
} from '@/components/ui';
import { IconAward, IconCalendar, IconCheck, IconClipboard, IconX } from '@/components/ui/Icons';
import {
  EVALUATION_COLORS,
  EVALUATION_LABELS,
  EXAM_REQUEST_STATUS_COLORS,
  EXAM_REQUEST_STATUS_LABELS,
  EXAM_STATUS_COLORS,
  EXAM_STATUS_LABELS,
  scoreEvaluation,
} from '@/lib/labels';
import { formatDateTime, timeAgo, toInputDateTime } from '@/lib/format';
import type { Exam, ExamRequest, ExamSection, PaginatedResponse } from '@/types';

export default function ExamsPage() {
  const user = useAuthStore((s) => s.user)!;
  const [tab, setTab] = useState('requests');

  const isCommittee = user.role === 'EXAM_COMMITTEE' || user.role === 'ADMIN';

  const { data: stats } = useQuery({
    queryKey: ['exams', 'stats'],
    queryFn: async () => (await api.get('/exams/stats')).data,
  });

  return (
    <>
      <PageHeader
        title="الاختبارات"
        subtitle={
          isCommittee
            ? 'إدارة قائمة الانتظار وجدولة الاختبارات ورصد النتائج'
            : 'متابعة طلبات الاختبار ونتائج الطلاب'
        }
      />

      {stats && (
        <div className="mb-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
          <StatCard label="قائمة الانتظار" value={stats.pendingRequests} icon={<IconClipboard size={22} />} tone="amber" />
          <StatCard label="مجدولة" value={stats.scheduled} icon={<IconCalendar size={22} />} tone="sky" />
          <StatCard label="مكتملة" value={stats.completed} icon={<IconAward size={22} />} tone="slate" />
          <StatCard label="ناجحون" value={stats.passed} icon={<IconAward size={22} />} tone="emerald" hint={`نسبة النجاح ${stats.passRate}%`} />
          <StatCard label="لم يجتازوا" value={stats.failed} icon={<IconAward size={22} />} tone="red" />
        </div>
      )}

      <Tabs
        tabs={[
          { key: 'requests', label: 'طلبات الاختبار', badge: stats?.pendingRequests },
          { key: 'scheduled', label: 'الاختبارات المجدولة', badge: stats?.scheduled },
          { key: 'results', label: 'النتائج' },
          { key: 'sections', label: 'المقررات' },
        ]}
        active={tab}
        onChange={setTab}
      />

      {tab === 'requests' && <RequestsTab isCommittee={isCommittee} />}
      {tab === 'scheduled' && <ExamsTab status="SCHEDULED" isCommittee={isCommittee} />}
      {tab === 'results' && <ExamsTab status="COMPLETED" isCommittee={isCommittee} />}
      {tab === 'sections' && <SectionsTab />}
    </>
  );
}

// --- requests ---------------------------------------------------------------

function RequestsTab({ isCommittee }: { isCommittee: boolean }) {
  const user = useAuthStore((s) => s.user)!;
  const queryClient = useQueryClient();
  const confirm = useConfirm();

  const [status, setStatus] = useState('PENDING');
  const [page, setPage] = useState(1);
  const [scheduling, setScheduling] = useState<ExamRequest | null>(null);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['exams', 'requests', { status, page }],
    queryFn: async () =>
      (
        await api.get<PaginatedResponse<ExamRequest>>('/exams/requests', {
          params: { page, limit: 20, status: status || undefined },
        })
      ).data,
  });

  const reject = useMutation({
    mutationFn: ({ id, note }: { id: string; note: string }) =>
      api.patch(`/exams/requests/${id}/reject`, { reviewNote: note }),
    onSuccess: () => {
      toast.success('تم رفض الطلب');
      queryClient.invalidateQueries({ queryKey: ['exams'] });
    },
    onError: (error) => toast.error(apiError(error)),
  });

  const cancel = useMutation({
    mutationFn: (id: string) => api.patch(`/exams/requests/${id}/cancel`),
    onSuccess: () => {
      toast.success('تم إلغاء الطلب');
      queryClient.invalidateQueries({ queryKey: ['exams'] });
    },
    onError: (error) => toast.error(apiError(error)),
  });

  return (
    <>
      <Card className="mb-5">
        <Select
          label="الحالة"
          className="max-w-xs"
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
      </Card>

      <Card padded={false}>
        {isLoading ? (
          <LoadingState />
        ) : isError ? (
          <ErrorState message="تعذر تحميل طلبات الاختبار" onRetry={() => refetch()} />
        ) : !data?.data.length ? (
          <EmptyState title="لا توجد طلبات" message="قائمة الانتظار فارغة حالياً." icon={<IconClipboard size={24} />} />
        ) : (
          <>
            <div className="table-wrap border-0 shadow-none">
              <table className="table">
                <thead>
                  <tr>
                    <th>الطالب</th>
                    <th>الحلقة</th>
                    <th>المقرر</th>
                    <th>مقدّم الطلب</th>
                    <th>تاريخ الطلب</th>
                    <th>الحالة</th>
                    <th className="text-center">إجراءات</th>
                  </tr>
                </thead>
                <tbody>
                  {data.data.map((req) => (
                    <tr key={req.id}>
                      <td>
                        <Link to={`/students/${req.student.id}`} className="font-bold text-slate-800 hover:text-primary-700">
                          {req.student.fullName}
                        </Link>
                        <span className="numeric block text-[11px] text-slate-400">{req.student.code}</span>
                      </td>
                      <td className="text-xs text-slate-500">{req.student.circle?.name ?? '—'}</td>
                      <td>
                        <Badge className="bg-gold-100 text-gold-800">{req.section.name}</Badge>
                      </td>
                      <td className="text-xs text-slate-500">{req.teacher.user.fullName}</td>
                      <td className="text-xs text-slate-400">{timeAgo(req.createdAt)}</td>
                      <td>
                        <Badge className={EXAM_REQUEST_STATUS_COLORS[req.status]}>
                          {EXAM_REQUEST_STATUS_LABELS[req.status]}
                        </Badge>
                      </td>
                      <td>
                        <div className="flex items-center justify-center gap-1.5">
                          {req.status === 'PENDING' && isCommittee && (
                            <>
                              <Button size="sm" onClick={() => setScheduling(req)}>
                                جدولة
                              </Button>
                              <Button
                                size="sm"
                                variant="secondary"
                                onClick={async () => {
                                  const ok = await confirm({
                                    title: 'رفض الطلب',
                                    message: `سيتم رفض طلب اختبار "${req.student.fullName}" في ${req.section.name}.`,
                                    confirmLabel: 'رفض',
                                  });
                                  if (ok) reject.mutate({ id: req.id, note: 'الطالب غير جاهز حالياً' });
                                }}
                              >
                                رفض
                              </Button>
                            </>
                          )}
          {/* Only the teacher who raised the request may cancel it — supervisors cannot. */}
                          {req.status === 'PENDING' && !isCommittee && req.teacher.id === user.teacherId && (
                            <Button
                              size="sm"
                              variant="secondary"
                              onClick={async () => {
                                const ok = await confirm({
                                  title: 'إلغاء الطلب',
                                  message: 'سيتم إلغاء طلب الاختبار.',
                                  confirmLabel: 'إلغاء الطلب',
                                });
                                if (ok) cancel.mutate(req.id);
                              }}
                            >
                              إلغاء
                            </Button>
                          )}
                          {req.exam && (
                            <span className="numeric text-xs text-slate-500">
                              {formatDateTime(req.exam.scheduledAt)}
                            </span>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination page={data.meta.page} totalPages={data.meta.totalPages} total={data.meta.total} onChange={setPage} />
          </>
        )}
      </Card>

      {scheduling && <ScheduleModal request={scheduling} onClose={() => setScheduling(null)} />}
    </>
  );
}

function ScheduleModal({ request, onClose }: { request: ExamRequest; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [scheduledAt, setScheduledAt] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 3);
    d.setHours(10, 0, 0, 0);
    return toInputDateTime(d);
  });
  const [examinerId, setExaminerId] = useState('');
  const [location, setLocation] = useState('قاعة الاختبارات');
  const [notes, setNotes] = useState('');

  const { data: examiners } = useQuery({
    queryKey: ['exams', 'examiners'],
    queryFn: async () => (await api.get('/exams/examiners')).data,
  });

  const mutation = useMutation({
    mutationFn: () =>
      api.post(`/exams/requests/${request.id}/schedule`, {
        scheduledAt: new Date(scheduledAt).toISOString(),
        examinerId: examinerId || undefined,
        location: location || undefined,
        notes: notes || undefined,
      }),
    onSuccess: () => {
      toast.success('تم تحديد موعد الاختبار وإشعار المعلم وولي الأمر');
      queryClient.invalidateQueries({ queryKey: ['exams'] });
      onClose();
    },
    onError: (error) => toast.error(apiError(error)),
  });

  return (
    <Modal
      open
      onClose={onClose}
      title="جدولة الاختبار"
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            إلغاء
          </Button>
          <Button onClick={() => mutation.mutate()} loading={mutation.isPending} disabled={!scheduledAt}>
            تأكيد الجدولة
          </Button>
        </>
      }
    >
      <div className="mb-4 rounded-xl bg-slate-50 px-4 py-3 text-xs text-slate-600">
        <p>
          الطالب: <span className="font-bold text-slate-800">{request.student.fullName}</span>
        </p>
        <p className="mt-1">
          المقرر: <span className="font-bold text-slate-800">{request.section.name}</span> — درجة النجاح{' '}
          <span className="numeric font-bold">{request.section.minScore}</span>
        </p>
      </div>
      <Input label="موعد الاختبار" type="datetime-local" required value={scheduledAt} onChange={(e) => setScheduledAt(e.target.value)} />
      <Select label="الممتحن" className="mt-3" value={examinerId} onChange={(e) => setExaminerId(e.target.value)}>
        <option value="">بدون تحديد</option>
        {examiners?.map((e: any) => (
          <option key={e.id} value={e.id}>
            {e.fullName}
          </option>
        ))}
      </Select>
      <Input label="المكان" className="mt-3" value={location} onChange={(e) => setLocation(e.target.value)} />
      <Textarea label="ملاحظات" className="mt-3" value={notes} onChange={(e) => setNotes(e.target.value)} />
    </Modal>
  );
}

// --- exams ------------------------------------------------------------------

function ExamsTab({ status, isCommittee }: { status: string; isCommittee: boolean }) {
  const queryClient = useQueryClient();
  const confirm = useConfirm();
  const [page, setPage] = useState(1);
  const [grading, setGrading] = useState<Exam | null>(null);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['exams', 'list', { status, page }],
    queryFn: async () =>
      (await api.get<PaginatedResponse<Exam>>('/exams', { params: { status, page, limit: 20 } })).data,
  });

  const markAbsent = useMutation({
    mutationFn: (id: string) => api.patch(`/exams/${id}/absent`),
    onSuccess: () => {
      toast.success('تم تسجيل غياب الطالب');
      queryClient.invalidateQueries({ queryKey: ['exams'] });
    },
    onError: (error) => toast.error(apiError(error)),
  });

  return (
    <>
      <Card padded={false}>
        {isLoading ? (
          <LoadingState />
        ) : isError ? (
          <ErrorState message="تعذر تحميل الاختبارات" onRetry={() => refetch()} />
        ) : !data?.data.length ? (
          <EmptyState
            title={status === 'SCHEDULED' ? 'لا توجد اختبارات مجدولة' : 'لا توجد نتائج بعد'}
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
                    <th>الحالة</th>
                    {status === 'COMPLETED' && (
                      <>
                        <th>الدرجة</th>
                        <th>التقدير</th>
                        <th>الأخطاء</th>
                        <th>النتيجة</th>
                      </>
                    )}
                    {status === 'SCHEDULED' && isCommittee && <th className="text-center">إجراءات</th>}
                  </tr>
                </thead>
                <tbody>
                  {data.data.map((exam) => (
                    <tr key={exam.id}>
                      <td>
                        <Link to={`/students/${exam.student.id}`} className="font-bold text-slate-800 hover:text-primary-700">
                          {exam.student.fullName}
                        </Link>
                        <span className="block text-[11px] text-slate-400">{exam.student.circle?.name}</span>
                      </td>
                      <td>
                        <Badge className="bg-gold-100 text-gold-800">{exam.section.name}</Badge>
                      </td>
                      <td className="text-xs text-slate-500">{formatDateTime(exam.scheduledAt)}</td>
                      <td className="text-xs text-slate-500">{exam.examiner?.fullName ?? '—'}</td>
                      <td>
                        <Badge className={EXAM_STATUS_COLORS[exam.status]}>{EXAM_STATUS_LABELS[exam.status]}</Badge>
                      </td>
                      {status === 'COMPLETED' && (
                        <>
                          <td className="numeric font-bold">{exam.score ?? '—'}</td>
                          <td>
                            {exam.evaluation ? (
                              <Badge className={EVALUATION_COLORS[exam.evaluation]}>
                                {EVALUATION_LABELS[exam.evaluation]}
                              </Badge>
                            ) : (
                              '—'
                            )}
                          </td>
                          <td className="numeric text-xs text-slate-500">{exam.mistakes ?? '—'}</td>
                          <td>
                            {exam.result ? (
                              <Badge
                                className={
                                  exam.result === 'PASSED' ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-800'
                                }
                              >
                                {exam.result === 'PASSED' ? 'ناجح' : 'لم يجتز'}
                              </Badge>
                            ) : (
                              '—'
                            )}
                          </td>
                        </>
                      )}
                      {status === 'SCHEDULED' && isCommittee && (
                        <td>
                          <div className="flex items-center justify-center gap-1.5">
                            <Button size="sm" icon={<IconCheck size={14} />} onClick={() => setGrading(exam)}>
                              رصد النتيجة
                            </Button>
                            <Button
                              size="sm"
                              variant="secondary"
                              icon={<IconX size={14} />}
                              onClick={async () => {
                                const ok = await confirm({
                                  title: 'تسجيل غياب',
                                  message: `سيتم تسجيل غياب "${exam.student.fullName}" عن الاختبار.`,
                                  confirmLabel: 'تسجيل الغياب',
                                });
                                if (ok) markAbsent.mutate(exam.id);
                              }}
                            >
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
            <Pagination page={data.meta.page} totalPages={data.meta.totalPages} total={data.meta.total} onChange={setPage} />
          </>
        )}
      </Card>

      {grading && <GradeModal exam={grading} onClose={() => setGrading(null)} />}
    </>
  );
}

function GradeModal({ exam, onClose }: { exam: Exam; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [score, setScore] = useState(exam.section.minScore);
  // Optional: the examiner may record a score and notes without counting mistakes.
  const [mistakes, setMistakes] = useState('');
  const [notes, setNotes] = useState('');

  const mutation = useMutation({
    mutationFn: () =>
      api.patch(`/exams/${exam.id}/result`, {
        score,
        mistakes: mistakes === '' ? undefined : Number(mistakes),
        notes: notes || undefined,
      }),
    onSuccess: () => {
      toast.success('تم رصد النتيجة وإشعار المعلم وولي الأمر');
      queryClient.invalidateQueries({ queryKey: ['exams'] });
      queryClient.invalidateQueries({ queryKey: ['students'] });
      onClose();
    },
    onError: (error) => toast.error(apiError(error)),
  });

  const passed = score >= exam.section.minScore;

  return (
    <Modal
      open
      onClose={onClose}
      title="رصد نتيجة الاختبار"
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            إلغاء
          </Button>
          <Button variant={passed ? 'success' : 'danger'} onClick={() => mutation.mutate()} loading={mutation.isPending}>
            حفظ النتيجة
          </Button>
        </>
      }
    >
      <div className="mb-4 rounded-xl bg-slate-50 px-4 py-3 text-xs text-slate-600">
        <p>
          الطالب: <span className="font-bold text-slate-800">{exam.student.fullName}</span>
        </p>
        <p className="mt-1">
          المقرر: <span className="font-bold text-slate-800">{exam.section.name}</span> — درجة النجاح{' '}
          <span className="numeric font-bold">{exam.section.minScore}</span>
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Input
          label="الدرجة (من 100)"
          type="number"
          required
          min={0}
          max={100}
          value={score}
          onChange={(e) => setScore(Number(e.target.value))}
        />
        <Input
          label="عدد الأخطاء"
          type="number"
          min={0}
          max={500}
          placeholder="اختياري"
          hint="اختياري — يمكن الاكتفاء بالدرجة"
          value={mistakes}
          onChange={(e) => setMistakes(e.target.value)}
        />
      </div>

      <div
        className={cx(
          'mt-3 rounded-xl px-4 py-3 text-sm font-bold',
          passed ? 'bg-emerald-50 text-emerald-800' : 'bg-red-50 text-red-800',
        )}
      >
        النتيجة المتوقعة: {passed ? 'ناجح — سيُحتسب الجزء ضمن المحفوظ' : 'لم يجتز — يمكن إعادة الطلب لاحقاً'}
        <span className="mr-1 font-semibold opacity-80">
          — التقدير: {EVALUATION_LABELS[scoreEvaluation(score)]}
        </span>
      </div>

      <Textarea label="ملاحظات اللجنة" className="mt-3" value={notes} onChange={(e) => setNotes(e.target.value)} />
    </Modal>
  );
}

// --- sections ---------------------------------------------------------------

function SectionsTab() {
  const { data, isLoading } = useQuery({
    queryKey: ['exams', 'sections'],
    queryFn: async () => (await api.get<ExamSection[]>('/exams/sections')).data,
  });

  if (isLoading) return <LoadingState />;

  return (
    <Card
      title="مقررات الاختبارات"
      subtitle="التسلسل الإلزامي — لا يمكن التقدم لمقرر قبل اجتياز الذي يسبقه"
      padded={false}
    >
      <div className="table-wrap border-0 shadow-none">
        <table className="table">
          <thead>
            <tr>
              <th>الترتيب</th>
              <th>المقرر</th>
              <th>الرمز</th>
              <th>عدد الصفحات</th>
              <th>درجة النجاح</th>
              <th>إلزامي</th>
            </tr>
          </thead>
          <tbody>
            {data?.map((section) => (
              <tr key={section.id}>
                <td className="numeric font-bold text-slate-400">{section.order}</td>
                <td className="font-semibold text-slate-800">{section.name}</td>
                <td className="numeric text-xs text-slate-500" dir="ltr">
                  {section.code}
                </td>
                <td className="numeric">{section.pagesCount ?? '—'}</td>
                <td className="numeric">{section.minScore}</td>
                <td>
                  <Badge className={section.isRequired ? 'bg-primary-100 text-primary-800' : 'bg-slate-100 text-slate-600'}>
                    {section.isRequired ? 'إلزامي' : 'اختياري'}
                  </Badge>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
