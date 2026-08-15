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
  ProgressBar,
  Select,
  StatCard,
  Tabs,
  Textarea,
  cx,
} from '@/components/ui';
import { IconCheck, IconClock, IconPause, IconX } from '@/components/ui/Icons';
import { REQUEST_STATUS_COLORS, REQUEST_STATUS_LABELS } from '@/lib/labels';
import { formatDate, formatDateShort, timeAgo } from '@/lib/format';
import type { PaginatedResponse, Suspension } from '@/types';

export default function SuspensionsPage() {
  const user = useAuthStore((s) => s.user)!;
  const [tab, setTab] = useState('active');

  const { data: active } = useQuery({
    queryKey: ['suspensions', 'active'],
    queryFn: async () => (await api.get<Suspension[]>('/suspensions/active')).data,
  });

  const { data: pending } = useQuery({
    queryKey: ['suspensions', { status: 'PENDING', count: true }],
    queryFn: async () =>
      (await api.get<PaginatedResponse<Suspension>>('/suspensions', { params: { status: 'PENDING', limit: 1 } })).data.meta
        .total,
  });

  return (
    <>
      <PageHeader
        title="إيقاف الطلاب"
        subtitle={
          user.role === 'ADMIN'
            ? 'مراجعة طلبات الإيقاف ومتابعة الطلاب الموقوفين'
            : 'متابعة طلبات الإيقاف التي قدمتها'
        }
      />

      <div className="mb-5 grid gap-4 sm:grid-cols-3">
        <StatCard label="موقوفون حالياً" value={active?.length ?? 0} icon={<IconPause size={22} />} tone="red" />
        <StatCard label="طلبات معلقة" value={pending ?? 0} icon={<IconClock size={22} />} tone="amber" />
        <StatCard
          label="ينتهي إيقافهم خلال أسبوع"
          value={active?.filter((s) => s.remainingDays <= 7).length ?? 0}
          icon={<IconCheck size={22} />}
          tone="emerald"
        />
      </div>

      <Tabs
        tabs={[
          { key: 'active', label: 'الموقوفون حالياً', badge: active?.length },
          { key: 'requests', label: 'الطلبات', badge: pending },
        ]}
        active={tab}
        onChange={setTab}
      />

      {tab === 'active' ? <ActiveTab suspensions={active ?? []} /> : <RequestsTab />}
    </>
  );
}

function ActiveTab({ suspensions }: { suspensions: Suspension[] }) {
  const user = useAuthStore((s) => s.user)!;
  const [returning, setReturning] = useState<Suspension | null>(null);

  if (!suspensions.length) {
    return (
      <Card>
        <EmptyState title="لا يوجد طلاب موقوفون" message="جميع الطلاب منتظمون في حلقاتهم." icon={<IconPause size={24} />} />
      </Card>
    );
  }

  return (
    <>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {suspensions.map((s) => (
          <article key={s.id} className="card p-5">
            <header className="mb-3 flex items-start justify-between gap-2">
              <div className="min-w-0">
                <Link to={`/students/${s.student.id}`} className="block truncate font-extrabold text-slate-800 hover:text-primary-700">
                  {s.student.fullName}
                </Link>
                <p className="numeric text-[11px] text-slate-400">
                  {s.student.code} • {s.student.circle?.name}
                </p>
              </div>
              <Badge className="bg-red-100 text-red-800 shrink-0">
                <span className="numeric">{s.remainingDays}</span> يوم
              </Badge>
            </header>

            <p className="mb-3 rounded-xl bg-slate-50 px-3.5 py-2.5 text-xs leading-6 text-slate-600">{s.reason}</p>

            <dl className="mb-3 space-y-1.5 text-xs">
              <div className="flex justify-between">
                <dt className="text-slate-400">البداية</dt>
                <dd className="numeric font-semibold text-slate-700">{formatDateShort(s.startDate)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-slate-400">النهاية</dt>
                <dd className="numeric font-semibold text-slate-700">{formatDateShort(s.endDate)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-slate-400">المدة</dt>
                <dd className="numeric font-semibold text-slate-700">{s.durationDays} يوم</dd>
              </div>
            </dl>

            <div className="mb-4">
              <ProgressBar
                value={s.durationDays - s.remainingDays}
                max={s.durationDays}
                tone={s.remainingDays <= 3 ? 'emerald' : 'amber'}
                showLabel
              />
              <p className="mt-1 text-[11px] text-slate-400">نسبة المدة المنقضية</p>
            </div>

            {user.role === 'ADMIN' && (
              <Button variant="success" size="sm" className="w-full" onClick={() => setReturning(s)}>
                إرجاع الطالب للحلقة
              </Button>
            )}
          </article>
        ))}
      </div>

      {returning && <ReturnModal suspension={returning} onClose={() => setReturning(null)} />}
    </>
  );
}

function RequestsTab() {
  const user = useAuthStore((s) => s.user)!;
  const queryClient = useQueryClient();

  const [status, setStatus] = useState('PENDING');
  const [page, setPage] = useState(1);
  const [decision, setDecision] = useState<{ request: Suspension; approve: boolean } | null>(null);

  const isAdmin = user.role === 'ADMIN';

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['suspensions', { status, page }],
    queryFn: async () =>
      (
        await api.get<PaginatedResponse<Suspension>>('/suspensions', {
          params: { page, limit: 20, status: status || undefined },
        })
      ).data,
  });

  const cancel = useMutation({
    mutationFn: (id: string) => api.patch(`/suspensions/${id}/cancel`),
    onSuccess: () => {
      toast.success('تم إلغاء الطلب');
      queryClient.invalidateQueries({ queryKey: ['suspensions'] });
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
          {Object.entries(REQUEST_STATUS_LABELS).map(([key, label]) => (
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
          <ErrorState message="تعذر تحميل الطلبات" onRetry={() => refetch()} />
        ) : !data?.data.length ? (
          <EmptyState title="لا توجد طلبات" icon={<IconPause size={24} />} />
        ) : (
          <>
            <div className="table-wrap border-0 shadow-none">
              <table className="table">
                <thead>
                  <tr>
                    <th>الطالب</th>
                    <th>الحلقة</th>
                    <th>السبب</th>
                    <th>المدة</th>
                    <th>الفترة</th>
                    <th>مقدّم الطلب</th>
                    <th>الحالة</th>
                    <th className="text-center">إجراءات</th>
                  </tr>
                </thead>
                <tbody>
                  {data.data.map((request) => (
                    <tr key={request.id}>
                      <td>
                        <Link to={`/students/${request.student.id}`} className="font-bold text-slate-800 hover:text-primary-700">
                          {request.student.fullName}
                        </Link>
                        <span className="numeric block text-[11px] text-slate-400">{request.student.code}</span>
                      </td>
                      <td className="text-xs text-slate-500">{request.student.circle?.name ?? '—'}</td>
                      <td className="max-w-[16rem] whitespace-normal text-xs text-slate-500">
                        <span className="line-clamp-2">{request.reason}</span>
                      </td>
                      <td className="numeric font-bold">{request.durationDays} يوم</td>
                      <td className="numeric text-[11px] text-slate-500">
                        {formatDateShort(request.startDate)}
                        <br />
                        {formatDateShort(request.endDate)}
                      </td>
                      <td className="text-xs text-slate-500">
                        {request.requestedBy.fullName}
                        <span className="block text-[11px] text-slate-400">{timeAgo(request.createdAt)}</span>
                      </td>
                      <td>
                        <Badge className={REQUEST_STATUS_COLORS[request.status]}>
                          {REQUEST_STATUS_LABELS[request.status]}
                        </Badge>
                        {request.returnedAt && (
                          <span className="block text-[11px] text-emerald-600">تمت العودة</span>
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
                          {request.decisionNote && request.status !== 'PENDING' && (
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
        <DecisionModal request={decision.request} approve={decision.approve} onClose={() => setDecision(null)} />
      )}
    </>
  );
}

function DecisionModal({
  request,
  approve,
  onClose,
}: {
  request: Suspension;
  approve: boolean;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [note, setNote] = useState(approve ? 'تمت الموافقة' : '');

  const mutation = useMutation({
    mutationFn: () =>
      api.patch(`/suspensions/${request.id}/${approve ? 'approve' : 'reject'}`, { decisionNote: note || undefined }),
    onSuccess: () => {
      toast.success(approve ? 'تم اعتماد الإيقاف وإشعار ولي الأمر' : 'تم رفض الطلب');
      queryClient.invalidateQueries({ queryKey: ['suspensions'] });
      queryClient.invalidateQueries({ queryKey: ['students'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      onClose();
    },
    onError: (error) => toast.error(apiError(error)),
  });

  return (
    <Modal
      open
      onClose={onClose}
      title={approve ? 'الموافقة على الإيقاف' : 'رفض طلب الإيقاف'}
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            إلغاء
          </Button>
          <Button variant={approve ? 'danger' : 'secondary'} onClick={() => mutation.mutate()} loading={mutation.isPending}>
            {approve ? 'اعتماد الإيقاف' : 'رفض الطلب'}
          </Button>
        </>
      }
    >
      <div
        className={cx(
          'mb-4 rounded-xl px-4 py-3 text-xs',
          approve ? 'bg-red-50 text-red-800' : 'bg-slate-50 text-slate-600',
        )}
      >
        {approve
          ? `سيتم إيقاف "${request.student.fullName}" لمدة ${request.durationDays} يوماً وإشعار ولي الأمر بالقرار.`
          : 'سيتم إشعار مقدّم الطلب بالرفض ويبقى الطالب منتظماً.'}
      </div>

      <dl className="mb-4 space-y-1.5 rounded-xl bg-slate-50 px-4 py-3 text-xs">
        <div className="flex justify-between">
          <dt className="text-slate-400">المدة</dt>
          <dd className="numeric font-bold text-slate-700">{request.durationDays} يوم</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-slate-400">من</dt>
          <dd className="numeric font-bold text-slate-700">{formatDate(request.startDate)}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-slate-400">إلى</dt>
          <dd className="numeric font-bold text-slate-700">{formatDate(request.endDate)}</dd>
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

function ReturnModal({ suspension, onClose }: { suspension: Suspension; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [note, setNote] = useState('');

  const mutation = useMutation({
    mutationFn: () => api.patch(`/suspensions/${suspension.id}/return`, { note: note || undefined }),
    onSuccess: () => {
      toast.success('تم إرجاع الطالب إلى الحلقة');
      queryClient.invalidateQueries({ queryKey: ['suspensions'] });
      queryClient.invalidateQueries({ queryKey: ['students'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      onClose();
    },
    onError: (error) => toast.error(apiError(error)),
  });

  return (
    <Modal
      open
      onClose={onClose}
      title="إرجاع الطالب"
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            إلغاء
          </Button>
          <Button variant="success" onClick={() => mutation.mutate()} loading={mutation.isPending}>
            تأكيد الإرجاع
          </Button>
        </>
      }
    >
      <p className="mb-4 rounded-xl bg-emerald-50 px-4 py-3 text-xs text-emerald-800">
        سيعود <span className="font-bold">{suspension.student.fullName}</span> إلى حالة "منتظم" فوراً، وسيتم إشعار
        المعلم وولي الأمر. المتبقي من مدة الإيقاف:{' '}
        <span className="numeric font-bold">{suspension.remainingDays}</span> يوم.
      </p>
      <Textarea label="ملاحظة (اختياري)" value={note} onChange={(e) => setNote(e.target.value)} />
    </Modal>
  );
}
