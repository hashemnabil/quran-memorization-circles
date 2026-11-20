import { useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Card, ErrorState, LoadingState } from '@/components/ui';
import { formatDateTime } from '@/lib/format';
import { EXAM_REQUEST_STATUS_LABELS, EXAM_STATUS_LABELS, REQUEST_STATUS_LABELS } from '@/lib/labels';
import type { Exam, ExamRequest, Suspension, TransferRequest } from '@/types';

/** Deep links must show the named record even when the list's current filter excludes it. */
export default function NotificationRecord() {
  const { pathname } = useLocation();
  const match = /^\/(exams\/requests|exams|transfers|suspensions)\/([0-9a-f-]{36})\/?$/i.exec(pathname);
  const detail = useQuery({
    queryKey: [pathname.split('/')[1], 'notification-detail', pathname],
    enabled: !!match,
    queryFn: async () => (await api.get<Exam | ExamRequest | Suspension | TransferRequest>(pathname)).data,
  });
  if (!match) return null;
  const record = detail.data;
  const labels: Record<string, string> = match[1] === 'exams/requests' ? EXAM_REQUEST_STATUS_LABELS
    : match[1] === 'exams' ? EXAM_STATUS_LABELS : REQUEST_STATUS_LABELS;
  return (
    <Card title="تفاصيل الإشعار" className="mb-5">
      {detail.isLoading ? <LoadingState /> : !record ? (
        <ErrorState message="تعذر فتح السجل المرتبط بالإشعار؛ قد يكون محذوفاً أو غير متاح لحسابك" onRetry={() => detail.refetch()} />
      ) : (
        <dl className="grid gap-4 text-sm sm:grid-cols-2" aria-label="السجل المرتبط بالإشعار">
          <div><dt className="text-slate-500">الاسم</dt><dd className="font-bold">{record.student?.fullName || ('teacherA' in record && record.teacherA?.user.fullName) || '—'}</dd></div>
          <div><dt className="text-slate-500">الحالة</dt><dd>{labels[record.status] || record.status}</dd></div>
          {'scheduledAt' in record && <div><dt className="text-slate-500">موعد الاختبار</dt><dd>{formatDateTime(record.scheduledAt)}</dd></div>}
          {'location' in record && record.location && <div><dt className="text-slate-500">المكان</dt><dd>{record.location}</dd></div>}
          {'result' in record && record.result && <div><dt className="text-slate-500">النتيجة</dt><dd>{record.result === 'PASSED' ? 'ناجح' : 'راسب'}</dd></div>}
          {'score' in record && record.score != null && <div><dt className="text-slate-500">الدرجة</dt><dd>{record.score}</dd></div>}
          {'reason' in record && record.reason && <div><dt className="text-slate-500">السبب</dt><dd className="whitespace-pre-wrap">{record.reason}</dd></div>}
          {'decisionNote' in record && record.decisionNote && <div><dt className="text-slate-500">قرار الإدارة</dt><dd className="whitespace-pre-wrap">{record.decisionNote}</dd></div>}
          {'reviewNote' in record && record.reviewNote && <div><dt className="text-slate-500">ملاحظة المراجعة</dt><dd>{record.reviewNote}</dd></div>}
          {'toCircle' in record && record.toCircle && <div><dt className="text-slate-500">الحلقة المطلوبة</dt><dd>{record.toCircle.name}</dd></div>}
        </dl>
      )}
    </Card>
  );
}
