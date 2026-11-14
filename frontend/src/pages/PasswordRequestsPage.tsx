import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Card, PageHeader, LoadingState, ErrorState, Button } from '@/components/ui';
export default function PasswordRequestsPage() {
  const [page, setPage] = useState(1);
  const query = useQuery({ queryKey: ['support', 'password-requests', page], queryFn: async () => (await api.get('/support', { params: { category: 'PASSWORD_RESET', page, limit: 20 } })).data });
  return <div dir="rtl"><PageHeader title="طلبات تغيير كلمة المرور" />
    <p className="mb-5 text-sm leading-7 text-slate-600">راجع هوية صاحب الطلب قبل إعادة تعيين كلمة المرور من حسابات الطلاب أو المستخدمين. رقم واتساب يُستخدم للتواصل يدويًا؛ لا يوجد إرسال واتساب تلقائي.</p>
    {query.isLoading ? <LoadingState /> : query.isError ? <ErrorState message="تعذر تحميل الطلبات" onRetry={() => query.refetch()} /> : <Card>
      {query.data?.data?.length ? query.data.data.map((ticket: any) => <article key={ticket.id} className="border-b py-5 last:border-0"><div className="flex flex-wrap items-center justify-between gap-2"><h2 className="font-bold">{ticket.contactName} — #{ticket.number}</h2><span className="text-sm">{({ OPEN: 'جديد', IN_PROGRESS: 'قيد المعالجة', RESOLVED: 'تمت المعالجة', CLOSED: 'مغلق' } as Record<string, string>)[ticket.status]}</span></div><p className="my-3 whitespace-pre-line text-sm leading-7">{ticket.description}</p><Link to={`/support/${ticket.id}`} className="btn-secondary inline-flex">مراجعة الطلب وتحديث حالته</Link></article>) : <p className="py-8 text-center text-slate-500">لا توجد طلبات حاليًا.</p>}
      <div className="mt-4 flex items-center justify-between"><Button variant="secondary" disabled={page === 1} onClick={() => setPage(page - 1)}>السابق</Button><span>{page}</span><Button variant="secondary" disabled={!query.data?.meta?.hasNextPage} onClick={() => setPage(page + 1)}>التالي</Button></div>
    </Card>}
  </div>;
}
