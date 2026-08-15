import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { api, apiError } from '@/lib/api';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorState,
  LoadingState,
  PageHeader,
  Pagination,
  Tabs,
  cx,
} from '@/components/ui';
import { IconBell, IconCheck, IconTrash } from '@/components/ui/Icons';
import { NOTIFICATION_ICONS } from '@/lib/labels';
import { timeAgo } from '@/lib/format';
import type { AppNotification, PaginatedResponse } from '@/types';

export default function NotificationsPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [tab, setTab] = useState('all');
  const [page, setPage] = useState(1);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['notifications', { tab, page }],
    queryFn: async () =>
      (
        await api.get<PaginatedResponse<AppNotification> & { unreadCount: number }>('/notifications', {
          params: { page, limit: 25, unreadOnly: tab === 'unread' ? true : undefined },
        })
      ).data,
  });

  const markRead = useMutation({
    mutationFn: (id: string) => api.patch(`/notifications/${id}/read`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
  });

  const markAll = useMutation({
    mutationFn: () => api.patch('/notifications/read-all'),
    onSuccess: () => {
      toast.success('تم تعليم جميع الإشعارات كمقروءة');
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
    onError: (error) => toast.error(apiError(error)),
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/notifications/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
  });

  const open = (notification: AppNotification) => {
    if (!notification.isRead) markRead.mutate(notification.id);
    if (notification.link) navigate(notification.link);
  };

  return (
    <>
      <PageHeader
        title="الإشعارات"
        subtitle={data?.unreadCount ? `لديك ${data.unreadCount} إشعاراً غير مقروء` : 'كل الإشعارات مقروءة'}
        action={
          (data?.unreadCount ?? 0) > 0 && (
            <Button variant="secondary" icon={<IconCheck size={16} />} onClick={() => markAll.mutate()} loading={markAll.isPending}>
              تعليم الكل كمقروء
            </Button>
          )
        }
      />

      <Tabs
        tabs={[
          { key: 'all', label: 'الكل' },
          { key: 'unread', label: 'غير المقروءة', badge: data?.unreadCount },
        ]}
        active={tab}
        onChange={(key) => {
          setTab(key);
          setPage(1);
        }}
      />

      <Card padded={false}>
        {isLoading ? (
          <LoadingState />
        ) : isError ? (
          <ErrorState message="تعذر تحميل الإشعارات" onRetry={() => refetch()} />
        ) : !data?.data.length ? (
          <EmptyState
            title={tab === 'unread' ? 'لا توجد إشعارات غير مقروءة' : 'لا توجد إشعارات'}
            message="ستظهر هنا إشعارات الطلبات والاختبارات والرسائل."
            icon={<IconBell size={24} />}
          />
        ) : (
          <>
            <ul className="divide-y divide-slate-100">
              {data.data.map((notification) => (
                <li
                  key={notification.id}
                  className={cx('flex items-start gap-3 px-5 py-4 transition', !notification.isRead && 'bg-primary-50/40')}
                >
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-slate-100 text-lg">
                    {NOTIFICATION_ICONS[notification.type] ?? '🔔'}
                  </span>

                  <button onClick={() => open(notification)} className="min-w-0 flex-1 text-right">
                    <p className={cx('text-sm', notification.isRead ? 'font-semibold text-slate-600' : 'font-bold text-slate-800')}>
                      {notification.title}
                    </p>
                    {notification.body && <p className="mt-0.5 text-xs leading-6 text-slate-500">{notification.body}</p>}
                    <p className="mt-1 text-[11px] text-slate-400">{timeAgo(notification.createdAt)}</p>
                  </button>

                  <div className="flex shrink-0 items-center gap-1">
                    {!notification.isRead && (
                      <>
                        <span className="h-2 w-2 rounded-full bg-primary-600" />
                        <button
                          onClick={() => markRead.mutate(notification.id)}
                          className="rounded-lg p-2 text-slate-300 transition hover:bg-slate-100 hover:text-primary-700"
                          title="تعليم كمقروء"
                        >
                          <IconCheck size={15} />
                        </button>
                      </>
                    )}
                    <button
                      onClick={() => remove.mutate(notification.id)}
                      className="rounded-lg p-2 text-slate-300 transition hover:bg-red-50 hover:text-red-600"
                      title="حذف"
                    >
                      <IconTrash size={15} />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
            <Pagination page={data.meta.page} totalPages={data.meta.totalPages} total={data.meta.total} onChange={setPage} />
          </>
        )}
      </Card>
    </>
  );
}
