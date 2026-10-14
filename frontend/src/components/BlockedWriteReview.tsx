import { useState } from 'react';
import toast from 'react-hot-toast';
import { api, apiError } from '@/lib/api';
import { useAuthStore } from '@/store/auth';
import { replaceBlockedOfflineOperation, type OutboxOperation } from '@/lib/offline/outbox';
import { syncOfflineOperations } from '@/lib/offline/sync';
import { replayOfflineOperation } from '@/lib/offline/replay';
import { Button, Modal } from '@/components/ui';
const labels: Record<string, string> = { date: 'التاريخ', type: 'نوع التسميع', fromSurah: 'من سورة', fromAyah: 'من آية', toSurah: 'إلى سورة', toAyah: 'إلى آية', pagesCount: 'عدد الصفحات', versesCount: 'عدد الآيات', mistakes: 'الأخطاء', warnings: 'التنبيهات', evaluation: 'التقييم', notes: 'الملاحظات', points: 'النقاط' };
export default function BlockedWriteReview({ operation }: { operation: OutboxOperation }) {
  const [open, setOpen] = useState(false), [loading, setLoading] = useState(false), [current, setCurrent] = useState<Record<string, unknown> | null>(null), [error, setError] = useState('');
  const account = useAuthStore(state => state.user?.id || '');
  const supported = ['recitation-correct', 'recitation-delete'].includes(operation.resource);
  const review = async () => {
    setOpen(true); setError(''); setCurrent(null);
    if (!supported || !navigator.onLine) { setError('يلزم الاتصال لمقارنة التعديل بالنسخة الحالية. التعديل المحلي محفوظ.'); return; }
    setLoading(true);
    try {
      const { data } = await api.get(operation.path);
      if (useAuthStore.getState().user?.id !== operation.accountId || data.id !== operation.path.split('/').at(-1)) throw new Error('تغيّر الحساب أو إصدار السجل');
      setCurrent(data);
    } catch (e) { setError(apiError(e)); } finally { setLoading(false); }
  };
  const reapply = async () => {
    if (!current || typeof current.updatedAt !== 'string' || account !== operation.accountId || !navigator.onLine) return;
    setLoading(true);
    try {
      await replaceBlockedOfflineOperation(operation.id, account, current.updatedAt);
      window.dispatchEvent(new Event('quran-circles:outbox-changed'));
      await syncOfflineOperations(account, replayOfflineOperation);
      toast.success('تمت إعادة إرسال التعديل بعد مراجعتك؛ راجع حالة المزامنة'); setOpen(false);
    } catch (e) { setError(apiError(e)); } finally { setLoading(false); }
  };
  const exportWrite = () => {
    const link = document.createElement('a'); const url = URL.createObjectURL(new Blob([JSON.stringify(operation, null, 2)], { type: 'application/json;charset=utf-8' }));
    link.href = url; link.download = `saved-edit-${operation.id}.json`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  return <><Button size="sm" variant="secondary" onClick={() => void review()}>مراجعة التعديل</Button>
    <Modal open={open} onClose={() => setOpen(false)} title="مراجعة تعديل محفوظ محليًا" footer={<><Button variant="secondary" onClick={exportWrite}>تنزيل نسخة من التعديل</Button>{current && <Button loading={loading} onClick={() => void reapply()}>إعادة تطبيق التعديل على النسخة الحالية</Button>}</>}>
      {error && <p role="alert" className="mb-3 text-red-700">{error}</p>}
      {loading && !current && <p>جارٍ تنزيل النسخة الحالية…</p>}
      <p className="mb-3 text-sm text-slate-600">لا نستبدل التعديل الأحدث تلقائيًا. قارن البيانات قبل إعادة الإرسال؛ تبقى نسختك المحلية محفوظة.</p>
      {operation.resource === 'recitation-delete' && <p className="mb-3 font-semibold text-red-700">التعديل المحلي يطلب حذف هذا السجل وإعادة حساب رصيد الطالب.</p>}
      <div className="grid gap-4 sm:grid-cols-2"><section><h3 className="font-bold">تعديلك المحلي</h3><dl>{Object.entries(operation.payload as Record<string, unknown>).filter(([key]) => key in labels).map(([key, value]) => <div key={key}><dt className="mt-2 text-xs text-slate-500">{labels[key]}</dt><dd>{String(value ?? '—')}</dd></div>)}</dl></section>
        <section><h3 className="font-bold">النسخة الحالية على الخادم</h3><dl>{current && Object.entries(current).filter(([key]) => key in labels).map(([key, value]) => <div key={key}><dt className="mt-2 text-xs text-slate-500">{labels[key]}</dt><dd>{String(value ?? '—')}</dd></div>)}</dl></section></div>
    </Modal></>;
}
