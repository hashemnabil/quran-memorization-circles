import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { api, apiError } from '@/lib/api';
import { useAuthStore } from '@/store/auth';
import {
  Avatar,
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
  SearchInput,
  Select,
  StatCard,
  Textarea,
} from '@/components/ui';
import { IconLifeBuoy, IconPlus } from '@/components/ui/Icons';
import {
  TICKET_PRIORITY_COLORS,
  TICKET_PRIORITY_LABELS,
  TICKET_STATUS_COLORS,
  TICKET_STATUS_LABELS,
  ticketRequesterName,
  isGuestTicket,
} from '@/lib/labels';
import { timeAgo } from '@/lib/format';
import { useDebounce } from '@/hooks/useDebounce';
import type { PaginatedResponse, SupportTicket } from '@/types';

export default function SupportPage() {
  const user = useAuthStore((s) => s.user)!;
  const isStaff = user.role === 'SUPPORT' || user.role === 'ADMIN';

  const [status, setStatus] = useState('');
  const [priority, setPriority] = useState('');
  const [mine, setMine] = useState(false);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [showForm, setShowForm] = useState(false);

  const debouncedSearch = useDebounce(search);

  const { data: stats } = useQuery({
    queryKey: ['support', 'stats'],
    queryFn: async () => (await api.get('/support/stats')).data,
  });

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['support', 'list', { status, priority, mine, debouncedSearch, page }],
    queryFn: async () =>
      (
        await api.get<PaginatedResponse<SupportTicket>>('/support', {
          params: {
            page,
            limit: 20,
            status: status || undefined,
            priority: priority || undefined,
            mine: mine ? 'true' : undefined,
            search: debouncedSearch || undefined,
          },
        })
      ).data,
  });

  return (
    <>
      <PageHeader
        title="الدعم الفني"
        subtitle={isStaff ? 'إدارة تذاكر الدعم والرد على المستخدمين' : 'طلبات الدعم الخاصة بك'}
        action={
          <Button icon={<IconPlus size={17} />} onClick={() => setShowForm(true)}>
            طلب دعم جديد
          </Button>
        }
      />

      {stats && (
        <div className="mb-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard label="مفتوحة" value={stats.OPEN} icon={<IconLifeBuoy size={22} />} tone="amber" />
          <StatCard label="قيد المعالجة" value={stats.IN_PROGRESS} icon={<IconLifeBuoy size={22} />} tone="sky" />
          <StatCard label="تم حلها" value={stats.RESOLVED} icon={<IconLifeBuoy size={22} />} tone="emerald" />
          <StatCard
            label={isStaff ? 'مُسندة إليّ' : 'مغلقة'}
            value={isStaff ? stats.assignedToMe : stats.CLOSED}
            icon={<IconLifeBuoy size={22} />}
            tone="slate"
          />
        </div>
      )}

      <Card className="mb-5">
        {!isStaff && (
          <p className="mb-3 rounded-xl bg-sky-50 px-4 py-3 text-xs leading-6 text-sky-800">
            هذه صفحتك الخاصة: ترى فيها طلباتك أنت فقط وردود فريق الدعم عليها. لا يمكن الاطلاع على
            طلبات المستخدمين الآخرين.
          </p>
        )}
        <div className={isStaff ? 'grid gap-3 sm:grid-cols-2 lg:grid-cols-4' : 'grid gap-3 sm:grid-cols-2'}>
          <SearchInput
            value={search}
            onChange={(v) => {
              setSearch(v);
              setPage(1);
            }}
            placeholder={isStaff ? 'بحث في التذاكر...' : 'بحث في طلباتي...'}
          />
          <Select
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setPage(1);
            }}
          >
            <option value="">كل الحالات</option>
            {Object.entries(TICKET_STATUS_LABELS).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </Select>
          {isStaff && (
            <Select
              value={priority}
              onChange={(e) => {
                setPriority(e.target.value);
                setPage(1);
              }}
            >
              <option value="">كل الأولويات</option>
              {Object.entries(TICKET_PRIORITY_LABELS).map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </Select>
          )}
          {isStaff && (
            <label className="flex cursor-pointer items-center gap-2 rounded-xl border border-slate-200 px-3.5 text-sm text-slate-600">
              <input
                type="checkbox"
                checked={mine}
                onChange={(e) => {
                  setMine(e.target.checked);
                  setPage(1);
                }}
                className="h-4 w-4 rounded border-slate-300 text-primary-600 focus:ring-primary-400"
              />
              المُسندة إليّ فقط
            </label>
          )}
        </div>
      </Card>

      <Card padded={false}>
        {isLoading ? (
          <LoadingState />
        ) : isError ? (
          <ErrorState message="تعذر تحميل تذاكر الدعم" onRetry={() => refetch()} />
        ) : !data?.data.length ? (
          <EmptyState
            title="لا توجد تذاكر"
            message="أنشئ طلب دعم جديد إذا واجهت أي مشكلة."
            icon={<IconLifeBuoy size={24} />}
          />
        ) : (
          <>
            <ul className="divide-y divide-slate-100">
              {data.data.map((ticket) => (
                <li key={ticket.id}>
                  <Link to={`/support/${ticket.id}`} className="flex flex-wrap items-center gap-3 px-5 py-4 transition hover:bg-slate-50">
                    <span className="numeric shrink-0 rounded-lg bg-slate-100 px-2 py-1 text-xs font-bold text-slate-500">
                      #{ticket.number}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-bold text-slate-800">{ticket.subject}</p>
                      <p className="mt-0.5 flex flex-wrap items-center gap-2 text-[11px] text-slate-400">
                        <span>{ticketRequesterName(ticket)}</span>
                        {isGuestTicket(ticket) && (
                          <Badge className="bg-slate-100 text-[10px] text-slate-500">من صفحة الدخول</Badge>
                        )}
                        <span>•</span>
                        <span>{timeAgo(ticket.createdAt)}</span>
                        {ticket.category && (
                          <>
                            <span>•</span>
                            <span>{ticket.category}</span>
                          </>
                        )}
                        {ticket._count && (
                          <>
                            <span>•</span>
                            <span className="numeric">{ticket._count.messages} رسالة</span>
                          </>
                        )}
                      </p>
                    </div>
                    {ticket.assignedTo && (
                      <span className="hidden items-center gap-1.5 text-[11px] text-slate-500 sm:flex">
                        <Avatar name={ticket.assignedTo.fullName} size={22} />
                        {ticket.assignedTo.fullName}
                      </span>
                    )}
                    <Badge className={TICKET_PRIORITY_COLORS[ticket.priority]}>{TICKET_PRIORITY_LABELS[ticket.priority]}</Badge>
                    <Badge className={TICKET_STATUS_COLORS[ticket.status]}>{TICKET_STATUS_LABELS[ticket.status]}</Badge>
                  </Link>
                </li>
              ))}
            </ul>
            <Pagination page={data.meta.page} totalPages={data.meta.totalPages} total={data.meta.total} onChange={setPage} />
          </>
        )}
      </Card>

      {showForm && <NewTicketModal onClose={() => setShowForm(false)} />}
    </>
  );
}

function NewTicketModal({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient();
  const [subject, setSubject] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('مشكلة تقنية');
  const [priority, setPriority] = useState('NORMAL');

  const create = useMutation({
    mutationFn: () => api.post('/support', { subject, description, category, priority }),
    onSuccess: () => {
      toast.success('تم إرسال طلب الدعم');
      queryClient.invalidateQueries({ queryKey: ['support'] });
      onClose();
    },
    onError: (error) => toast.error(apiError(error)),
  });

  return (
    <Modal
      open
      onClose={onClose}
      title="طلب دعم فني جديد"
      size="md"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            إلغاء
          </Button>
          <Button onClick={() => create.mutate()} loading={create.isPending} disabled={!subject.trim() || !description.trim()}>
            إرسال الطلب
          </Button>
        </>
      }
    >
      <Input label="عنوان الطلب" required value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="اكتب عنواناً مختصراً" />
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <Select label="التصنيف" value={category} onChange={(e) => setCategory(e.target.value)}>
          <option>مشكلة تقنية</option>
          <option>استفسار</option>
          <option>طلب تعديل بيانات</option>
          <option>اقتراح</option>
          <option>أخرى</option>
        </Select>
        <Select label="الأولوية" value={priority} onChange={(e) => setPriority(e.target.value)}>
          {Object.entries(TICKET_PRIORITY_LABELS).map(([key, label]) => (
            <option key={key} value={key}>
              {label}
            </option>
          ))}
        </Select>
      </div>
      <Textarea
        label="وصف المشكلة"
        required
        rows={5}
        className="mt-4"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder="اشرح المشكلة بالتفصيل ليتمكن فريق الدعم من مساعدتك"
      />
    </Modal>
  );
}
