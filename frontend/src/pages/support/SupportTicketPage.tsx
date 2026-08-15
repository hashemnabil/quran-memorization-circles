import { FormEvent, useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { api, apiError } from '@/lib/api';
import { useAuthStore } from '@/store/auth';
import {
  Avatar,
  Badge,
  Button,
  Card,
  ErrorState,
  LoadingState,
  PageHeader,
  Select,
  cx,
} from '@/components/ui';
import { IconLifeBuoy, IconSend } from '@/components/ui/Icons';
import {
  ROLE_LABELS,
  TICKET_PRIORITY_COLORS,
  TICKET_PRIORITY_LABELS,
  TICKET_STATUS_COLORS,
  TICKET_STATUS_LABELS,
} from '@/lib/labels';
import { formatDateTime, timeAgo } from '@/lib/format';
import type { SupportTicket } from '@/types';

export default function SupportTicketPage() {
  const { id = '' } = useParams();
  const user = useAuthStore((s) => s.user)!;
  const queryClient = useQueryClient();

  const [body, setBody] = useState('');
  const [isInternal, setIsInternal] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  const isStaff = user.role === 'SUPPORT' || user.role === 'ADMIN';

  const { data: ticket, isLoading, isError, refetch } = useQuery({
    queryKey: ['support', 'ticket', id],
    queryFn: async () => (await api.get<SupportTicket>(`/support/${id}`)).data,
    enabled: !!id,
    refetchInterval: 30000,
  });

  const { data: staff } = useQuery({
    queryKey: ['support', 'staff'],
    queryFn: async () => (await api.get('/support/staff')).data,
    enabled: isStaff,
  });

  const reply = useMutation({
    mutationFn: () => api.post(`/support/${id}/reply`, { body, isInternal }),
    onSuccess: () => {
      setBody('');
      setIsInternal(false);
      queryClient.invalidateQueries({ queryKey: ['support', 'ticket', id] });
      queryClient.invalidateQueries({ queryKey: ['support', 'list'] });
    },
    onError: (error) => toast.error(apiError(error)),
  });

  const update = useMutation({
    mutationFn: (payload: Record<string, unknown>) => api.patch(`/support/${id}`, payload),
    onSuccess: () => {
      toast.success('تم تحديث التذكرة');
      queryClient.invalidateQueries({ queryKey: ['support'] });
    },
    onError: (error) => toast.error(apiError(error)),
  });

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [ticket?.messages?.length]);

  if (isLoading) return <LoadingState rows={5} />;
  if (isError || !ticket) return <ErrorState message="تعذر تحميل التذكرة" onRetry={() => refetch()} />;

  const closed = ticket.status === 'CLOSED';

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!body.trim()) return;
    reply.mutate();
  };

  return (
    <>
      <PageHeader
        title={ticket.subject}
        breadcrumb={
          <Link to="/support" className="hover:text-primary-700">
            الدعم الفني
          </Link>
        }
        subtitle={`تذكرة رقم #${ticket.number} — ${formatDateTime(ticket.createdAt)}`}
        action={
          <>
            <Badge className={TICKET_PRIORITY_COLORS[ticket.priority]}>{TICKET_PRIORITY_LABELS[ticket.priority]}</Badge>
            <Badge className={TICKET_STATUS_COLORS[ticket.status]}>{TICKET_STATUS_LABELS[ticket.status]}</Badge>
          </>
        }
      />

      <div className="grid gap-5 lg:grid-cols-[1fr_18rem]">
        <Card padded={false} className="flex flex-col overflow-hidden">
          <div
            className="flex-1 space-y-4 overflow-y-auto bg-slate-50/60 px-5 py-5"
            style={{ maxHeight: 'calc(100vh - 22rem)', minHeight: '20rem' }}
          >
            {ticket.messages?.map((message) => {
              const mine = message.sender.id === user.id;
              return (
                <div key={message.id} className={cx('flex gap-3', mine && 'flex-row-reverse')}>
                  <Avatar name={message.sender.fullName} src={message.sender.avatarUrl} size={36} />
                  <div className="max-w-[80%]">
                    <p className={cx('mb-1 text-[11px] text-slate-400', mine && 'text-left')}>
                      {message.sender.fullName} • {ROLE_LABELS[message.sender.role]} • {timeAgo(message.createdAt)}
                    </p>
                    <div
                      className={cx(
                        'rounded-2xl px-4 py-3 text-sm leading-6',
                        message.isInternal
                          ? 'border border-dashed border-amber-300 bg-amber-50 text-amber-900'
                          : mine
                            ? 'rounded-tl-md bg-primary-700 text-white'
                            : 'rounded-tr-md border border-slate-100 bg-white text-slate-700',
                      )}
                    >
                      {message.isInternal && (
                        <p className="mb-1 text-[10px] font-bold uppercase tracking-wide">ملاحظة داخلية</p>
                      )}
                      <p className="whitespace-pre-wrap break-words">{message.body}</p>
                    </div>
                  </div>
                </div>
              );
            })}
            <div ref={bottomRef} />
          </div>

          {closed ? (
            <p className="border-t border-slate-100 px-5 py-4 text-center text-xs text-slate-400">
              هذه التذكرة مغلقة. أنشئ طلباً جديداً إذا احتجت مساعدة إضافية.
            </p>
          ) : (
            <form onSubmit={submit} className="border-t border-slate-100 px-4 py-3">
              <div className="flex items-end gap-2">
                <textarea
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      submit(e);
                    }
                  }}
                  rows={2}
                  placeholder="اكتب ردك..."
                  className="input flex-1 resize-none"
                />
                <Button type="submit" loading={reply.isPending} disabled={!body.trim()} icon={<IconSend size={16} />}>
                  إرسال
                </Button>
              </div>
              {isStaff && (
                <label className="mt-2 flex cursor-pointer items-center gap-2 text-xs text-slate-500">
                  <input
                    type="checkbox"
                    checked={isInternal}
                    onChange={(e) => setIsInternal(e.target.checked)}
                    className="h-4 w-4 rounded border-slate-300 text-amber-500 focus:ring-amber-400"
                  />
                  ملاحظة داخلية (لا تظهر لصاحب الطلب)
                </label>
              )}
            </form>
          )}
        </Card>

        <div className="space-y-5">
          <Card title="تفاصيل التذكرة">
            <dl className="space-y-2.5 text-xs">
              <Row label="مقدّم الطلب" value={ticket.createdBy.fullName} />
              <Row label="الدور" value={ROLE_LABELS[ticket.createdBy.role]} />
              <Row label="التصنيف" value={ticket.category} />
              <Row label="تاريخ الإنشاء" value={formatDateTime(ticket.createdAt)} />
              <Row label="آخر تحديث" value={timeAgo(ticket.updatedAt)} />
              <Row label="المسؤول" value={ticket.assignedTo?.fullName} />
            </dl>
          </Card>

          {isStaff && (
            <Card title="إدارة التذكرة">
              <Select
                label="الحالة"
                value={ticket.status}
                onChange={(e) => update.mutate({ status: e.target.value })}
              >
                {Object.entries(TICKET_STATUS_LABELS).map(([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
              </Select>
              <Select
                label="الأولوية"
                className="mt-3"
                value={ticket.priority}
                onChange={(e) => update.mutate({ priority: e.target.value })}
              >
                {Object.entries(TICKET_PRIORITY_LABELS).map(([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
              </Select>
              <Select
                label="الإسناد"
                className="mt-3"
                value={ticket.assignedTo?.id ?? ''}
                onChange={(e) => update.mutate({ assignedToId: e.target.value || null })}
              >
                <option value="">غير مُسندة</option>
                {staff?.map((member: any) => (
                  <option key={member.id} value={member.id}>
                    {member.fullName}
                  </option>
                ))}
              </Select>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <dt className="shrink-0 text-slate-400">{label}</dt>
      <dd className="text-left font-semibold text-slate-700">{value || '—'}</dd>
    </div>
  );
}
