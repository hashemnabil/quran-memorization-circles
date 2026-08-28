// src/pages/exams/ExamsPage.tsx

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
  LoadingState,
  Modal,
  PageHeader,
  Select,
  StatCard,
  Tabs,
  Textarea,
  cx,
} from '@/components/ui';
import { useConfirm } from '@/components/ui/Modal/ConfirmContext';
import {
  IconCheck,
  IconClock,
  IconEdit,
  IconEye,
  IconPlus,
  IconTrash,
  IconX,
} from '@/components/ui/Icons';
import {
  EXAM_STATUS_COLORS,
  EXAM_STATUS_LABELS,
  EXAM_TYPE_LABELS,
  describeExamSections,
} from '@/lib/labels';
import { formatDate, formatDateShort, formatDateTime, timeAgo } from '@/lib/format';
import type { Exam, ExamDirection, ExamEligibility, ExamRequest, PaginatedResponse } from '@/types';

// ============================================================================
// MAIN PAGE
// ============================================================================

export default function ExamsPage() {
  const user = useAuthStore((s) => s.user)!;
  const queryClient = useQueryClient();
  const confirm = useConfirm();

  const [tab, setTab] = useState('requests');
  const [modal, setModal] = useState<'create' | 'edit' | 'view' | null>(null);
  const [selectedExam, setSelectedExam] = useState<Exam | null>(null);

  const canManage = ['ADMIN', 'SUPERVISOR', 'EXAMINER'].includes(user.role);

  // Fetch exam requests
  const { data: requests, isLoading: requestsLoading, isError: requestsError, refetch: refetchRequests } = useQuery({
    queryKey: ['exams', 'requests'],
    queryFn: async () => (await api.get<PaginatedResponse<ExamRequest>>('/exams/requests')).data,
    enabled: tab === 'requests',
  });

  // Fetch scheduled exams
  const { data: exams, isLoading: examsLoading, isError: examsError, refetch: refetchExams } = useQuery({
    queryKey: ['exams', 'scheduled'],
    queryFn: async () => (await api.get<PaginatedResponse<Exam>>('/exams', { params: { status: 'SCHEDULED' } })).data,
    enabled: tab === 'scheduled',
  });

  // Fetch exam history
  const { data: history, isLoading: historyLoading, isError: historyError, refetch: refetchHistory } = useQuery({
    queryKey: ['exams', 'history'],
    queryFn: async () => (await api.get<PaginatedResponse<Exam>>('/exams', { params: { status: 'COMPLETED' } })).data,
    enabled: tab === 'history',
  });

  // Approve exam request
  const approveRequest = useMutation({
    mutationFn: (requestId: string) => api.patch(`/exams/requests/${requestId}/approve`),
    onSuccess: () => {
      toast.success('تمت الموافقة على طلب الاختبار');
      queryClient.invalidateQueries({ queryKey: ['exams'] });
      refetchRequests();
    },
    onError: (error) => toast.error(apiError(error)),
  });

  // Reject exam request
  const rejectRequest = useMutation({
    mutationFn: ({ requestId, reason }: { requestId: string; reason: string }) =>
      api.patch(`/exams/requests/${requestId}/reject`, { reason }),
    onSuccess: () => {
      toast.success('تم رفض طلب الاختبار');
      queryClient.invalidateQueries({ queryKey: ['exams'] });
      refetchRequests();
    },
    onError: (error) => toast.error(apiError(error)),
  });

  // Delete exam
  const deleteExam = useMutation({
    mutationFn: (examId: string) => api.delete(`/exams/${examId}`),
    onSuccess: () => {
      toast.success('تم حذف الاختبار');
      queryClient.invalidateQueries({ queryKey: ['exams'] });
      refetchExams();
    },
    onError: (error) => toast.error(apiError(error)),
  });

  const tabs = [
    { key: 'requests', label: 'طلبات الاختبار' },
    { key: 'scheduled', label: 'الاختبارات المجدولة' },
    { key: 'history', label: 'سجل الاختبارات' },
  ];

  return (
    <>
      <PageHeader
        title="الاختبارات"
        subtitle="إدارة اختبارات الطلاب"
        action={
          canManage && (
            <Button size="sm" icon={<IconPlus size={15} />} onClick={() => setModal('create')}>
              اختبار جديد
            </Button>
          )
        }
      />

      <Tabs tabs={tabs} active={tab} onChange={setTab} />

      {tab === 'requests' && (
        <RequestsTab
          data={requests}
          loading={requestsLoading}
          error={requestsError}
          onRetry={refetchRequests}
          onApprove={(id) => approveRequest.mutate(id)}
          onReject={(id, reason) => rejectRequest.mutate({ requestId: id, reason })}
          isPending={approveRequest.isPending || rejectRequest.isPending}
          canManage={canManage}
        />
      )}

      {tab === 'scheduled' && (
        <ScheduledTab
          data={exams}
          loading={examsLoading}
          error={examsError}
          onRetry={refetchExams}
          onDelete={(id) => deleteExam.mutate(id)}
          onView={(exam) => {
            setSelectedExam(exam);
            setModal('view');
          }}
          onEdit={(exam) => {
            setSelectedExam(exam);
            setModal('edit');
          }}
          canManage={canManage}
          isPending={deleteExam.isPending}
        />
      )}

      {tab === 'history' && (
        <HistoryTab
          data={history}
          loading={historyLoading}
          error={historyError}
          onRetry={refetchHistory}
          onView={(exam) => {
            setSelectedExam(exam);
            setModal('view');
          }}
        />
      )}

      {modal === 'create' && <CreateExamModal onClose={() => setModal(null)} />}
      {modal === 'edit' && selectedExam && (
        <EditExamModal exam={selectedExam} onClose={() => { setModal(null); setSelectedExam(null); }} />
      )}
      {modal === 'view' && selectedExam && (
        <ViewExamModal exam={selectedExam} onClose={() => { setModal(null); setSelectedExam(null); }} />
      )}
    </>
  );
}

// ============================================================================
// REQUESTS TAB
// ============================================================================

function RequestsTab({
  data,
  loading,
  error,
  onRetry,
  onApprove,
  onReject,
  isPending,
  canManage,
}: {
  data?: PaginatedResponse<ExamRequest>;
  loading: boolean;
  error: boolean;
  onRetry: () => void;
  onApprove: (id: string) => void;
  onReject: (id: string, reason: string) => void;
  isPending: boolean;
  canManage: boolean;
}) {
  const [rejectModal, setRejectModal] = useState<{ id: string; reason: string } | null>(null);

  if (loading) return <LoadingState rows={5} />;
  if (error || !data) return <ErrorState message="تعذر تحميل طلبات الاختبار" onRetry={onRetry} />;

  const requests = data.data;

  if (requests.length === 0) {
    return <EmptyState title="لا توجد طلبات اختبار" icon={<IconClock size={24} />} />;
  }

  return (
    <>
      <Card title="طلبات الاختبار" subtitle="الطلبات المقدمة من المعلمين" padded={false}>
        <div className="table-wrap border-0 shadow-none">
          <table className="table">
            <thead>
              <tr>
                <th>الطالب</th>
                <th>المطلوب</th>
                <th>المعلم</th>
                <th>التاريخ</th>
                <th>الحالة</th>
                {canManage && <th>إجراء</th>}
              </tr>
            </thead>
            <tbody>
              {requests.map((request) => (
                <tr key={request.id}>
                  <td>
                    <Link to={`/students/${request.studentId}`} className="font-semibold hover:text-primary-700">
                      {request.studentName}
                    </Link>
                  </td>
                  <td className="text-sm">{describeExamSections(request.section, request.sections)}</td>
                  <td className="text-sm text-slate-600">{request.teacherName}</td>
                  <td className="numeric">{formatDateShort(request.createdAt)}</td>
                  <td>
                    <Badge className={EXAM_STATUS_COLORS[request.status]}>
                      {EXAM_STATUS_LABELS[request.status]}
                    </Badge>
                  </td>
                  {canManage && request.status === 'PENDING' && (
                    <td>
                      <div className="flex items-center gap-1">
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-emerald-600 hover:bg-emerald-50"
                          onClick={() => onApprove(request.id)}
                          loading={isPending}
                        >
                          <IconCheck size={16} />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-red-600 hover:bg-red-50"
                          onClick={() => setRejectModal({ id: request.id, reason: '' })}
                          loading={isPending}
                        >
                          <IconX size={16} />
                        </Button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {rejectModal && (
        <Modal
          open
          onClose={() => setRejectModal(null)}
          title="رفض طلب الاختبار"
          size="sm"
          footer={
            <>
              <Button variant="secondary" onClick={() => setRejectModal(null)}>
                إلغاء
              </Button>
              <Button
                variant="danger"
                onClick={() => {
                  if (rejectModal.reason.trim()) {
                    onReject(rejectModal.id, rejectModal.reason);
                    setRejectModal(null);
                  } else {
                    toast.error('يرجى كتابة سبب الرفض');
                  }
                }}
                loading={isPending}
                disabled={!rejectModal.reason.trim()}
              >
                رفض
              </Button>
            </>
          }
        >
          <Textarea
            label="سبب الرفض"
            required
            rows={3}
            value={rejectModal.reason}
            onChange={(e) => setRejectModal({ ...rejectModal, reason: e.target.value })}
            placeholder="اذكر سبب رفض طلب الاختبار..."
          />
        </Modal>
      )}
    </>
  );
}

// ============================================================================
// SCHEDULED TAB
// ============================================================================

function ScheduledTab({
  data,
  loading,
  error,
  onRetry,
  onDelete,
  onView,
  onEdit,
  canManage,
  isPending,
}: {
  data?: PaginatedResponse<Exam>;
  loading: boolean;
  error: boolean;
  onRetry: () => void;
  onDelete: (id: string) => void;
  onView: (exam: Exam) => void;
  onEdit: (exam: Exam) => void;
  canManage: boolean;
  isPending: boolean;
}) {
  const confirm = useConfirm();

  if (loading) return <LoadingState rows={5} />;
  if (error || !data) return <ErrorState message="تعذر تحميل الاختبارات المجدولة" onRetry={onRetry} />;

  const exams = data.data;

  if (exams.length === 0) {
    return <EmptyState title="لا توجد اختبارات مجدولة" icon={<IconClock size={24} />} />;
  }

  return (
    <Card title="الاختبارات المجدولة" padded={false}>
      <div className="table-wrap border-0 shadow-none">
        <table className="table">
          <thead>
            <tr>
              <th>الطالب</th>
              <th>المدى</th>
              <th>التاريخ</th>
              <th>اللجنة</th>
              <th>الحالة</th>
              <th>إجراء</th>
            </tr>
          </thead>
          <tbody>
            {exams.map((exam) => (
              <tr key={exam.id}>
                <td>
                  <Link to={`/students/${exam.studentId}`} className="font-semibold hover:text-primary-700">
                    {exam.studentName}
                  </Link>
                </td>
                <td className="text-sm">{describeExamSections(exam.section, exam.sections)}</td>
                <td className="numeric">{formatDateShort(exam.scheduledAt)}</td>
                <td className="text-sm text-slate-600">{exam.examinerName || 'غير محدد'}</td>
                <td>
                  <Badge className={EXAM_STATUS_COLORS[exam.status]}>
                    {EXAM_STATUS_LABELS[exam.status]}
                  </Badge>
                </td>
                <td>
                  <div className="flex items-center gap-1">
                    <Button size="sm" variant="ghost" onClick={() => onView(exam)}>
                      <IconEye size={16} />
                    </Button>
                    {canManage && (
                      <>
                        <Button size="sm" variant="ghost" onClick={() => onEdit(exam)}>
                          <IconEdit size={16} />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-red-600 hover:bg-red-50"
                          onClick={async () => {
                            const ok = await confirm({
                              title: 'حذف الاختبار',
                              message: 'سيتم حذف هذا الاختبار نهائياً. هل أنت متأكد؟',
                              confirmLabel: 'حذف',
                              variant: 'danger',
                            });
                            if (ok) onDelete(exam.id);
                          }}
                          loading={isPending}
                        >
                          <IconTrash size={16} />
                        </Button>
                      </>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

// ============================================================================
// HISTORY TAB
// ============================================================================

function HistoryTab({
  data,
  loading,
  error,
  onRetry,
  onView,
}: {
  data?: PaginatedResponse<Exam>;
  loading: boolean;
  error: boolean;
  onRetry: () => void;
  onView: (exam: Exam) => void;
}) {
  if (loading) return <LoadingState rows={5} />;
  if (error || !data) return <ErrorState message="تعذر تحميل سجل الاختبارات" onRetry={onRetry} />;

  const exams = data.data;

  if (exams.length === 0) {
    return <EmptyState title="لا توجد اختبارات سابقة" icon={<IconClock size={24} />} />;
  }

  return (
    <Card title="سجل الاختبارات" padded={false}>
      <div className="table-wrap border-0 shadow-none">
        <table className="table">
          <thead>
            <tr>
              <th>الطالب</th>
              <th>المدى</th>
              <th>التاريخ</th>
              <th>النتيجة</th>
              <th>الدرجة</th>
              <th>إجراء</th>
            </tr>
          </thead>
          <tbody>
            {exams.map((exam) => (
              <tr key={exam.id}>
                <td>
                  <Link to={`/students/${exam.studentId}`} className="font-semibold hover:text-primary-700">
                    {exam.studentName}
                  </Link>
                </td>
                <td className="text-sm">{describeExamSections(exam.section, exam.sections)}</td>
                <td className="numeric">{formatDateShort(exam.scheduledAt)}</td>
                <td>
                  <Badge
                    className={exam.result === 'PASSED' ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-800'}
                  >
                    {exam.result === 'PASSED' ? 'ناجح' : 'لم يجتز'}
                  </Badge>
                </td>
                <td className="numeric">{exam.score ?? '—'}</td>
                <td>
                  <Button size="sm" variant="ghost" onClick={() => onView(exam)}>
                    <IconEye size={16} />
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

// ============================================================================
// MODALS
// ============================================================================

function CreateExamModal({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({
    studentId: '',
    section: '',
    sections: '',
    scheduledAt: '',
    examinerId: '',
    notes: '',
  });
  const [error, setError] = useState('');

  const { data: students } = useQuery({
    queryKey: ['students', 'options'],
    queryFn: async () => (await api.get<{ id: string; fullName: string; code: string }[]>('/students/options')).data,
  });

  const { data: examiners } = useQuery({
    queryKey: ['users', 'examiners'],
    queryFn: async () => (await api.get<{ id: string; fullName: string }[]>('/users/examiners')).data,
  });

  const mutation = useMutation({
    mutationFn: () => api.post('/exams', form),
    onSuccess: () => {
      toast.success('تم إنشاء الاختبار');
      queryClient.invalidateQueries({ queryKey: ['exams'] });
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
      title="إنشاء اختبار جديد"
      size="md"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            إلغاء
          </Button>
          <Button
            onClick={() => mutation.mutate()}
            loading={mutation.isPending}
            disabled={!form.studentId || !form.section || !form.scheduledAt}
          >
            إنشاء الاختبار
          </Button>
        </>
      }
    >
      {error && (
        <div className="mb-4 rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-xs text-red-700">
          {error}
        </div>
      )}

      <div className="space-y-4">
        <Select
          label="الطالب"
          required
          value={form.studentId}
          onChange={(e) => set('studentId', e.target.value)}
        >
          <option value="">اختر الطالب</option>
          {(students ?? []).map((s) => (
            <option key={s.id} value={s.id}>
              {s.fullName} ({s.code})
            </option>
          ))}
        </Select>

        <Input
          label="المدى (مثال: 1-5)"
          required
          value={form.section}
          onChange={(e) => set('section', e.target.value)}
          placeholder="مثال: 1-5"
        />

        <Input
          label="الأجزاء (اختياري)"
          value={form.sections}
          onChange={(e) => set('sections', e.target.value)}
          placeholder="مثال: 1,2,3"
        />

        <Input
          label="تاريخ الاختبار"
          type="datetime-local"
          required
          value={form.scheduledAt}
          onChange={(e) => set('scheduledAt', e.target.value)}
        />

        <Select
          label="الممتحن"
          value={form.examinerId}
          onChange={(e) => set('examinerId', e.target.value)}
        >
          <option value="">اختر الممتحن</option>
          {(examiners ?? []).map((e) => (
            <option key={e.id} value={e.id}>
              {e.fullName}
            </option>
          ))}
        </Select>

        <Textarea
          label="ملاحظات"
          value={form.notes}
          onChange={(e) => set('notes', e.target.value)}
        />
      </div>
    </Modal>
  );
}

function EditExamModal({ exam, onClose }: { exam: Exam; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({
    section: exam.section,
    sections: exam.sections || '',
    scheduledAt: exam.scheduledAt.slice(0, 16),
    examinerId: exam.examinerId || '',
    notes: exam.notes || '',
    result: exam.result || '',
    score: exam.score ?? '',
  });
  const [error, setError] = useState('');

  const { data: examiners } = useQuery({
    queryKey: ['users', 'examiners'],
    queryFn: async () => (await api.get<{ id: string; fullName: string }[]>('/users/examiners')).data,
  });

  const mutation = useMutation({
    mutationFn: () => api.patch(`/exams/${exam.id}`, form),
    onSuccess: () => {
      toast.success('تم تحديث الاختبار');
      queryClient.invalidateQueries({ queryKey: ['exams'] });
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
      title="تعديل الاختبار"
      size="md"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            إلغاء
          </Button>
          <Button
            onClick={() => mutation.mutate()}
            loading={mutation.isPending}
            disabled={!form.section || !form.scheduledAt}
          >
            حفظ التعديلات
          </Button>
        </>
      }
    >
      {error && (
        <div className="mb-4 rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-xs text-red-700">
          {error}
        </div>
      )}

      <div className="space-y-4">
        <Input
          label="المدى (مثال: 1-5)"
          required
          value={form.section}
          onChange={(e) => set('section', e.target.value)}
        />

        <Input
          label="الأجزاء (اختياري)"
          value={form.sections}
          onChange={(e) => set('sections', e.target.value)}
        />

        <Input
          label="تاريخ الاختبار"
          type="datetime-local"
          required
          value={form.scheduledAt}
          onChange={(e) => set('scheduledAt', e.target.value)}
        />

        <Select
          label="الممتحن"
          value={form.examinerId}
          onChange={(e) => set('examinerId', e.target.value)}
        >
          <option value="">اختر الممتحن</option>
          {(examiners ?? []).map((e) => (
            <option key={e.id} value={e.id}>
              {e.fullName}
            </option>
          ))}
        </Select>

        <Select
          label="النتيجة"
          value={form.result}
          onChange={(e) => set('result', e.target.value)}
        >
          <option value="">غير محدد</option>
          <option value="PASSED">ناجح</option>
          <option value="FAILED">لم يجتز</option>
        </Select>

        {form.result && (
          <Input
            label="الدرجة"
            type="number"
            min={0}
            max={100}
            value={form.score}
            onChange={(e) => set('score', e.target.value ? Number(e.target.value) : '')}
          />
        )}

        <Textarea
          label="ملاحظات"
          value={form.notes}
          onChange={(e) => set('notes', e.target.value)}
        />
      </div>
    </Modal>
  );
}

function ViewExamModal({ exam, onClose }: { exam: Exam; onClose: () => void }) {
  return (
    <Modal
      open
      onClose={onClose}
      title="تفاصيل الاختبار"
      size="md"
      footer={
        <Button variant="secondary" onClick={onClose}>
          إغلاق
        </Button>
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-xs text-slate-400">الطالب</p>
            <p className="font-semibold">{exam.studentName}</p>
          </div>
          <div>
            <p className="text-xs text-slate-400">المدى</p>
            <p className="font-semibold">{describeExamSections(exam.section, exam.sections)}</p>
          </div>
          <div>
            <p className="text-xs text-slate-400">التاريخ</p>
            <p className="font-semibold">{formatDateTime(exam.scheduledAt)}</p>
          </div>
          <div>
            <p className="text-xs text-slate-400">الحالة</p>
            <Badge className={EXAM_STATUS_COLORS[exam.status]}>
              {EXAM_STATUS_LABELS[exam.status]}
            </Badge>
          </div>
          <div>
            <p className="text-xs text-slate-400">الممتحن</p>
            <p className="font-semibold">{exam.examinerName || 'غير محدد'}</p>
          </div>
          {exam.result && (
            <>
              <div>
                <p className="text-xs text-slate-400">النتيجة</p>
                <Badge
                  className={
                    exam.result === 'PASSED' ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-800'
                  }
                >
                  {exam.result === 'PASSED' ? 'ناجح' : 'لم يجتز'}
                </Badge>
              </div>
              <div>
                <p className="text-xs text-slate-400">الدرجة</p>
                <p className="font-semibold">{exam.score ?? '—'}</p>
              </div>
            </>
          )}
        </div>
        {exam.notes && (
          <div>
            <p className="text-xs text-slate-400">ملاحظات</p>
            <p className="text-sm text-slate-700">{exam.notes}</p>
          </div>
        )}
        {exam.resultComments && (
          <div>
            <p className="text-xs text-slate-400">تعليقات النتيجة</p>
            <p className="text-sm text-slate-700">{exam.resultComments}</p>
          </div>
        )}
      </div>
    </Modal>
  );
}
