import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '@/store/auth';
import { listOfflineOperations } from '@/lib/offline/outbox';
import { listOfflineSnapshot } from '@/lib/offline/changeFeed';
import { Card, Badge } from '@/components/ui';
export function useQueuedRecitations() {
  const accountId = useAuthStore(state => state.user?.id || ''); const client = useQueryClient();
  const { data } = useQuery({ queryKey: ['offline', 'recitation-writes', accountId], networkMode: 'always',
    queryFn: async () => ({ operations: (await listOfflineOperations(accountId)).filter(op => op.resource.startsWith('recitation-')), students: await listOfflineSnapshot(accountId, 'student') }), enabled: !!accountId });
  useEffect(() => { const refresh = () => { void client.invalidateQueries({ queryKey: ['offline', 'recitation-writes', accountId] }); }; window.addEventListener('quran-circles:outbox-changed', refresh); return () => window.removeEventListener('quran-circles:outbox-changed', refresh); }, [client, accountId]);
  return data;
}
export default function QueuedRecitations() {
  const data = useQueuedRecitations();
  if (!data?.operations.length) return null;
  return <Card title="تسميع محفوظ على هذا الجهاز" className="mb-5">
    <p className="mb-3 text-sm text-slate-600">التعديلات التالية محفوظة محليًا. لا تُحتسب في الرصيد الرسمي حتى يعتمدها الخادم.</p>
    {data.operations.map(op => {
      const item = op.payload as Record<string, any>; const student = data.students.find(student => student.id === item.studentId);
      const correction = op.resource === 'recitation-correct'; const removal = op.resource === 'recitation-delete';
      return <div key={op.id} className="mb-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm" data-testid="queued-recitation">
        <div className="flex flex-wrap items-center justify-between gap-2"><strong>{removal ? 'طلب حذف تسميع' : correction ? 'تصحيح تسميع' : String(student?.fullName || 'تسميع جديد')}</strong><Badge>{op.state === 'blocked' ? 'يحتاج مراجعة' : 'بانتظار المزامنة'}</Badge></div>
        {!removal && !correction && <p className="mt-2">{item.date} — {item.fromSurah} {item.fromAyah} إلى {item.toSurah} {item.toAyah}</p>}
        {correction && <p className="mt-2">{Object.entries(item).map(([key, value]) => `${({ notes: 'الملاحظات', evaluation: 'التقييم', mistakes: 'الأخطاء', warnings: 'التنبيهات', fromSurah: 'من سورة', toSurah: 'إلى سورة', fromAyah: 'من آية', toAyah: 'إلى آية', date: 'التاريخ', pagesCount: 'عدد الصفحات', versesCount: 'عدد الآيات', type: 'نوع التسميع' } as Record<string, string>)[key] || key}: ${String(value ?? '')}`).join(' — ')}</p>}
        {op.lastError && <p className="mt-2 text-red-700">{op.lastError}</p>}
      </div>;
    })}
  </Card>;
}
