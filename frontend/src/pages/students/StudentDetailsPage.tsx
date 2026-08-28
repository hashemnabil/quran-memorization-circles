import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { api, apiError } from '@/lib/api';
import { PHONE_HINT, phoneError } from '@/lib/validation';
import { useAuthStore } from '@/store/auth';
import { StudentPhoto } from '@/components/StudentPhoto';
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
  ProgressBar,
  Select,
  StatCard,
  Tabs,
  Textarea,
  cx,
  useConfirm,
} from '@/components/ui';
import {
  IconAward,
  IconBook,
  IconClipboard,
  IconEdit,
  IconExchange,
  IconPause,
  IconPlus,
  IconTrash,
} from '@/components/ui/Icons';
import {
  ATTENDANCE_COLORS,
  ATTENDANCE_LABELS,
  ATTENDANCE_SHORT,
  COURSE_TYPE_COLORS,
  COURSE_TYPE_LABELS,
  EVALUATION_COLORS,
  EVALUATION_LABELS,
  EXAM_STATUS_COLORS,
  EXAM_STATUS_LABELS,
  RECITATION_TYPE_LABELS,
  REQUEST_STATUS_COLORS,
  REQUEST_STATUS_LABELS,
  STUDENT_STATUS_COLORS,
  STUDENT_STATUS_LABELS,
  describeExamSections,
} from '@/lib/labels';
import { calcAge, formatDate, formatDateShort, formatDateTime, formatParts, timeAgo } from '@/lib/format';
import type {
  AttendanceRecord,
  Circle,
  Evaluation,
  ExamDirection,
  ExamEligibility,
  PaginatedResponse,
  PreparationAssignment,
  Recitation,
  Student,
  StudentNote,
} from '@/types';

export default function StudentDetailsPage() {
  const { id = '' } = useParams();
  const user = useAuthStore((s) => s.user)!;
  const queryClient = useQueryClient();
  const confirm = useConfirm();

  const [tab, setTab] = useState('overview');
  const [modal, setModal] = useState<'evaluation' | 'note' | 'transfer' | 'suspend' | 'exam' | 'edit' | null>(null);

  const canManage = ['ADMIN', 'SUPERVISOR', 'TEACHER'].includes(user.role);

  const {
    data: student,
    isLoading,
    isError,
    refetch,
  } = useQuery({
    queryKey: ['students', id],
    queryFn: async () => (await api.get<Student>(`/students/${id}`)).data,
    enabled: !!id,
  });

  const { data: history } = useQuery({
    queryKey: ['students', id, 'history'],
    queryFn: async () => (await api.get(`/students/${id}/history`)).data,
    enabled: !!id && tab === 'history',
  });

  const { data: attendance } = useQuery({
    queryKey: ['attendance', { studentId: id }],
    queryFn: async () =>
      (await api.get<PaginatedResponse<AttendanceRecord>>('/attendance', { params: { studentId: id, limit: 60 } })).data,
    enabled: !!id && tab === 'attendance',
  });

  const { data: recitations } = useQuery({
    queryKey: ['recitations', { studentId: id }],
    queryFn: async () =>
      (await api.get<PaginatedResponse<Recitation>>('/recitations', { params: { studentId: id, limit: 50 } })).data,
    enabled: !!id && tab === 'recitations',
  });

  const { data: progress } = useQuery({
    queryKey: ['recitations', id, 'progress'],
    queryFn: async () => (await api.get(`/recitations/student/${id}/progress`)).data,
    enabled: !!id && (tab === 'recitations' || tab === 'overview'),
  });

  const { data: eligibility } = useQuery({
    queryKey: ['exams', 'eligibility', id],
    queryFn: async () => (await api.get<ExamEligibility>(`/exams/eligibility/${id}`)).data,
    enabled: !!id && tab === 'exams',
  });

  const { data: exams } = useQuery({
    queryKey: ['exams', { studentId: id }],
    queryFn: async () => (await api.get('/exams', { params: { studentId: id, limit: 50 } })).data,
    enabled: !!id && tab === 'exams',
  });

  const { data: notes } = useQuery({
    queryKey: ['students', id, 'notes'],
    queryFn: async () => (await api.get<StudentNote[]>(`/students/${id}/notes`)).data,
    enabled: !!id && tab === 'notes',
  });

  const deleteNote = useMutation({
    mutationFn: (noteId: string) => api.delete(`/students/${id}/notes/${noteId}`),
    onSuccess: () => {
      toast.success('تم حذف الملاحظة');
      queryClient.invalidateQueries({ queryKey: ['students', id, 'notes'] });
    },
    onError: (error) => toast.error(apiError(error)),
  });

  if (isLoading) return <LoadingState rows={6} />;
  if (isError || !student) return <ErrorState message="تعذر تحميل ملف الطالب" onRetry={() => refetch()} />;

  const tabs = [
    { key: 'overview', label: 'نظرة عامة' },
    { key: 'attendance', label: 'الحضور' },
    { key: 'recitations', label: 'التسميع' },
    { key: 'exams', label: 'الاختبارات' },
    { key: 'points', label: 'النقاط' },
    { key: 'courses', label: 'الدورات' },
    { key: 'preparations', label: 'التحضير' },
    { key: 'notes', label: 'الملاحظات' },
    { key: 'history', label: 'السجل' },
  ];

  return (
    <>
      {/* The picture sits above the header rather than inside it: `PageHeader`
          takes a title and an action, and the photo is neither. */}
      <div className="mb-4 flex items-center gap-3">
        <StudentPhoto
          studentId={student.id}
          fullName={student.fullName}
          photoUrl={student.photoUrl}
          size={56}
          editable={canManage}
          onChanged={() => queryClient.invalidateQueries({ queryKey: ['students', id] })}
        />
        <div className="text-sm text-slate-400">
          {student.photoUrl ? 'صورة الطالب' : 'لا توجد صورة للطالب بعد'}
        </div>
      </div>

      <PageHeader
        title={student.fullName}
        breadcrumb={
          <Link to="/students" className="hover:text-primary-700">
            الطلاب
          </Link>
        }
        subtitle={`${student.code} • ${calcAge(student.birthDate)} • ${student.circle?.name ?? 'غير مسجل في حلقة'}`}
        action={
          canManage && (
            <>
              <Button variant="secondary" size="sm" icon={<IconEdit size={15} />} onClick={() => setModal('edit')}>
                تعديل
              </Button>
              <Button variant="secondary" size="sm" icon={<IconAward size={15} />} onClick={() => setModal('evaluation')}>
                التقييم
              </Button>
              <Button variant="secondary" size="sm" icon={<IconExchange size={15} />} onClick={() => setModal('transfer')}>
                طلب نقل
              </Button>
              <Button variant="secondary" size="sm" icon={<IconPause size={15} />} onClick={() => setModal('suspend')}>
                طلب إيقاف
              </Button>
              <Button size="sm" icon={<IconAward size={15} />} onClick={() => setModal('exam')}>
                طلب اختبار
              </Button>
            </>
          )
        }
      />

      {student.status === 'ACTIVITY' && (
        <div className="mb-5 flex flex-wrap items-center gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4">
          <IconPause size={20} className="text-amber-600" />
          <div className="flex-1">
            <p className="text-sm font-bold text-amber-900">مُحوَّل إلى برنامج النشاط</p>
            <p className="text-xs leading-6 text-amber-800">
              الطالب خارج حلقات التحفيظ وما زال مسجّلاً في السجل الموحّد.
              {student.activeSuspension?.reason ? ` السبب: ${student.activeSuspension.reason}` : ''}
            </p>
          </div>
        </div>
      )}

      {student.status === 'SUSPENDED' && student.activeSuspension && (
        <div className="mb-5 flex flex-wrap items-center gap-3 rounded-2xl border border-red-100 bg-red-50 px-5 py-4">
          <IconPause size={20} className="text-red-600" />
          <div className="flex-1">
            <p className="text-sm font-bold text-red-800">
              الطالب موقوف
              {student.activeSuspension.remainingDays != null && (
                <>
                  {' '}— متبقٍ <span className="numeric">{student.activeSuspension.remainingDays}</span> يوم
                </>
              )}
            </p>
            <p className="text-xs text-red-700">
              السبب: {student.activeSuspension.reason}
              {student.activeSuspension.endDate
                ? ` — حتى ${formatDate(student.activeSuspension.endDate)}`
                : ''}
            </p>
          </div>
        </div>
      )}

      <div className="mb-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        <StatCard
          label="نسبة الحضور"
          value={`${student.attendanceSummary?.attendanceRate ?? 0}%`}
          icon={<IconClipboard size={22} />}
          tone={
            (student.attendanceSummary?.attendanceRate ?? 0) >= 80
              ? 'emerald'
              : (student.attendanceSummary?.attendanceRate ?? 0) >= 60
                ? 'amber'
                : 'red'
          }
          hint={`${student.attendanceSummary?.total ?? 0} سجل`}
        />
        <StatCard
          label="الأجزاء المحفوظة"
          value={formatParts(student.memorizedParts)}
          icon={<IconBook size={22} />}
          // Exams are sat by the hizb, so the ajza' figure is derived: two
          // ahzab to a juz'. The hint says where the number came from.
          hint={
            eligibility
              ? `${eligibility.hizbPassed} حزباً مجتازاً من ${eligibility.hizbTotal}`
              : 'من 30 جزءاً'
          }
        />
        <StatCard
          label="جلسات التسميع"
          value={progress?.totalSessions ?? 0}
          icon={<IconBook size={22} />}
          tone="sky"
          hint={progress?.totalPages ? `${progress.totalPages} صفحة` : undefined}
        />
        <StatCard
          label="الأحزاب المجتازة"
          value={eligibility?.hizbPassed ?? student.examSummary?.passed ?? 0}
          icon={<IconAward size={22} />}
          tone="purple"
          hint={student.examSummary?.lastPassedSection ?? undefined}
        />
        <StatCard
          label="رصيد النقاط"
          value={student.points?.total ?? student.totalPoints ?? 0}
          icon={<IconAward size={22} />}
          tone="amber"
          hint={
            student.points
              ? `${student.points.fromRecitations} من التسميع + ${student.points.fromSurahs} من السور`
              : undefined
          }
        />
      </div>

      <Tabs tabs={tabs} active={tab} onChange={setTab} />

      {tab === 'overview' && <OverviewTab student={student} progress={progress} />}
      {tab === 'attendance' && <AttendanceTab records={attendance?.data ?? []} summary={student.attendanceSummary} />}
      {tab === 'recitations' && <RecitationsTab records={recitations?.data ?? []} progress={progress} />}
      {tab === 'exams' && <ExamsTab eligibility={eligibility} exams={exams?.data ?? []} />}
      {tab === 'points' && <PointsTab student={student} canManage={canManage} />}
      {tab === 'courses' && <CoursesTab student={student} />}
      {tab === 'preparations' && <PreparationsTab student={student} canManage={canManage} />}
      {tab === 'notes' && (
        <Card
          title="ملاحظات الطالب"
          action={
            canManage && (
              <Button size="sm" icon={<IconPlus size={15} />} onClick={() => setModal('note')}>
                إضافة ملاحظة
              </Button>
            )
          }
          padded={false}
        >
          {notes?.length ? (
            <ul className="divide-y divide-slate-100">
              {notes.map((note) => (
                <li key={note.id} className="flex gap-3 px-5 py-4">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm leading-6 text-slate-700">{note.body}</p>
                    <p className="mt-1 text-[11px] text-slate-400">
                      {note.author.fullName} — {timeAgo(note.createdAt)}
                      {note.isPrivate && (
                        <Badge className="mr-2 bg-slate-100 text-slate-500">داخلية</Badge>
                      )}
                    </p>
                  </div>
                  {/* The API allows deletion by the note's author or an admin only. */}
                  {canManage && (note.author.id === user.id || user.role === 'ADMIN') && (
                    <button
                      onClick={async () => {
                        const ok = await confirm({
                          title: 'حذف الملاحظة',
                          message: 'سيتم حذف هذه الملاحظة نهائياً من ملف الطالب.',
                          confirmLabel: 'حذف',
                        });
                        if (ok) deleteNote.mutate(note.id);
                      }}
                      className="h-fit rounded-lg p-2 text-slate-300 transition hover:bg-red-50 hover:text-red-600"
                    >
                      <IconTrash size={15} />
                    </button>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState title="لا توجد ملاحظات" icon={<IconClipboard size={24} />} />
          )}
        </Card>
      )}
      {tab === 'history' && <HistoryTab history={history} />}

      {modal === 'evaluation' && <EvaluationModal student={student} onClose={() => setModal(null)} />}
      {modal === 'note' && <NoteModal studentId={id} onClose={() => setModal(null)} />}
      {modal === 'transfer' && <TransferModal student={student} onClose={() => setModal(null)} />}
      {modal === 'suspend' && <SuspendModal student={student} onClose={() => setModal(null)} />}
      {modal === 'exam' && <ExamRequestModal student={student} onClose={() => setModal(null)} />}
      {modal === 'edit' && <EditStudentModal student={student} onClose={() => setModal(null)} />}
    </>
  );
}

// --- tabs -------------------------------------------------------------------

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-slate-50 py-2.5 last:border-0">
      <span className="shrink-0 text-xs font-semibold text-slate-400">{label}</span>
      <span className="text-left text-sm font-medium text-slate-700">{value || '—'}</span>
    </div>
  );
}

function OverviewTab({ student, progress }: { student: Student; progress: any }) {
  return (
    <div className="grid gap-5 lg:grid-cols-3">
      <Card title="البيانات الشخصية" className="lg:col-span-1">
        <InfoRow label="رقم الطالب" value={<span className="numeric">{student.code}</span>} />
        <InfoRow label="تاريخ الميلاد" value={formatDate(student.birthDate)} />
        <InfoRow label="العمر" value={calcAge(student.birthDate)} />
        <InfoRow label="رقم الهوية" value={<span className="numeric" dir="ltr">{student.nationalId}</span>} />
        <InfoRow label="هوية الأب" value={<span className="numeric" dir="ltr">{student.fatherNationalId}</span>} />
        <InfoRow label="العنوان" value={student.address} />
        <InfoRow label="تاريخ التسجيل" value={formatDate(student.enrollmentDate)} />
        <InfoRow
          label="الحالة"
          value={
            <Badge className={STUDENT_STATUS_COLORS[student.status]}>
              {STUDENT_STATUS_LABELS[student.status]}
            </Badge>
          }
        />
      </Card>

      <Card title="الحلقة وولي الأمر" className="lg:col-span-1">
        <InfoRow
          label="الحلقة"
          value={
            student.circle ? (
              <Link to={`/circles/${student.circle.id}`} className="text-primary-700 hover:underline">
                {student.circle.name}
              </Link>
            ) : null
          }
        />
        <InfoRow label="المعلم" value={student.teacherName} />
        <InfoRow label="المشرف" value={student.supervisorName} />
        <InfoRow label="ولي الأمر" value={student.parentName} />
        <InfoRow
          label="جوال ولي الأمر"
          value={<span className="numeric" dir="ltr">{student.parentPhone}</span>}
        />
        <InfoRow label="صلة القرابة" value={student.guardianRelation} />
      </Card>

      <Card title="المستوى والتقييم" className="lg:col-span-1">
        <div className="mb-4">
          <div className="mb-1.5 flex items-center justify-between text-xs">
            <span className="font-semibold text-slate-500">الأجزاء المحفوظة</span>
            <span className="numeric font-bold text-slate-700">{formatParts(student.memorizedParts)} / 30</span>
          </div>
          <ProgressBar value={student.memorizedParts} max={30} showLabel />
        </div>
        <InfoRow
          label="التقييم الحالي"
          value={
            student.evaluation ? (
              <Badge className={EVALUATION_COLORS[student.evaluation]}>
                {EVALUATION_LABELS[student.evaluation]}
              </Badge>
            ) : null
          }
        />
        <InfoRow label="ملاحظة التقييم" value={student.evaluationNote} />
        <InfoRow label="تاريخ التقييم" value={formatDate(student.evaluatedAt)} />
        <InfoRow label="السورة الحالية" value={student.currentSurah} />
        <InfoRow
          label="آخر تسميع"
          value={
            student.lastRecitation
              ? `${student.lastRecitation.fromSurah} ${student.lastRecitation.fromAyah} — ${student.lastRecitation.toSurah} ${student.lastRecitation.toAyah}`
              : null
          }
        />
        {progress?.totalPages > 0 && (
          <InfoRow label="إجمالي الصفحات" value={<span className="numeric">{progress.totalPages}</span>} />
        )}
      </Card>

      {typeof student.notes === 'string' && student.notes && (
        <Card title="ملاحظات عامة" className="lg:col-span-3">
          <p className="whitespace-pre-wrap text-sm leading-7 text-slate-600">{student.notes}</p>
        </Card>
      )}
    </div>
  );
}

function AttendanceTab({ records, summary }: { records: AttendanceRecord[]; summary?: Student['attendanceSummary'] }) {
  return (
    <div className="space-y-5">
      {summary && (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard label="إجمالي السجلات" value={summary.total} tone="slate" />
          <StatCard label="حاضر" value={summary.present} tone="emerald" />
          <StatCard label="غياب بعذر" value={summary.excused} tone="amber" />
          <StatCard label="غياب بدون عذر" value={summary.absent} tone="red" />
        </div>
      )}

      <Card title="سجل الحضور" padded={false}>
        {records.length ? (
          <div className="table-wrap border-0 shadow-none">
            <table className="table">
              <thead>
                <tr>
                  <th>التاريخ</th>
                  <th>الحالة</th>
                  <th>الحلقة</th>
                  <th>سبب العذر</th>
                </tr>
              </thead>
              <tbody>
                {records.map((rec) => (
                  <tr key={rec.id}>
                    <td className="numeric">{formatDateShort(rec.date)}</td>
                    <td>
                      <Badge className={ATTENDANCE_COLORS[rec.status]}>{ATTENDANCE_SHORT[rec.status]}</Badge>
                    </td>
                    <td className="text-xs text-slate-500">{rec.circle?.name}</td>
                    <td className="text-xs text-slate-500">{rec.note ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState title="لا توجد سجلات حضور" icon={<IconClipboard size={24} />} />
        )}
      </Card>
    </div>
  );
}

/** Sums the sessions carrying any of the given evaluations. */
function countEvaluations(progress: any, wanted: string[]) {
  return (progress?.byEvaluation ?? [])
    .filter((row: any) => wanted.includes(row.evaluation))
    .reduce((sum: number, row: any) => sum + row.sessions, 0);
}



function HistoryTab({ history }: { history: any }) {
  if (!history) return <LoadingState rows={4} />;

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <Card title="سجل الحلقات" padded={false}>
        {history.memberships?.length ? (
          <ul className="divide-y divide-slate-100">
            {history.memberships.map((m: any) => (
              <li key={m.id} className="flex items-center justify-between gap-3 px-5 py-3">
                <div>
                  <p className="text-sm font-semibold text-slate-700">{m.circle.name}</p>
                  <p className="text-xs text-slate-400">{m.reason ?? '—'}</p>
                </div>
                <div className="text-left text-[11px] text-slate-500">
                  <p className="numeric">{formatDateShort(m.startedAt)}</p>
                  <p className="numeric">{m.endedAt ? formatDateShort(m.endedAt) : 'حتى الآن'}</p>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState title="لا يوجد سجل" />
        )}
      </Card>

      <Card title="سجل الإيقاف" padded={false}>
        {history.suspensions?.length ? (
          <ul className="divide-y divide-slate-100">
            {history.suspensions.map((s: any) => (
              <li key={s.id} className="px-5 py-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-slate-700">
                    <span className="numeric">{s.durationDays}</span> يوم
                  </p>
                  <Badge className={REQUEST_STATUS_COLORS[s.status as keyof typeof REQUEST_STATUS_COLORS]}>
                    {REQUEST_STATUS_LABELS[s.status as keyof typeof REQUEST_STATUS_LABELS]}
                  </Badge>
                </div>
                <p className="mt-0.5 text-xs text-slate-500">{s.reason}</p>
                <p className="numeric mt-0.5 text-[11px] text-slate-400">
                  {formatDateShort(s.startDate)} — {formatDateShort(s.endDate)}
                </p>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState title="لا يوجد سجل إيقاف" />
        )}
      </Card>

      <Card title="سجل التقييمات" padded={false}>
        {history.evaluations?.length ? (
          <ul className="divide-y divide-slate-100">
            {history.evaluations.map((e: any) => (
              <li key={e.id} className="flex items-center justify-between gap-3 px-5 py-3">
                <div>
                  <Badge className={EVALUATION_COLORS[e.evaluation as Evaluation]}>
                    {EVALUATION_LABELS[e.evaluation as Evaluation]}
                  </Badge>
                  {e.note && <p className="mt-1 text-xs text-slate-500">{e.note}</p>}
                </div>
                <div className="text-left text-[11px] text-slate-400">
                  <p>{e.author?.fullName}</p>
                  <p className="numeric">{formatDateShort(e.createdAt)}</p>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState title="لا يوجد سجل تقييمات" />
        )}
      </Card>

      <Card title="سجل الاختبارات" padded={false}>
        {history.exams?.length ? (
          <ul className="divide-y divide-slate-100">
            {history.exams.map((e: any) => (
              <li key={e.id} className="flex items-center justify-between gap-3 px-5 py-3">
                <div>
                  <p className="text-sm font-semibold text-slate-700">{describeExamSections(e.section, e.sections)}</p>
                  <p className="numeric text-[11px] text-slate-400">{formatDateShort(e.scheduledAt)}</p>
                </div>
                {e.result ? (
                  <Badge className={e.result === 'PASSED' ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-800'}>
                    {e.result === 'PASSED' ? 'ناجح' : 'لم يجتز'} <span className="numeric">{e.score}</span>
                  </Badge>
                ) : (
                  <Badge className={EXAM_STATUS_COLORS[e.status as keyof typeof EXAM_STATUS_COLORS]}>
                    {EXAM_STATUS_LABELS[e.status as keyof typeof EXAM_STATUS_LABELS]}
                  </Badge>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState title="لا يوجد سجل اختبارات" />
        )}
      </Card>
    </div>
  );
}

// --- modals -----------------------------------------------------------------

function EvaluationModal({ student, onClose }: { student: Student; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [evaluation, setEvaluation] = useState<string>(student.evaluation ?? 'GOOD');
  const [note, setNote] = useState('');

  const mutation = useMutation({
    mutationFn: () => api.patch(`/students/${student.id}/evaluation`, { evaluation, note: note || undefined }),
    onSuccess: () => {
      toast.success('تم تحديث تقييم الطالب');
      queryClient.invalidateQueries({ queryKey: ['students'] });
      onClose();
    },
    onError: (error) => toast.error(apiError(error)),
  });

  return (
    <Modal
      open
      onClose={onClose}
      title="تحديد التقييم"
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            إلغاء
          </Button>
          <Button onClick={() => mutation.mutate()} loading={mutation.isPending}>
            حفظ التقييم
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <div className="grid grid-cols-1 gap-2">
          {(Object.keys(EVALUATION_LABELS) as Evaluation[]).map((key) => (
            <button
              key={key}
              onClick={() => setEvaluation(key)}
              className={cx(
                'flex items-center justify-between rounded-xl border px-4 py-3 text-sm font-semibold transition',
                evaluation === key
                  ? 'border-primary-500 bg-primary-50 text-primary-800'
                  : 'border-slate-200 text-slate-600 hover:bg-slate-50',
              )}
            >
              {EVALUATION_LABELS[key]}
              {evaluation === key && <span className="h-2 w-2 rounded-full bg-primary-600" />}
            </button>
          ))}
        </div>
        <Textarea label="ملاحظة (اختياري)" value={note} onChange={(e) => setNote(e.target.value)} />
      </div>
    </Modal>
  );
}

function NoteModal({ studentId, onClose }: { studentId: string; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [body, setBody] = useState('');
  const [isPrivate, setIsPrivate] = useState(false);

  const mutation = useMutation({
    mutationFn: () => api.post(`/students/${studentId}/notes`, { body, isPrivate }),
    onSuccess: () => {
      toast.success('تمت إضافة الملاحظة');
      queryClient.invalidateQueries({ queryKey: ['students', studentId, 'notes'] });
      onClose();
    },
    onError: (error) => toast.error(apiError(error)),
  });

  return (
    <Modal
      open
      onClose={onClose}
      title="إضافة ملاحظة"
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            إلغاء
          </Button>
          <Button onClick={() => mutation.mutate()} loading={mutation.isPending} disabled={!body.trim()}>
            إضافة
          </Button>
        </>
      }
    >
      <Textarea label="نص الملاحظة" required rows={4} value={body} onChange={(e) => setBody(e.target.value)} />
      <label className="mt-3 flex cursor-pointer items-center gap-2 text-sm text-slate-600">
        <input
          type="checkbox"
          checked={isPrivate}
          onChange={(e) => setIsPrivate(e.target.checked)}
          className="h-4 w-4 rounded border-slate-300 text-primary-600 focus:ring-primary-400"
        />
        ملاحظة داخلية (لا تظهر لولي الأمر)
      </label>
    </Modal>
  );
}

/**
 * A transfer request carries the reason and nothing else — the destination is a
 * placement decision that depends on capacity and level, so the administration
 * makes it at approval time.
 */
function TransferModal({ student, onClose }: { student: Student; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [reason, setReason] = useState('');

  const mutation = useMutation({
    mutationFn: () => api.post('/transfers/students', { studentId: student.id, reason }),
    onSuccess: () => {
      toast.success('تم إرسال طلب النقل إلى الإدارة');
      queryClient.invalidateQueries({ queryKey: ['transfers'] });
      onClose();
    },
    onError: (error) => toast.error(apiError(error)),
  });

  return (
    <Modal
      open
      onClose={onClose}
      title="طلب نقل الطالب"
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            إلغاء
          </Button>
          <Button
            onClick={() => mutation.mutate()}
            loading={mutation.isPending}
            disabled={!reason.trim()}
          >
            إرسال الطلب
          </Button>
        </>
      }
    >
      <p className="mb-4 rounded-xl bg-slate-50 px-4 py-3 text-xs leading-6 text-slate-500">
        الحلقة الحالية: <span className="font-bold text-slate-700">{student.circle?.name ?? 'غير مسجل'}</span>
        <br />
        اذكر سبب النقل فقط — الإدارة هي من تحدد الحلقة الجديدة عند اعتماد الطلب.
      </p>
      <Textarea
        label="سبب النقل"
        required
        rows={4}
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="مثال: مستوى الطالب أعلى من مستوى الحلقة الحالية"
      />
    </Modal>
  );
}

/**
 * Same shape as the transfer request: state the problem, and let the
 * administration decide what to do about it — move the student to the activity
 * programme, suspend them for a set period, or reject the request outright.
 */
function SuspendModal({ student, onClose }: { student: Student; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [reason, setReason] = useState('');

  const mutation = useMutation({
    mutationFn: () => api.post('/suspensions', { studentId: student.id, reason }),
    onSuccess: () => {
      toast.success('تم إرسال الطلب إلى الإدارة');
      queryClient.invalidateQueries({ queryKey: ['suspensions'] });
      onClose();
    },
    onError: (error) => toast.error(apiError(error)),
  });

  return (
    <Modal
      open
      onClose={onClose}
      title="طلب إيقاف / استبعاد الطالب"
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            إلغاء
          </Button>
          <Button
            variant="danger"
            onClick={() => mutation.mutate()}
            loading={mutation.isPending}
            disabled={!reason.trim()}
          >
            إرسال الطلب
          </Button>
        </>
      }
    >
      <p className="mb-4 rounded-xl bg-amber-50 px-4 py-3 text-xs leading-6 text-amber-800">
        اذكر السبب فقط. بعد مراجعة الطلب تختار الإدارة الإجراء المناسب: التحويل إلى برنامج النشاط،
        أو الإيقاف لمدة تحددها، أو رفض الطلب. وسيُشعَر ولي الأمر بالقرار.
      </p>
      <Textarea
        label="سبب الطلب"
        required
        rows={4}
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="مثال: الطالب لا يقرأ بعد ويحتاج تهيئة قبل الالتحاق بحلقة"
      />
    </Modal>
  );
}

/**
 * Exams are requested by the hizb, in sequence, in the student's own direction.
 *
 * The circle chooses the direction once — up from hizb 1, or down from hizb 60 —
 * and from then on the next exam is whatever follows the last hizb passed. One
 * exam may still cover several of them (57, 56 and 55 together), which is why
 * this picks a *run* rather than an arbitrary set: clicking a hizb takes it and
 * everything before it, clicking the last one taken gives it back.
 */
function ExamRequestModal({ student, onClose }: { student: Student; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [hizb, setHizb] = useState('');
  const [juz, setJuz] = useState('');
  const [combined, setCombined] = useState('');
  const [note, setNote] = useState('');

  const mutation = useMutation({
    mutationFn: () =>
      api.post('/exams/requests', {
        studentId: student.id,
        requestedHizb: hizb ? Number(hizb) : undefined,
        requestedJuz: juz ? Number(juz) : undefined,
        requestedCombined: combined ? Number(combined) : undefined,
        note: note.trim() || undefined,
      }),
    onSuccess: () => {
      toast.success('تم إرسال طلب الاختبار إلى لجنة الاختبارات');
      queryClient.invalidateQueries({ queryKey: ['exams'] });
      onClose();
    },
    onError: (error) => toast.error(apiError(error)),
  });

  const hasValue = Boolean(hizb || juz || combined);

  return (
    <Modal
      open
      onClose={onClose}
      title="طلب اختبار"
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            إلغاء
          </Button>
          <Button onClick={() => mutation.mutate()} loading={mutation.isPending} disabled={!hasValue}>
            تقديم طلب
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <p className="rounded-xl bg-slate-50 px-4 py-3 text-xs leading-6 text-slate-500">
          اختر ما تريد طلب اختباره. يمكنك تعبئة خانة واحدة فقط أو أكثر من خانة، ولا يلزم تعبئة الجميع.
        </p>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Input
            label="حزب"
            type="number"
            min={1}
            max={60}
            value={hizb}
            onChange={(e) => setHizb(e.target.value)}
            placeholder="رقم الحزب"
          />
          <Input
            label="جزء"
            type="number"
            min={1}
            max={30}
            value={juz}
            onChange={(e) => setJuz(e.target.value)}
            placeholder="رقم الجزء"
          />
          <Input
            label="مجتمعة"
            type="number"
            min={1}
            max={60}
            value={combined}
            onChange={(e) => setCombined(e.target.value)}
            placeholder="الرقم"
          />
        </div>

        <Textarea
          label="ملاحظة (اختياري)"
          rows={4}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="أي ملاحظة تريد إرسالها للجنة الاختبارات"
        />
      </div>
    </Modal>
  );
}

function EditStudentModal({ student, onClose }: { student: Student; onClose: () => void }) {
  const user = useAuthStore((s) => s.user)!;
  const queryClient = useQueryClient();
  const isAdmin = user.role === 'ADMIN';

  const [form, setForm] = useState({
    fullName: student.fullName,
    birthDate: student.birthDate?.slice(0, 10) ?? '',
    nationalId: student.nationalId ?? '',
    fatherNationalId: student.fatherNationalId ?? '',
    address: student.address ?? '',
    phone: student.phone ?? '',
    guardianName: student.guardianName ?? '',
    guardianPhone: student.guardianPhone ?? '',
    guardianRelation: student.guardianRelation ?? '',
    memorizedParts: student.memorizedParts,
    currentSurah: student.currentSurah ?? '',
    circleId: student.circleId ?? '',
    // Defensive: a response cached before `noteEntries` existed carries a list
    // here, and putting one in a textarea is how the "must be a string" error
    // reached the operator in the first place.
    notes: typeof student.notes === 'string' ? student.notes : '',
  });

  const { data: circles } = useQuery({
    queryKey: ['circles', 'options'],
    queryFn: async () => (await api.get<Pick<Circle, 'id' | 'name' | 'code'>[]>('/circles/options')).data,
    enabled: isAdmin,
  });

  const mutation = useMutation({
    mutationFn: () => {
      // Teachers/supervisors may only send the fields the API allows them to change.
      const payload: Record<string, unknown> = isAdmin
        ? { ...form, circleId: form.circleId || null }
        : {
            guardianName: form.guardianName,
            guardianPhone: form.guardianPhone,
            guardianRelation: form.guardianRelation,
            phone: form.phone,
            address: form.address,
            notes: form.notes,
            currentSurah: form.currentSurah,
            memorizedParts: form.memorizedParts,
          };
      return api.patch(`/students/${student.id}`, payload);
    },
    onSuccess: () => {
      toast.success('تم تحديث بيانات الطالب');
      queryClient.invalidateQueries({ queryKey: ['students'] });
      onClose();
    },
    onError: (error) => toast.error(apiError(error)),
  });

  const [errors, setErrors] = useState<Record<string, string>>({});

  const set = (key: string, value: unknown) => {
    setForm((f) => ({ ...f, [key]: value }));
    // Clear the field's error as soon as the user edits it again.
    setErrors((e) => (e[key] ? { ...e, [key]: '' } : e));
  };

  /** Validates the phone fields before the request goes out. */
  const submit = () => {
    const next: Record<string, string> = {};
    const phoneErr = phoneError(form.phone);
    if (phoneErr) next.phone = phoneErr;
    const guardianPhoneErr = phoneError(form.guardianPhone);
    if (guardianPhoneErr) next.guardianPhone = guardianPhoneErr;
    setErrors(next);
    if (Object.values(next).some(Boolean)) return;
    mutation.mutate();
  };

  return (
    <Modal
      open
      onClose={onClose}
      title="تعديل بيانات الطالب"
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            إلغاء
          </Button>
          <Button onClick={submit} loading={mutation.isPending}>
            حفظ التعديلات
          </Button>
        </>
      }
    >
      {!isAdmin && (
        <p className="mb-4 rounded-xl bg-sky-50 px-4 py-3 text-xs text-sky-800">
          يمكنك تعديل بيانات التواصل ومستوى الحفظ فقط. البيانات الإدارية (الاسم، الهوية، الحلقة) من صلاحية الإدارة.
        </p>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <Input
          label="الاسم الكامل"
          value={form.fullName}
          onChange={(e) => set('fullName', e.target.value)}
          disabled={!isAdmin}
          className="sm:col-span-2"
        />
        <Input label="تاريخ الميلاد" type="date" value={form.birthDate} onChange={(e) => set('birthDate', e.target.value)} disabled={!isAdmin} />
        <Input label="رقم الهوية" value={form.nationalId} onChange={(e) => set('nationalId', e.target.value)} disabled={!isAdmin} dir="ltr" />
        {isAdmin && (
          <Select label="الحلقة" value={form.circleId} onChange={(e) => set('circleId', e.target.value)}>
            <option value="">بدون حلقة</option>
            {circles?.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        )}
        <Input label="جوال الطالب" value={form.phone} onChange={(e) => set('phone', e.target.value)} error={errors.phone} hint={PHONE_HINT} dir="ltr" />
        <Input label="العنوان" value={form.address} onChange={(e) => set('address', e.target.value)} />
        <Input label="اسم ولي الأمر" value={form.guardianName} onChange={(e) => set('guardianName', e.target.value)} />
        <Input label="جوال ولي الأمر" value={form.guardianPhone} onChange={(e) => set('guardianPhone', e.target.value)} error={errors.guardianPhone} hint={PHONE_HINT} dir="ltr" />
        <Input label="صلة القرابة" value={form.guardianRelation} onChange={(e) => set('guardianRelation', e.target.value)} />
        <Input
          label="الأجزاء المحفوظة"
          type="number"
          min={0}
          max={30}
          value={form.memorizedParts}
          // Halves are legitimate: the total is ahzab / 2.
          step="0.5"
          onChange={(e) => set('memorizedParts', Number(e.target.value))}
        />
        <Input label="السورة الحالية" value={form.currentSurah} onChange={(e) => set('currentSurah', e.target.value)} />
        <Textarea label="ملاحظات" value={form.notes} onChange={(e) => set('notes', e.target.value)} className="sm:col-span-2" />
      </div>
    </Modal>
  );
}

// --- points -----------------------------------------------------------------

/**
 * The scoring system: one point per recited ayah, minus one per mistake and a
 * quarter per warning, plus a bonus for each surah finished. The breakdown is
 * shown alongside the balance so a parent can see how it was arrived at.
 */
function PointsTab({ student, canManage }: { student: Student; canManage: boolean }) {
  const queryClient = useQueryClient();
  const confirm = useConfirm();
  const [surah, setSurah] = useState('');
  const [points, setPoints] = useState(10);

  const { data: surahs } = useQuery({
    queryKey: ['recitations', 'surahs'],
    queryFn: async () =>
      (await api.get<{ number: number; name: string; ayahs: number }[]>('/recitations/surahs')).data,
    staleTime: Infinity,
  });

  const award = useMutation({
    mutationFn: () => api.post(`/students/${student.id}/surahs`, { surah, points }),
    onSuccess: () => {
      toast.success('تم تسجيل إتمام السورة ومنح نقاطها');
      setSurah('');
      queryClient.invalidateQueries({ queryKey: ['students', student.id] });
    },
    onError: (error) => toast.error(apiError(error)),
  });

  const removeSurah = useMutation({
    mutationFn: (completionId: string) =>
      api.delete(`/students/${student.id}/surahs/${completionId}`),
    onSuccess: () => {
      toast.success('تم حذف السجل');
      queryClient.invalidateQueries({ queryKey: ['students', student.id] });
    },
    onError: (error) => toast.error(apiError(error)),
  });

  const p = student.points;
  const completed = student.surahCompletions ?? [];
  const awardedNames = new Set(completed.map((c) => c.surah));

  return (
    <div className="space-y-4">
      <Card title="رصيد النقاط" subtitle="نقطة لكل آية، ناقص نقطة لكل خطأ، وربع نقطة لكل تنبيه">
        <div className="mb-5 rounded-2xl bg-gradient-to-l from-gold-50 to-white px-5 py-6 text-center">
          <p className="text-xs font-semibold text-gold-800">إجمالي النقاط</p>
          <p className="numeric mt-1 text-4xl font-extrabold text-gold-700">
            {p?.total ?? student.totalPoints ?? 0}
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <PointStat label="من التسميع" value={p?.fromRecitations ?? 0} tone="text-emerald-700" />
          <PointStat label="من إتمام السور" value={p?.fromSurahs ?? 0} tone="text-primary-700" />
          <PointStat label="آيات مُسمّعة" value={p?.verses ?? 0} tone="text-sky-700" />
          <PointStat label="جلسات التسميع" value={p?.sessions ?? 0} tone="text-slate-700" />
          <PointStat label="مجموع الأخطاء" value={p?.mistakes ?? 0} tone="text-red-600" />
          <PointStat label="مجموع التنبيهات" value={p?.warnings ?? 0} tone="text-amber-600" />
          <PointStat label="سور مكتملة" value={p?.surahsCompleted ?? completed.length} tone="text-purple-700" />
        </div>
      </Card>

      <Card
        title="السور المكتملة"
        subtitle="تُمنح نقاط إضافية عن كل سورة يتم إتمام حفظها"
        padded={false}
      >
        {canManage && (
          <div className="flex flex-wrap items-end gap-3 border-b border-slate-100 px-5 py-4">
            <Select
              label="السورة"
              value={surah}
              onChange={(e) => setSurah(e.target.value)}
              className="min-w-[200px] flex-1"
            >
              <option value="">اختر السورة</option>
              {(surahs ?? [])
                .filter((x) => !awardedNames.has(x.name))
                .map((x) => (
                  <option key={x.number} value={x.name}>
                    {x.name}
                  </option>
                ))}
            </Select>
            <Input
              label="النقاط"
              type="number"
              min={0}
              value={points}
              onChange={(e) => setPoints(Number(e.target.value))}
              className="w-28"
            />
            <Button disabled={!surah} loading={award.isPending} onClick={() => award.mutate()}>
              منح النقاط
            </Button>
          </div>
        )}

        {completed.length === 0 ? (
          <EmptyState title="لا توجد سور مكتملة بعد" icon={<IconBook size={24} />} />
        ) : (
          <ul className="divide-y divide-slate-100">
            {completed.map((c) => (
              <li key={c.id} className="flex items-center justify-between px-5 py-3">
                <div>
                  <span className="font-semibold text-slate-700">سورة {c.surah}</span>
                  <span className="block text-xs text-slate-400">{formatDate(c.completedAt)}</span>
                </div>
                <div className="flex items-center gap-3">
                  <Badge className="bg-gold-100 text-gold-800">
                    <span className="numeric">+{c.points}</span>
                  </Badge>
                  {canManage && (
                    <button
                      onClick={async () => {
                        const ok = await confirm({
                          title: 'حذف السجل',
                          message: `سيتم سحب ${c.points} نقطة الممنوحة عن سورة ${c.surah}.`,
                          confirmLabel: 'حذف',
                          variant: 'danger',
                        });
                        if (ok) removeSurah.mutate(c.id);
                      }}
                      className="rounded-lg p-1.5 text-slate-300 transition hover:bg-red-50 hover:text-red-600"
                    >
                      <IconTrash size={15} />
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

function PointStat({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div className="rounded-xl bg-slate-50 px-4 py-3">
      <p className="text-xs text-slate-400">{label}</p>
      <p className={`numeric mt-0.5 text-xl font-extrabold ${tone}`}>{value}</p>
    </div>
  );
}

// --- courses ----------------------------------------------------------------

/** The student's course track, on the same profile as their circle record. */
function CoursesTab({ student }: { student: Student }) {
  const courses = student.courses ?? [];
  const current = courses.filter((c) => c.isCurrent);
  const past = courses.filter((c) => !c.isCurrent);

  if (courses.length === 0) {
    return (
      <EmptyState
        title="غير مسجل في أي دورة"
        message="الدورات التعليمية مسار مستقل عن حلقات التحفيظ، ويمكن تسجيل الطالب فيها من صفحة الدورة."
        icon={<IconBook size={24} />}
      />
    );
  }

  return (
    <div className="space-y-4">
      {current.length > 0 && (
        <Card title="الدورات الحالية" padded={false}>
          <ul className="divide-y divide-slate-100">
            {current.map((c) => (
              <li key={c.enrollmentId} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5">
                <div className="min-w-0">
                  <Link to={`/courses/${c.id}`} className="font-semibold text-slate-800 hover:text-primary-700">
                    {c.name}
                  </Link>
                  <span className="block text-xs text-slate-400">
                    {c.instructor?.fullName ?? c.instructorName ?? 'بدون محاضر محدد'}
                    {c.startDate ? ` — من ${formatDate(c.startDate)}` : ''}
                  </span>
                </div>
                <Badge className={COURSE_TYPE_COLORS[c.type]}>{COURSE_TYPE_LABELS[c.type]}</Badge>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {past.length > 0 && (
        <Card title="دورات سابقة" padded={false}>
          <ul className="divide-y divide-slate-100">
            {past.map((c) => (
              <li key={c.enrollmentId} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5">
                <div className="min-w-0">
                  <Link to={`/courses/${c.id}`} className="text-slate-600 hover:text-primary-700">
                    {c.name}
                  </Link>
                  <span className="block text-xs text-slate-400">
                    {c.endedAt ? `انتهى في ${formatDate(c.endedAt)}` : 'منتهية'}
                  </span>
                </div>
                <Badge className="bg-slate-100 text-slate-600">{COURSE_TYPE_LABELS[c.type]}</Badge>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}

// --- preparation ------------------------------------------------------------

/** "Prepare Al-Baqarah 1-20 for the next session." */
function PreparationsTab({ student, canManage }: { student: Student; canManage: boolean }) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);

  const { data } = useQuery({
    queryKey: ['preparations', student.id],
    queryFn: async () =>
      (
        await api.get<PaginatedResponse<PreparationAssignment>>('/preparations', {
          params: { studentId: student.id, limit: 50 },
        })
      ).data,
  });

  const complete = useMutation({
    mutationFn: ({ id, done }: { id: string; done: boolean }) =>
      api.patch(`/preparations/${id}/${done ? 'complete' : 'reopen'}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['preparations', student.id] }),
    onError: (error) => toast.error(apiError(error)),
  });

  const rows = data?.data ?? [];

  return (
    <>
      <Card
        title="تكاليف التحضير"
        subtitle="يُشعَر ولي الأمر فور إنشاء التكليف"
        action={
          canManage && (
            <Button size="sm" icon={<IconPlus size={15} />} onClick={() => setOpen(true)}>
              تكليف جديد
            </Button>
          )
        }
        padded={false}
      >
        {rows.length === 0 ? (
          <EmptyState title="لا توجد تكاليف" icon={<IconBook size={24} />} />
        ) : (
          <ul className="divide-y divide-slate-100">
            {rows.map((prep) => (
              <li key={prep.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5">
                <div className="min-w-0">
                  <span className="block font-semibold text-slate-700">
                    {prep.fromSurah} <span className="numeric text-slate-400">({prep.fromAyah})</span>
                    {' — '}
                    {prep.toSurah} <span className="numeric text-slate-400">({prep.toAyah})</span>
                  </span>
                  <span className="block text-xs text-slate-400">
                    {prep.teacher?.user.fullName ?? '—'}
                    {prep.dueDate ? ` — للتسميع بتاريخ ${formatDate(prep.dueDate)}` : ''}
                  </span>
                  {prep.note && <span className="mt-1 block text-xs text-slate-500">{prep.note}</span>}
                </div>
                <div className="flex items-center gap-2">
                  <Badge
                    className={
                      prep.completedAt ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
                    }
                  >
                    {prep.completedAt ? 'تم التسميع' : 'قيد التحضير'}
                  </Badge>
                  {canManage && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => complete.mutate({ id: prep.id, done: !prep.completedAt })}
                    >
                      {prep.completedAt ? 'إعادة فتح' : 'تم'}
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {open && <PreparationModal student={student} onClose={() => setOpen(false)} />}
    </>
  );
}

function PreparationModal({ student, onClose }: { student: Student; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({
    fromSurah: 'البقرة',
    fromAyah: 1,
    toSurah: 'البقرة',
    toAyah: 20,
    note: '',
    dueDate: '',
  });
  const [error, setError] = useState('');

  const { data: surahs } = useQuery({
    queryKey: ['recitations', 'surahs'],
    queryFn: async () =>
      (await api.get<{ number: number; name: string; ayahs: number }[]>('/recitations/surahs')).data,
    staleTime: Infinity,
  });

  const mutation = useMutation({
    mutationFn: () =>
      api.post('/preparations', {
        studentId: student.id,
        ...form,
        note: form.note || undefined,
        dueDate: form.dueDate || undefined,
      }),
    onSuccess: () => {
      toast.success('تم إنشاء التكليف وإشعار ولي الأمر');
      queryClient.invalidateQueries({ queryKey: ['preparations', student.id] });
      onClose();
    },
    onError: (err) => setError(apiError(err)),
  });

  const set = (key: string, value: unknown) => {
    setForm((f) => ({ ...f, [key]: value }));
    setError('');
  };

  return (
    <Modal
      open
      onClose={onClose}
      title="تكليف تحضير"
      size="md"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            إلغاء
          </Button>
          <Button onClick={() => mutation.mutate()} loading={mutation.isPending}>
            إرسال التكليف
          </Button>
        </>
      }
    >
      {error && (
        <div className="mb-4 rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-xs text-red-700">
          {error}
        </div>
      )}
      <p className="mb-4 rounded-xl bg-sky-50 px-4 py-3 text-xs leading-6 text-sky-800">
        سيصل ولي أمر الطالب إشعار بأن ابنه لديه تحضير من الآية المحددة إلى الآية المحددة، ليجهّزه
        للتسميع القادم.
      </p>

      <div className="grid gap-4 sm:grid-cols-2">
        <Select label="من سورة" value={form.fromSurah} onChange={(e) => set('fromSurah', e.target.value)}>
          {(surahs ?? []).map((x) => (
            <option key={x.number} value={x.name}>
              {x.name}
            </option>
          ))}
        </Select>
        <Input
          label="من آية"
          type="number"
          min={1}
          value={form.fromAyah}
          onChange={(e) => set('fromAyah', Number(e.target.value))}
        />
        <Select label="إلى سورة" value={form.toSurah} onChange={(e) => set('toSurah', e.target.value)}>
          {(surahs ?? []).map((x) => (
            <option key={x.number} value={x.name}>
              {x.name}
            </option>
          ))}
        </Select>
        <Input
          label="إلى آية"
          type="number"
          min={1}
          value={form.toAyah}
          onChange={(e) => set('toAyah', Number(e.target.value))}
        />
        <Input
          label="موعد التسميع"
          type="date"
          value={form.dueDate}
          onChange={(e) => set('dueDate', e.target.value)}
          className="sm:col-span-2"
        />
      </div>
      <Textarea
        label="تعليمات (اختياري)"
        className="mt-4"
        value={form.note}
        onChange={(e) => set('note', e.target.value)}
      />
    </Modal>
  );
}
