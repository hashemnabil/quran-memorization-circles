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
  ProgressBar,
  Select,
  StatCard,
  Tabs,
  Textarea,
  cx,
} from '@/components/ui';
import { IconAlert, IconCheck, IconClock, IconPause, IconX } from '@/components/ui/Icons';
import {
  REQUEST_STATUS_COLORS,
  REQUEST_STATUS_LABELS,
  SUSPENSION_ACTION_COLORS,
  SUSPENSION_ACTION_LABELS,
} from '@/lib/labels';
import { formatDate, formatDateShort, timeAgo } from '@/lib/format';
import type { PaginatedResponse, Suspension, SuspensionAction } from '@/types';

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
        <StatCard
          label="موقوفون حالياً"
          value={active?.filter((s) => s.action === 'SUSPEND').length ?? 0}
          icon={<IconPause size={22} />}
          tone="red"
        />
        <StatCard label="طلبات معلقة" value={pending ?? 0} icon={<IconClock size={22} />} tone="amber" />
        <StatCard
          label="في برنامج النشاط"
          value={active?.filter((s) => s.action === 'ACTIVITY_PROGRAM').length ?? 0}
          icon={<IconCheck size={22} />}
          tone="amber"
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
              <Badge className={cx('shrink-0', s.action ? SUSPENSION_ACTION_COLORS[s.action] : '')}>
                {s.action === 'ACTIVITY_PROGRAM' ? (
                  'برنامج النشاط'
                ) : s.action === 'PERMANENT' ? (
                  'نهائي'
                ) : (
                  <>
                    <span className="numeric">{s.remainingDays ?? 0}</span> يوم
                  </>
                )}
              </Badge>
            </header>

            <p className="mb-3 rounded-xl bg-slate-50 px-3.5 py-2.5 text-xs leading-6 text-slate-600">{s.reason}</p>

            <dl className="mb-3 space-y-1.5 text-xs">
              <div className="flex justify-between">
                <dt className="text-slate-400">الإجراء</dt>
                <dd className="font-semibold text-slate-700">
                  {s.action ? SUSPENSION_ACTION_LABELS[s.action] : '—'}
                </dd>
              </div>
              {s.action === 'SUSPEND' && (
                <>
                  <div className="flex justify-between">
                    <dt className="text-slate-400">البداية</dt>
                    <dd className="numeric font-semibold text-slate-700">
                      {s.startDate ? formatDateShort(s.startDate) : '—'}
                    </dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-slate-400">النهاية</dt>
                    <dd className="numeric font-semibold text-slate-700">
                      {s.endDate ? formatDateShort(s.endDate) : '—'}
                    </dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-slate-400">المدة</dt>
                    <dd className="numeric font-semibold text-slate-700">{s.durationDays} يوم</dd>
                  </div>
                </>
              )}
            </dl>

            {s.action === 'ACTIVITY_PROGRAM' ? (
              <p className="mb-4 rounded-xl bg-amber-50 px-3.5 py-2.5 text-[11px] leading-6 text-amber-800">
                الطالب خارج حلقات التحفيظ وما زال مسجّلاً في السجل الموحّد. يبقى في برنامج النشاط
                حتى تُسنَد له حلقة.
              </p>
            ) : s.action === 'PERMANENT' ? (
              <p className="mb-4 rounded-xl bg-slate-100 px-3.5 py-2.5 text-[11px] leading-6 text-slate-700">
                إيقاف نهائي بلا مدة: انتهى تسجيل الطالب في المدرسة، وبقي ملفه كاملاً في السجل
                الموحّد. لا يعود إلا بقرار من الإدارة.
              </p>
            ) : (
              <div className="mb-4">
                <ProgressBar
                  value={(s.durationDays ?? 0) - (s.remainingDays ?? 0)}
                  max={s.durationDays ?? 1}
                  tone={(s.remainingDays ?? 0) <= 3 ? 'emerald' : 'amber'}
                  showLabel
                />
                <p className="mt-1 text-[11px] text-slate-400">نسبة المدة المنقضية</p>
              </div>
            )}

            {user.role === 'ADMIN' && (
              <Button variant="success" size="sm" className="w-full" onClick={() => setReturning(s)}>
                {s.action === 'ACTIVITY_PROGRAM'
                  ? 'إسناد الطالب إلى حلقة'
                  : s.action === 'PERMANENT'
                    ? 'إلغاء الإيقاف النهائي وإعادته'
                    : 'إرجاع الطالب للحلقة'}
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
                      <td className="text-xs">
                        {request.action ? (
                          <Badge
                            className={
                              request.action === 'ACTIVITY_PROGRAM'
                                ? 'bg-amber-100 text-amber-800'
                                : 'bg-red-100 text-red-800'
                            }
                          >
                            {SUSPENSION_ACTION_LABELS[request.action]}
                          </Badge>
                        ) : (
                          <span className="text-slate-400">بانتظار قرار الإدارة</span>
                        )}
                        {request.durationDays ? (
                          <span className="numeric mt-1 block text-[11px] text-slate-500">
                            {request.durationDays} يوم
                          </span>
                        ) : null}
                      </td>
                      <td className="numeric text-[11px] text-slate-500">
                        {request.startDate ? formatDateShort(request.startDate) : '—'}
                        {request.endDate ? (
                          <>
                            <br />
                            {formatDateShort(request.endDate)}
                          </>
                        ) : null}
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
  // The requester supplied only a reason; the outcome is decided here.
  const [action, setAction] = useState<SuspensionAction>('SUSPEND');
  const [durationDays, setDurationDays] = useState(14);
  const [startDate, setStartDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [error, setError] = useState('');

  const mutation = useMutation({
    mutationFn: () =>
      api.patch(`/suspensions/${request.id}/${approve ? 'approve' : 'reject'}`, {
        decisionNote: note || undefined,
        ...(approve
          ? {
              action,
              ...(action === 'SUSPEND' ? { durationDays, startDate } : {}),
            }
          : {}),
      }),
    onSuccess: () => {
      toast.success(
        approve
          ? action === 'ACTIVITY_PROGRAM'
            ? 'تم تحويل الطالب إلى برنامج النشاط'
            : action === 'PERMANENT'
              ? 'تم إيقاف الطالب نهائياً وإشعار ولي الأمر'
              : 'تم اعتماد الإيقاف وإشعار ولي الأمر'
          : 'تم رفض الطلب',
      );
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
      title={approve ? 'البت في الطلب' : 'رفض الطلب'}
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            إلغاء
          </Button>
          <Button
            variant={approve ? 'danger' : 'secondary'}
            onClick={() => {
              if (approve && action === 'SUSPEND' && (!durationDays || durationDays < 1)) {
                setError('حدد مدة الإيقاف بالأيام');
                return;
              }
              setError('');
              mutation.mutate();
            }}
            loading={mutation.isPending}
          >
            {approve ? 'اعتماد القرار' : 'رفض الطلب'}
          </Button>
        </>
      }
    >
      <div
        className={cx(
          'mb-4 rounded-xl px-4 py-3 text-xs',
          approve ? 'bg-slate-50 text-slate-600' : 'bg-slate-50 text-slate-600',
        )}
      >
        {approve
          ? `راجع سبب الطلب واختر الإجراء المناسب لـ "${request.student.fullName}". سيتم إشعار ولي الأمر بالقرار.`
          : 'سيتم إشعار مقدّم الطلب بالرفض ويبقى الطالب منتظماً في حلقته.'}
      </div>

      <dl className="mb-4 space-y-1.5 rounded-xl bg-slate-50 px-4 py-3 text-xs">
        <div className="flex justify-between">
          <dt className="text-slate-400">الطالب</dt>
          <dd className="font-bold text-slate-700">{request.student.fullName}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-slate-400">الحلقة</dt>
          <dd className="font-bold text-slate-700">{request.student.circle?.name ?? '—'}</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="shrink-0 text-slate-400">السبب</dt>
          <dd className="text-left text-slate-600">{request.reason}</dd>
        </div>
      </dl>

      {approve && (
        <div className="mb-4 space-y-3">
          <span className="label">الإجراء</span>

          <button
            type="button"
            onClick={() => setAction('ACTIVITY_PROGRAM')}
            className={cx(
              'w-full rounded-xl border px-4 py-3 text-right transition',
              action === 'ACTIVITY_PROGRAM'
                ? 'border-amber-400 bg-amber-50'
                : 'border-slate-200 hover:border-slate-300',
            )}
          >
            <span className="block text-sm font-bold text-slate-800">
              {SUSPENSION_ACTION_LABELS.ACTIVITY_PROGRAM}
            </span>
            <span className="mt-0.5 block text-xs leading-6 text-slate-500">
              يخرج الطالب من الحلقة ويبقى في السجل الموحّد — للطالب الذي لا يقرأ بعد، أو صغير السن،
              أو يحتاج تهيئة قبل الالتحاق بحلقة.
            </span>
          </button>

          <button
            type="button"
            onClick={() => setAction('SUSPEND')}
            className={cx(
              'w-full rounded-xl border px-4 py-3 text-right transition',
              action === 'SUSPEND'
                ? 'border-red-400 bg-red-50'
                : 'border-slate-200 hover:border-slate-300',
            )}
          >
            <span className="block text-sm font-bold text-slate-800">
              {SUSPENSION_ACTION_LABELS.SUSPEND}
            </span>
            <span className="mt-0.5 block text-xs leading-6 text-slate-500">
              يبقى الطالب في حلقته مع تحديد مدة الإيقاف.
            </span>
          </button>

          {/* The last resort, and it reads like one. */}
          <button
            type="button"
            onClick={() => setAction('PERMANENT')}
            className={cx(
              'w-full rounded-xl border px-4 py-3 text-right transition',
              action === 'PERMANENT'
                ? 'border-slate-800 bg-slate-100'
                : 'border-slate-200 hover:border-slate-300',
            )}
          >
            <span className="block text-sm font-bold text-slate-800">
              {SUSPENSION_ACTION_LABELS.PERMANENT}
            </span>
            <span className="mt-0.5 block text-xs leading-6 text-slate-500">
              ينتهي تسجيل الطالب في المدرسة بلا مدة: يخرج من حلقته ويصبح «منسحباً»، ويبقى ملفه
              كاملاً في السجل الموحّد. لا يعود إلا بقرار من الإدارة.
            </span>
          </button>

          {action === 'PERMANENT' && (
            <div className="flex items-start gap-2 rounded-xl border border-slate-300 bg-slate-50 px-3.5 py-3 text-xs leading-6 text-slate-700">
              <IconAlert size={15} className="mt-1 shrink-0" />
              <span>
                هذا إجراء نهائي بلا تاريخ انتهاء. سيُشعَر ولي الأمر، وستُغلق عضوية الطالب في حلقته،
                ولن يظهر في كشوف الحضور أو التسميع.
              </span>
            </div>
          )}

          {action === 'SUSPEND' && (
            <div className="grid gap-3 sm:grid-cols-2">
              <Input
                label="مدة الإيقاف (بالأيام)"
                type="number"
                min={1}
                max={365}
                required
                value={durationDays}
                onChange={(e) => {
                  setDurationDays(Number(e.target.value));
                  setError('');
                }}
                error={error}
              />
              <Input
                label="تاريخ البداية"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>
          )}
        </div>
      )}

      <Textarea label="ملاحظة القرار" value={note} onChange={(e) => setNote(e.target.value)} />
    </Modal>
  );
}

function ReturnModal({ suspension, onClose }: { suspension: Suspension; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [note, setNote] = useState('');
  const [circleId, setCircleId] = useState('');
  const [error, setError] = useState('');

  // A student coming back from the activity programme was removed from their
  // circle on the way in, so somebody has to say where they are going.
  const fromActivity = suspension.action === 'ACTIVITY_PROGRAM';

  const { data: circles } = useQuery({
    queryKey: ['circles', 'options'],
    queryFn: async () =>
      (await api.get<{ id: string; name: string; code: string }[]>('/circles/options')).data,
    enabled: fromActivity,
  });

  const mutation = useMutation({
    mutationFn: () =>
      api.patch(`/suspensions/${suspension.id}/return`, {
        note: note || undefined,
        ...(circleId ? { circleId } : {}),
      }),
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
      title={fromActivity ? 'إسناد الطالب إلى حلقة' : 'إرجاع الطالب'}
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            إلغاء
          </Button>
          <Button
            variant="success"
            onClick={() => {
              if (fromActivity && !circleId) {
                setError('حدد الحلقة التي سيلتحق بها الطالب');
                return;
              }
              setError('');
              mutation.mutate();
            }}
            loading={mutation.isPending}
          >
            تأكيد
          </Button>
        </>
      }
    >
      <p className="mb-4 rounded-xl bg-emerald-50 px-4 py-3 text-xs text-emerald-800">
        سيعود <span className="font-bold">{suspension.student.fullName}</span> إلى حالة "منتظم" فوراً،
        وسيتم إشعار المعلم وولي الأمر.
        {!fromActivity && suspension.remainingDays != null && (
          <>
            {' '}المتبقي من مدة الإيقاف:{' '}
            <span className="numeric font-bold">{suspension.remainingDays}</span> يوم.
          </>
        )}
      </p>

      {fromActivity && (
        <Select
          label="الحلقة"
          required
          value={circleId}
          onChange={(e) => {
            setCircleId(e.target.value);
            setError('');
          }}
          error={error}
          className="mb-4"
        >
          <option value="">— اختر الحلقة —</option>
          {(circles ?? []).map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
      )}

      <Textarea label="ملاحظة (اختياري)" value={note} onChange={(e) => setNote(e.target.value)} />
    </Modal>
  );
}
