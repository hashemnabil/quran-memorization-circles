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
  Pagination,
  Select,
  Textarea,
  cx,
} from '@/components/ui';
import { IconCheck, IconExchange, IconX } from '@/components/ui/Icons';
import {
  REQUEST_STATUS_COLORS,
  REQUEST_STATUS_LABELS,
  TRANSFER_KIND_LABELS,
} from '@/lib/labels';
import { formatDateTime, timeAgo } from '@/lib/format';
import type { PaginatedResponse, TransferRequest } from '@/types';

export default function TransfersPage() {
  const user = useAuthStore((s) => s.user)!;
  const queryClient = useQueryClient();

  const [status, setStatus] = useState('PENDING');
  const [kind, setKind] = useState('');
  const [page, setPage] = useState(1);
  const [decision, setDecision] = useState<{ request: TransferRequest; approve: boolean } | null>(null);

  const isAdmin = user.role === 'ADMIN';

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['transfers', { status, kind, page }],
    queryFn: async () =>
      (
        await api.get<PaginatedResponse<TransferRequest>>('/transfers', {
          params: { page, limit: 20, status: status || undefined, kind: kind || undefined },
        })
      ).data,
  });

  const cancel = useMutation({
    mutationFn: (id: string) => api.patch(`/transfers/${id}/cancel`),
    onSuccess: () => {
      toast.success('تم إلغاء الطلب');
      queryClient.invalidateQueries({ queryKey: ['transfers'] });
    },
    onError: (error) => toast.error(apiError(error)),
  });

  const describe = (request: TransferRequest) => {
    if (request.kind === 'STUDENT_TRANSFER') {
      return (
        <>
          <Link to={`/students/${request.student?.id}`} className="font-bold text-slate-800 hover:text-primary-700">
            {request.student?.fullName}
          </Link>
          <span className="block text-[11px] text-slate-400">طالب</span>
        </>
      );
    }
    if (request.kind === 'TEACHER_SWAP') {
      return (
        <>
          <span className="font-bold text-slate-800">
            {request.teacherA?.user.fullName} ↔ {request.teacherB?.user.fullName}
          </span>
          <span className="block text-[11px] text-slate-400">تبادل معلمين</span>
        </>
      );
    }
    return (
      <>
        <span className="font-bold text-slate-800">{request.teacherA?.user.fullName ?? '—'}</span>
        <span className="block text-[11px] text-slate-400">معلم</span>
      </>
    );
  };

  return (
    <>
      <PageHeader
        title="طلبات النقل والتبادل"
        subtitle={isAdmin ? 'مراجعة واعتماد طلبات نقل الطلاب والمعلمين' : 'متابعة طلبات النقل التي قدمتها'}
      />

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
            {Object.entries(REQUEST_STATUS_LABELS).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </Select>
          <Select
            label="النوع"
            value={kind}
            onChange={(e) => {
              setKind(e.target.value);
              setPage(1);
            }}
          >
            <option value="">كل الأنواع</option>
            <option value="STUDENT_TRANSFER">نقل طالب</option>
            <option value="TEACHER_TRANSFER">نقل معلم</option>
            <option value="TEACHER_SWAP">تبادل معلمين</option>
          </Select>
        </div>
      </Card>

      <Card padded={false}>
        {isLoading ? (
          <LoadingState />
        ) : isError ? (
          <ErrorState message="تعذر تحميل الطلبات" onRetry={() => refetch()} />
        ) : !data?.data.length ? (
          <EmptyState title="لا توجد طلبات" message="لا توجد طلبات مطابقة للتصفية المحددة." icon={<IconExchange size={24} />} />
        ) : (
          <>
            <div className="table-wrap border-0 shadow-none">
              <table className="table">
                <thead>
                  <tr>
                    <th>الطلب</th>
                    <th>النوع</th>
                    <th>من</th>
                    <th>إلى</th>
                    <th>السبب</th>
                    <th>مقدّم الطلب</th>
                    <th>الحالة</th>
                    <th className="text-center">إجراءات</th>
                  </tr>
                </thead>
                <tbody>
                  {data.data.map((request) => (
                    <tr key={request.id}>
                      <td>{describe(request)}</td>
                      <td>
                        <Badge className="bg-slate-100 text-slate-600">{TRANSFER_KIND_LABELS[request.kind]}</Badge>
                      </td>
                      <td className="text-xs text-slate-500">{request.fromCircle?.name ?? '—'}</td>
                      <td className="text-xs font-semibold text-primary-700">{request.toCircle?.name ?? '—'}</td>
                      <td className="max-w-[16rem] whitespace-normal text-xs text-slate-500">
                        <span className="line-clamp-2">{request.reason ?? '—'}</span>
                      </td>
                      <td className="text-xs text-slate-500">
                        {request.requestedBy.fullName}
                        <span className="block text-[11px] text-slate-400">{timeAgo(request.createdAt)}</span>
                      </td>
                      <td>
                        <Badge className={REQUEST_STATUS_COLORS[request.status]}>
                          {REQUEST_STATUS_LABELS[request.status]}
                        </Badge>
                        {request.decidedAt && (
                          <span className="block text-[11px] text-slate-400">{formatDateTime(request.decidedAt)}</span>
                        )}
                      </td>
                      <td>
                        <div className="flex items-center justify-center gap-1.5">
                          {request.status === 'PENDING' && isAdmin && (
                            <>
                              <Button
                                size="sm"
                                variant="success"
                                icon={<IconCheck size={14} />}
                                onClick={() => setDecision({ request, approve: true })}
                              >
                                موافقة
                              </Button>
                              <Button
                                size="sm"
                                variant="secondary"
                                icon={<IconX size={14} />}
                                onClick={() => setDecision({ request, approve: false })}
                              >
                                رفض
                              </Button>
                            </>
                          )}
                          {request.status === 'PENDING' && !isAdmin && request.requestedBy.id === user.id && (
                            <Button size="sm" variant="secondary" onClick={() => cancel.mutate(request.id)}>
                              إلغاء
                            </Button>
                          )}
                          {request.status !== 'PENDING' && request.decisionNote && (
                            <span className="text-[11px] text-slate-400">{request.decisionNote}</span>
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

      {decision && (
        <DecisionModal
          request={decision.request}
          approve={decision.approve}
          onClose={() => setDecision(null)}
        />
      )}
    </>
  );
}

function DecisionModal({
  request,
  approve,
  onClose,
}: {
  request: TransferRequest;
  approve: boolean;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [note, setNote] = useState(approve ? 'تمت الموافقة' : '');

  const mutation = useMutation({
    mutationFn: () =>
      api.patch(`/transfers/${request.id}/${approve ? 'approve' : 'reject'}`, { decisionNote: note || undefined }),
    onSuccess: () => {
      toast.success(approve ? 'تم اعتماد الطلب وتنفيذ النقل' : 'تم رفض الطلب');
      queryClient.invalidateQueries({ queryKey: ['transfers'] });
      queryClient.invalidateQueries({ queryKey: ['students'] });
      queryClient.invalidateQueries({ queryKey: ['circles'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      onClose();
    },
    onError: (error) => toast.error(apiError(error)),
  });

  return (
    <Modal
      open
      onClose={onClose}
      title={approve ? 'الموافقة على الطلب' : 'رفض الطلب'}
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            إلغاء
          </Button>
          <Button variant={approve ? 'success' : 'danger'} onClick={() => mutation.mutate()} loading={mutation.isPending}>
            {approve ? 'اعتماد وتنفيذ' : 'رفض الطلب'}
          </Button>
        </>
      }
    >
      <div
        className={cx(
          'mb-4 rounded-xl px-4 py-3 text-xs',
          approve ? 'bg-emerald-50 text-emerald-800' : 'bg-red-50 text-red-800',
        )}
      >
        {approve
          ? 'سيتم تنفيذ النقل مباشرة بعد الاعتماد مع حفظ سجل الحركة وإشعار الأطراف المعنية.'
          : 'سيتم إشعار مقدّم الطلب بالرفض.'}
      </div>

      <dl className="mb-4 space-y-1.5 rounded-xl bg-slate-50 px-4 py-3 text-xs">
        <div className="flex justify-between">
          <dt className="text-slate-400">النوع</dt>
          <dd className="font-bold text-slate-700">{TRANSFER_KIND_LABELS[request.kind]}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-slate-400">من</dt>
          <dd className="font-bold text-slate-700">{request.fromCircle?.name ?? '—'}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-slate-400">إلى</dt>
          <dd className="font-bold text-slate-700">{request.toCircle?.name ?? '—'}</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="shrink-0 text-slate-400">السبب</dt>
          <dd className="text-left text-slate-600">{request.reason}</dd>
        </div>
      </dl>

      <Textarea label="ملاحظة القرار" value={note} onChange={(e) => setNote(e.target.value)} />
    </Modal>
  );
}
