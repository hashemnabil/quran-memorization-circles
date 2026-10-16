import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { api, apiError } from '@/lib/api';
import { Button, Card, Input, Textarea, Select, PageHeader, LoadingState, ErrorState } from '@/components/ui';
import { db } from '@/lib/db';
import { accountId } from '@/lib/offline-engine';

export default function BroadcastPage() {
  const [title, setTitle] = useState(''); const [body, setBody] = useState('');
  const [audience, setAudience] = useState('ALL'); const [selection, setSelection] = useState('ALL');
  const [selected, setSelected] = useState<string[]>([]); const [search, setSearch] = useState('');
  const [sending, setSending] = useState(false); const [notice, setNotice] = useState('');
  const [rejected, setRejected] = useState<number[]>([]);
  const users = useQuery({ queryKey: ['broadcast-recipients'], queryFn: async () => {
    const all: any[] = [];
    for (let page = 1; ; page++) {
      const { data } = await api.get('/users', { params: { page, limit: 100 } });
      all.push(...data.data); if (!data.meta?.hasNextPage) break;
    }
    return all.filter(user => user.isActive && !user.deletedAt);
  } });
  const available = (users.data || []).filter(user => audience === 'ALL' || user.role === audience);
  const shown = available.filter(user => `${user.fullName} ${user.username}`.toLowerCase().includes(search.toLowerCase()));
  const send = async (event: React.FormEvent) => {
    event.preventDefault(); if (!title.trim() || !body.trim()) return toast.error('أدخل العنوان ونص الإشعار');
    if (selection === 'SELECTED' && !selected.length) return toast.error('حدد شخصًا واحدًا على الأقل');
    setSending(true); setNotice('');
    try {
      const { data } = await api.post('/notifications/broadcast', { title: title.trim(), body: body.trim(), audience, selection, userIds: selection === 'ALL' ? [] : selected });
      setNotice(data.synced === 0 ? 'تم حفظ الإشعار؛ سيُرسل تلقائيًا عند الاتصال. لا داعي لإرساله مرة أخرى.' : `تم إرسال الإشعار إلى ${data.recipientCount} مستلمًا.`);
      setTitle(''); setBody(''); setSelected([]);
    } catch (error) {
      // The outbox retains an explicitly rejected broadcast for correction; never report it as sent.
      const pending = await db.queue.where('accountId').equals(accountId()).filter(row => row.table === 'notifications' && row.action === 'broadcast' && Boolean(row.error)).toArray();
      setRejected(pending.map(row => row.id!));
      setNotice(pending.length ? 'رفض الخادم الطلب. ألغِ الطلب المرفوض أدناه، ثم صحح البيانات وأعد الإرسال.' : '');
      toast.error(apiError(error));
    } finally { setSending(false); }
  };
  return <div dir="rtl"><PageHeader title="إرسال الإشعارات" />
    <Card><form onSubmit={send} className="space-y-5">
      <Input label="عنوان الإشعار" value={title} maxLength={160} required onChange={e => setTitle(e.target.value)} />
      <Textarea label="نص الإشعار" value={body} maxLength={3000} required onChange={e => setBody(e.target.value)} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Select label="الفئة" value={audience} onChange={e => { setAudience(e.target.value); setSelected([]); }}><option value="ALL">كل المستخدمين</option><option value="TEACHER">المحفظون</option><option value="STUDENT">الطلاب</option></Select>
        <Select label="المستلمون" value={selection} onChange={e => { setSelection(e.target.value); setSelected([]); }}><option value="ALL">الجميع في الفئة</option><option value="SELECTED">أشخاص محددون</option></Select>
      </div>
      {selection === 'SELECTED' && <section className="rounded-2xl border p-4">
        <Input label="البحث عن مستلم" value={search} onChange={e => setSearch(e.target.value)} />
        {users.isLoading ? <LoadingState /> : users.isError ? <ErrorState message="تعذر تحميل المستلمين" onRetry={() => users.refetch()} /> : <>
          <div className="my-3 flex items-center justify-between text-sm"><span>المحددون: {selected.length}</span><button type="button" className="min-h-11 font-bold text-primary-700" onClick={() => setSelected(selected.length === available.length ? [] : available.map(user => user.id))}>{selected.length === available.length ? 'إلغاء تحديد الجميع' : 'تحديد كل الفئة'}</button></div>
          <div className="max-h-72 overflow-auto">{shown.map(user => <label key={user.id} className="flex min-h-14 cursor-pointer items-center gap-3 border-t py-2"><input type="checkbox" checked={selected.includes(user.id)} onChange={e => setSelected(ids => e.target.checked ? [...ids, user.id] : ids.filter(id => id !== user.id))} /><span>{user.fullName}<small className="block text-slate-500">{user.username}</small></span></label>)}{!shown.length && <p>لا توجد حسابات مطابقة.</p>}</div>
        </>}
      </section>}
      {notice && <p role="status" className="rounded-xl bg-emerald-50 p-4 leading-7 text-emerald-800">{notice}</p>}
      {rejected.length > 0 && <Button type="button" variant="secondary" onClick={async () => {
        const account = accountId();
        await db.transaction('rw', db.queue, db.notifications, async () => {
          for (const id of rejected) {
            const operation = await db.queue.get(id);
            if (operation?.accountId === account && operation.error && operation.action === 'broadcast') {
              await db.queue.delete(id); await db.notifications.delete([account, operation.entityId]);
            }
          }
        }); setRejected([]); setNotice('أُلغي الطلب المرفوض؛ يمكنك تصحيح البيانات وإرساله من جديد.'); window.dispatchEvent(new Event('halaqat:changed'));
      }}>إلغاء الطلب المرفوض</Button>}
      <Button type="submit" disabled={rejected.length > 0} loading={sending}>إرسال الإشعار</Button>
    </form></Card></div>;
}
