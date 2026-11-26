import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useAuthStore } from '@/store/auth';
import { canOpenPath } from '@/config/navigation';
import { Card } from '@/components/ui';
import { IconBell, IconBook, IconCalendar, IconChat } from '@/components/ui/Icons';
import type { AppNotification, PaginatedResponse } from '@/types';

export default function DailyOverview() {
  const role = useAuthStore(state => state.user?.role);
  const notices = useQuery({queryKey: ['notifications', {daily: true}], queryFn: async () => (await api.get<PaginatedResponse<AppNotification>>('/notifications', {params: {page: 1, limit: 3}})).data});
  const links = role === 'STUDENT' ? [
    {to: '/student', label: 'ملفي الدراسي', icon: <IconBook/>},
    {to: '/my-files', label: 'ملفاتي وطلباتي', icon: <IconCalendar/>},
    {to: '/chat', label: 'رسائلي', icon: <IconChat/>},
  ] : [
    {to: '/attendance', label: 'الحضور اليومي', icon: <IconCalendar/>},
    {to: '/recitations', label: 'التسميع والمراجعة', icon: <IconBook/>},
    {to: '/exams', label: 'الاختبارات', icon: <IconBook/>},
    {to: '/chat', label: 'المحادثات', icon: <IconChat/>},
  ];
  return <Card className="mb-5 daily-overview" title="يومي" subtitle={new Intl.DateTimeFormat('ar-SA', {weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Asia/Riyadh'}).format(new Date())} action={<Link to="/notifications" className="inline-flex min-h-11 items-center gap-2 text-sm font-bold"><IconBell size={17}/>جميع التنبيهات</Link>}>
    <div className="grid gap-6 lg:grid-cols-2"><div><h3 className="mb-3 text-sm font-bold">متابعتي اليوم</h3><div className="grid grid-cols-2 gap-2">{links.filter(link=>role && canOpenPath(role, link.to)).map(link=><Link key={link.to} to={link.to} className="daily-shortcut">{link.icon}<span>{link.label}</span></Link>)}</div></div>
    <div><h3 className="mb-3 text-sm font-bold">آخر التنبيهات</h3>{notices.isPending ? <p role="status" className="text-sm text-slate-500">جارٍ تحميل التنبيهات…</p> : notices.isError ? <p className="text-sm text-slate-500">تعذر تحميل التنبيهات. <button type="button" className="underline" onClick={()=>void notices.refetch()}>إعادة المحاولة</button></p> : notices.data?.data.length ? <ul className="space-y-2">{notices.data.data.map(notice=><li key={notice.id}><Link to="/notifications" className={`daily-notice ${notice.isRead ? '' : 'daily-notice-unread'}`}><span className="min-w-0 flex-1 truncate">{notice.title}</span>{!notice.isRead && <small>جديد</small>}</Link></li>)}</ul> : <p className="text-sm text-slate-500">لا توجد تنبيهات حاليًا.</p>}</div></div>
  </Card>;
}
