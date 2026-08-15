import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { api, apiError } from '@/lib/api';
import { PHONE_HINT, phoneError } from '@/lib/validation';
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
  EVALUATION_COLORS,
  EVALUATION_LABELS,
  EXAM_STATUS_COLORS,
  EXAM_STATUS_LABELS,
  RECITATION_TYPE_LABELS,
  REQUEST_STATUS_COLORS,
  REQUEST_STATUS_LABELS,
  STUDENT_STATUS_COLORS,
  STUDENT_STATUS_LABELS,
} from '@/lib/labels';
import { calcAge, formatDate, formatDateShort, formatDateTime, timeAgo } from '@/lib/format';
import type {
  AttendanceRecord,
  Circle,
  Evaluation,
  ExamEligibility,
  PaginatedResponse,
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
    { key: 'notes', label: 'الملاحظات' },
    { key: 'history', label: 'السجل' },
  ];

  return (
    <>
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

      {student.activeSuspension && (
        <div className="mb-5 flex flex-wrap items-center gap-3 rounded-2xl border border-red-100 bg-red-50 px-5 py-4">
          <IconPause size={20} className="text-red-600" />
          <div className="flex-1">
            <p className="text-sm font-bold text-red-800">
              الطالب موقوف — متبقٍ <span className="numeric">{student.activeSuspension.remainingDays}</span> يوم
            </p>
            <p className="text-xs text-red-700">
              السبب: {student.activeSuspension.reason} — حتى {formatDate(student.activeSuspension.endDate)}
            </p>
          </div>
        </div>
      )}

      <div className="mb-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
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
        <StatCard label="الأجزاء المحفوظة" value={student.memorizedParts} icon={<IconBook size={22} />} hint="من 30 جزءاً" />
        <StatCard
          label="جلسات التسميع"
          value={progress?.totalSessions ?? 0}
          icon={<IconBook size={22} />}
          tone="sky"
          hint={progress?.totalPages ? `${progress.totalPages} صفحة` : undefined}
        />
        <StatCard
          label="الاختبارات المجتازة"
          value={student.examSummary?.passed ?? 0}
          icon={<IconAward size={22} />}
          tone="purple"
          hint={student.examSummary?.lastPassedSection ?? undefined}
        />
      </div>

      <Tabs tabs={tabs} active={tab} onChange={setTab} />

      {tab === 'overview' && <OverviewTab student={student} progress={progress} />}
      {tab === 'attendance' && <AttendanceTab records={attendance?.data ?? []} summary={student.attendanceSummary} />}
      {tab === 'recitations' && <RecitationsTab records={recitations?.data ?? []} progress={progress} />}
      {tab === 'exams' && <ExamsTab eligibility={eligibility} exams={exams?.data ?? []} />}
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
            <span className="numeric font-bold text-slate-700">{student.memorizedParts} / 30</span>
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

      {student.notes && (
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

function RecitationsTab({ records, progress }: { records: Recitation[]; progress: any }) {
  return (
    <div className="space-y-5">
      {progress && (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard label="عدد الجلسات" value={progress.totalSessions} tone="sky" />
          <StatCard label="إجمالي الصفحات" value={progress.totalPages} tone="emerald" />
          {/* التسميع اليومي يُقيَّم بتقدير عام، فيُعرض توزيع التقديرات بدل متوسط درجة. */}
          <StatCard
            label="تقديرات ممتاز/جيد جداً"
            value={countEvaluations(progress, ['EXCELLENT', 'VERY_GOOD'])}
            tone="primary"
          />
          <StatCard
            label="تقديرات تحتاج متابعة"
            value={countEvaluations(progress, ['ACCEPTABLE', 'UNSATISFACTORY'])}
            tone="amber"
          />
        </div>
      )}

      <Card title="سجل التسميع" padded={false}>
        {records.length ? (
          <div className="table-wrap border-0 shadow-none">
            <table className="table">
              <thead>
                <tr>
                  <th>التاريخ</th>
                  <th>النوع</th>
                  <th>من</th>
                  <th>إلى</th>
                  <th>الصفحات</th>
                  <th>التقييم</th>
                  <th>المعلم</th>
                </tr>
              </thead>
              <tbody>
                {records.map((rec) => (
                  <tr key={rec.id}>
                    <td className="numeric">{formatDateShort(rec.date)}</td>
                    <td>
                      <Badge className="bg-slate-100 text-slate-600">{RECITATION_TYPE_LABELS[rec.type]}</Badge>
                    </td>
                    <td className="text-sm">
                      {rec.fromSurah} <span className="numeric text-slate-400">({rec.fromAyah})</span>
                    </td>
                    <td className="text-sm">
                      {rec.toSurah} <span className="numeric text-slate-400">({rec.toAyah})</span>
                    </td>
                    <td className="numeric">{rec.pagesCount ?? '—'}</td>
                    <td>
                      {rec.evaluation ? (
                        <Badge className={EVALUATION_COLORS[rec.evaluation]}>
                          {EVALUATION_LABELS[rec.evaluation]}
                        </Badge>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="text-xs text-slate-500">{rec.teacher?.user.fullName}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState title="لا توجد سجلات تسميع" icon={<IconBook size={24} />} />
        )}
      </Card>
    </div>
  );
}

/** Human wording for what the student is waiting on, shown under the progress map. */
function describeNext(eligibility: ExamEligibility) {
  if (eligibility.isComplete) return 'اكتمل المسار';
  if (eligibility.nextSection) return `المقرر التالي: ${eligibility.nextSection.name}`;
  if (eligibility.pendingSection) return `بانتظار البتّ في طلب «${eligibility.pendingSection.name}»`;
  return 'لا يوجد مقرر متاح حالياً';
}

function ExamsTab({ eligibility, exams }: { eligibility?: ExamEligibility; exams: any[] }) {
  return (
    <div className="space-y-5">
      {eligibility && (
        <Card
          title="مسار الاختبارات"
          subtitle={`تم اجتياز ${eligibility.passedCount} من ${eligibility.totalSections} مقرراً — ${describeNext(
            eligibility,
          )}`}
        >
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-5 lg:grid-cols-10">
            {eligibility.progression.map((section) => (
              <div
                key={section.id}
                title={section.reason ?? (section.eligible ? 'متاح للاختبار' : '')}
                className={cx(
                  'rounded-xl border px-2 py-2.5 text-center text-[11px] font-bold transition',
                  section.isPassed
                    ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                    : section.hasOpenRequest
                      ? 'border-sky-200 bg-sky-50 text-sky-800'
                      : section.eligible
                        ? 'border-gold-300 bg-gold-50 text-gold-800'
                        : 'border-slate-100 bg-slate-50 text-slate-300',
                )}
              >
                {section.name}
                {section.score != null && <span className="numeric mt-0.5 block text-[10px]">{section.score}</span>}
              </div>
            ))}
          </div>
          <div className="mt-3 flex flex-wrap gap-3 text-[11px] text-slate-500">
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded bg-emerald-400" /> مجتاز
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded bg-sky-400" /> طلب قائم
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded bg-gold-400" /> متاح الآن
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded bg-slate-200" /> مغلق حتى اجتياز ما قبله
            </span>
          </div>
        </Card>
      )}

      <Card title="سجل الاختبارات" padded={false}>
        {exams.length ? (
          <div className="table-wrap border-0 shadow-none">
            <table className="table">
              <thead>
                <tr>
                  <th>المقرر</th>
                  <th>الموعد</th>
                  <th>الممتحن</th>
                  <th>الحالة</th>
                  <th>الدرجة</th>
                  <th>النتيجة</th>
                </tr>
              </thead>
              <tbody>
                {exams.map((exam) => (
                  <tr key={exam.id}>
                    <td className="font-semibold text-slate-700">{exam.section.name}</td>
                    <td className="text-xs text-slate-500">{formatDateTime(exam.scheduledAt)}</td>
                    <td className="text-xs text-slate-500">{exam.examiner?.fullName ?? '—'}</td>
                    <td>
                      <Badge className={EXAM_STATUS_COLORS[exam.status as keyof typeof EXAM_STATUS_COLORS]}>
                        {EXAM_STATUS_LABELS[exam.status as keyof typeof EXAM_STATUS_LABELS]}
                      </Badge>
                    </td>
                    <td className="numeric font-bold">{exam.score ?? '—'}</td>
                    <td>
                      {exam.result ? (
                        <Badge className={exam.result === 'PASSED' ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-800'}>
                          {exam.result === 'PASSED' ? 'ناجح' : 'لم يجتز'}
                        </Badge>
                      ) : (
                        '—'
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState title="لا توجد اختبارات" icon={<IconAward size={24} />} />
        )}
      </Card>
    </div>
  );
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
                  <p className="text-sm font-semibold text-slate-700">{e.section.name}</p>
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

function TransferModal({ student, onClose }: { student: Student; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [toCircleId, setToCircleId] = useState('');
  const [reason, setReason] = useState('');

  const { data: circles } = useQuery({
    queryKey: ['circles', 'options'],
    queryFn: async () => (await api.get<Pick<Circle, 'id' | 'name' | 'code'>[]>('/circles/options')).data,
  });

  const mutation = useMutation({
    mutationFn: () => api.post('/transfers/students', { studentId: student.id, toCircleId, reason }),
    onSuccess: () => {
      toast.success('تم إرسال طلب النقل إلى الإدارة');
      queryClient.invalidateQueries({ queryKey: ['transfers'] });
      onClose();
    },
    onError: (error) => toast.error(apiError(error)),
  });

  const options = circles?.filter((c) => c.id !== student.circleId) ?? [];

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
          <Button onClick={() => mutation.mutate()} loading={mutation.isPending} disabled={!toCircleId || !reason.trim()}>
            إرسال الطلب
          </Button>
        </>
      }
    >
      <p className="mb-4 rounded-xl bg-slate-50 px-4 py-3 text-xs text-slate-500">
        الحلقة الحالية: <span className="font-bold text-slate-700">{student.circle?.name ?? 'غير مسجل'}</span>
        <br />
        يُرسل الطلب إلى الإدارة لاعتماده قبل تنفيذ النقل.
      </p>
      <Select label="الحلقة المطلوبة" required value={toCircleId} onChange={(e) => setToCircleId(e.target.value)}>
        <option value="">اختر الحلقة</option>
        {options.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name} ({c.code})
          </option>
        ))}
      </Select>
      <Textarea
        label="سبب النقل"
        required
        className="mt-3"
        value={reason}
        onChange={(e) => setReason(e.target.value)}
      />
    </Modal>
  );
}

function SuspendModal({ student, onClose }: { student: Student; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [reason, setReason] = useState('');
  const [durationDays, setDurationDays] = useState(14);

  const mutation = useMutation({
    mutationFn: () => api.post('/suspensions', { studentId: student.id, reason, durationDays }),
    onSuccess: () => {
      toast.success('تم إرسال طلب الإيقاف إلى الإدارة');
      queryClient.invalidateQueries({ queryKey: ['suspensions'] });
      onClose();
    },
    onError: (error) => toast.error(apiError(error)),
  });

  return (
    <Modal
      open
      onClose={onClose}
      title="طلب إيقاف الطالب"
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
            disabled={!reason.trim() || durationDays < 1}
          >
            إرسال الطلب
          </Button>
        </>
      }
    >
      <p className="mb-4 rounded-xl bg-amber-50 px-4 py-3 text-xs text-amber-800">
        سيتم إيقاف الطالب فقط بعد موافقة الإدارة، وسيُشعَر ولي الأمر بالقرار.
      </p>
      <Input
        label="مدة الإيقاف (بالأيام)"
        type="number"
        required
        min={1}
        max={365}
        value={durationDays}
        onChange={(e) => setDurationDays(Number(e.target.value))}
      />
      <Textarea label="سبب الإيقاف" required className="mt-3" value={reason} onChange={(e) => setReason(e.target.value)} />
    </Modal>
  );
}

function ExamRequestModal({ student, onClose }: { student: Student; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [sectionId, setSectionId] = useState('');
  const [note, setNote] = useState('');

  const { data: eligibility, isLoading } = useQuery({
    queryKey: ['exams', 'eligibility', student.id],
    queryFn: async () => (await api.get<ExamEligibility>(`/exams/eligibility/${student.id}`)).data,
  });

  const mutation = useMutation({
    mutationFn: () => api.post('/exams/requests', { studentId: student.id, sectionId, note: note || undefined }),
    onSuccess: () => {
      toast.success('تم إرسال طلب الاختبار إلى لجنة الاختبارات');
      queryClient.invalidateQueries({ queryKey: ['exams'] });
      onClose();
    },
    onError: (error) => toast.error(apiError(error)),
  });

  const available = eligibility?.progression.filter((s) => s.eligible) ?? [];

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
          <Button onClick={() => mutation.mutate()} loading={mutation.isPending} disabled={!sectionId}>
            إرسال الطلب
          </Button>
        </>
      }
    >
      {isLoading ? (
        <LoadingState rows={2} />
      ) : available.length === 0 ? (
        /* Say exactly what is blocking the request instead of a generic message:
           an open request, or a section that still has to be passed. */
        <EmptyState
          title={
            eligibility?.isComplete
              ? 'اكتملت جميع المقررات'
              : eligibility?.pendingSection
                ? `يوجد طلب قائم لمقرر «${eligibility.pendingSection.name}»`
                : 'لا يوجد مقرر متاح حالياً'
          }
          message={
            eligibility?.isComplete
              ? 'اجتاز الطالب كل مقررات البرنامج، ولا يوجد مقرر جديد لطلبه.'
              : eligibility?.pendingSection
                ? 'لا يمكن طلب مقرر جديد قبل أن تبتّ اللجنة في الطلب القائم أو يُلغى.'
                : 'يجب اجتياز المقرر السابق أولاً قبل التقدم لمقرر جديد.'
          }
          icon={<IconAward size={24} />}
        />
      ) : (
        <>
          <p className="mb-4 rounded-xl bg-slate-50 px-4 py-3 text-xs text-slate-500">
            تم اجتياز <span className="numeric font-bold">{eligibility?.passedCount}</span> من{' '}
            <span className="numeric font-bold">{eligibility?.totalSections}</span> مقرراً. لا يمكن التقدم
            لمقرر قبل اجتياز الذي يسبقه.
          </p>
          <Select label="المقرر" required value={sectionId} onChange={(e) => setSectionId(e.target.value)}>
            <option value="">اختر المقرر</option>
            {available.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </Select>
          <Textarea label="ملاحظة للجنة (اختياري)" className="mt-3" value={note} onChange={(e) => setNote(e.target.value)} />
        </>
      )}
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
    notes: student.notes ?? '',
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
          onChange={(e) => set('memorizedParts', Number(e.target.value))}
        />
        <Input label="السورة الحالية" value={form.currentSurah} onChange={(e) => set('currentSurah', e.target.value)} />
        <Textarea label="ملاحظات" value={form.notes} onChange={(e) => set('notes', e.target.value)} className="sm:col-span-2" />
      </div>
    </Modal>
  );
}
