import { useMemo, useState } from 'react';
import { queryClient } from '@/lib/queryClient';
import { persistQueryCache } from '@/lib/offline/queryCache';
import { useAuthStore } from '@/store/auth';
import { IconDownload } from '@/components/ui/Icons';

const SECTION_LABELS: Record<string, string> = {
  students: 'الطلاب',
  student: 'بوابة الطالب',
  circles: 'الحلقات',
  attendance: 'الحضور',
  'staff-attendance': 'حضور الموظفين',
  recitations: 'التسميع',
  courses: 'الدورات',
  reports: 'التقارير',
  teachers: 'المعلمون',
  settings: 'الإعدادات',
  notifications: 'الإشعارات',
  chat: 'المحادثات',
  support: 'الدعم الفني',
  transfers: 'طلبات النقل',
  profile: 'الملف الشخصي',
  dashboard: 'الرئيسية',
  announcements: 'الإعلانات',
};

function sectionFor(queryKey: readonly unknown[]): string {
  const key = String(queryKey[0] ?? '');
  return SECTION_LABELS[key] ?? (key ? 'أقسام أخرى' : 'بيانات أخرى');
}

export default function OfflineDownloadButton() {
  const accountId = useAuthStore((state) => state.user?.id ?? '');
  const [open, setOpen] = useState(false);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<{ saved: number; failed: number; total: number } | null>(null);
  const [error, setError] = useState('');

  const cachedQueries = queryClient.getQueryCache().getAll();
  const sectionStatus = useMemo(() => {
    const sections = new Map<string, { ready: number; total: number }>();
    for (const query of cachedQueries) {
      const label = sectionFor(query.queryKey);
      const current = sections.get(label) ?? { ready: 0, total: 0 };
      current.total += 1;
      if (query.state.status === 'success' && query.state.data !== undefined) current.ready += 1;
      sections.set(label, current);
    }
    return [...sections.entries()].sort((a, b) => a[0].localeCompare(b[0], 'ar'));
  }, [cachedQueries.length, result, running]);

  const downloadAvailableData = async () => {
    if (!accountId || running) return;
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      setError('أنت غير متصل بالإنترنت. يمكنك استخدام النسخ المحفوظة، لكن تحديثها يحتاج اتصالاً.');
      return;
    }
    setRunning(true);
    setError('');
    setResult(null);
    const queries = queryClient.getQueryCache().getAll();
    let saved = 0;
    let failed = 0;
    try {
      // Refresh queries registered by pages the current account has visited.
      for (const query of queries) {
        if (!query.options.queryFn || query.state.fetchStatus === 'fetching') continue;
        try {
          await query.fetch();
          if (query.state.data !== undefined) saved += 1;
          else failed += 1;
        } catch {
          if (query.state.data !== undefined) saved += 1;
          else failed += 1;
        }
      }
      await persistQueryCache(accountId);
      setResult({ saved, failed, total: queries.length });
    } catch {
      setError('تعذر حفظ البيانات على هذا الجهاز. تأكد من مساحة التخزين ثم حاول مجدداً.');
    } finally {
      setRunning(false);
    }
  };

  const readySections = sectionStatus.filter(([, counts]) => counts.ready > 0);
  const incompleteSections = sectionStatus.filter(([, counts]) => counts.ready === 0);

  return (
    <>
      <button
        type="button"
        onClick={() => { setOpen(true); setError(''); }}
        title="تحميل البيانات للاستخدام دون إنترنت"
        aria-label="تحميل البيانات للاستخدام دون إنترنت"
        className="inline-flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-800 transition hover:bg-emerald-100 sm:text-sm"
      >
        <IconDownload size={18} />
        <span className="hidden sm:inline">تحميل دون إنترنت</span>
      </button>

      {open && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/50 p-4" role="dialog" aria-modal="true" aria-labelledby="offline-download-title" dir="rtl">
          <section className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-5 shadow-2xl">
            <div className="mb-4 flex items-start gap-3">
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-emerald-50 text-emerald-700"><IconDownload size={22} /></span>
              <div className="flex-1">
                <h2 id="offline-download-title" className="text-lg font-extrabold text-slate-900">مركز البيانات دون إنترنت</h2>
                <p className="mt-1 text-sm leading-6 text-slate-600">افحص الأقسام التي سبق فتحها واحفظ آخر بياناتها على هذا الجهاز.</p>
              </div>
            </div>

            <div className="mb-4 grid grid-cols-2 gap-3">
              <div className="rounded-xl border border-slate-200 p-3">
                <p className="text-xs text-slate-500">أقسام فيها بيانات</p>
                <p className="mt-1 text-xl font-extrabold text-emerald-700">{readySections.length}</p>
              </div>
              <div className="rounded-xl border border-slate-200 p-3">
                <p className="text-xs text-slate-500">استعلامات محفوظة بالذاكرة</p>
                <p className="mt-1 text-xl font-extrabold text-slate-800">{cachedQueries.filter((q) => q.state.status === 'success' && q.state.data !== undefined).length}</p>
              </div>
            </div>

            {sectionStatus.length > 0 ? (
              <div className="mb-4">
                <h3 className="mb-2 text-sm font-bold text-slate-800">حالة الأقسام التي تم فتحها</h3>
                <ul className="space-y-2">
                  {sectionStatus.map(([label, counts]) => (
                    <li key={label} className="flex items-center justify-between gap-3 rounded-lg bg-slate-50 px-3 py-2 text-sm">
                      <span className="font-medium text-slate-700">{label}</span>
                      <span className={counts.ready > 0 ? 'text-emerald-700' : 'text-amber-700'}>
                        {counts.ready > 0 ? `جاهز جزئياً أو كلياً · ${counts.ready}/${counts.total}` : 'لا توجد بيانات محفوظة'}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <p className="mb-4 rounded-xl bg-amber-50 p-3 text-sm leading-6 text-amber-900">ما في بيانات محمّلة بعد. افتح الأقسام المطلوبة أولاً والإنترنت شغّال.</p>
            )}

            <div className="rounded-xl bg-amber-50 p-3 text-sm leading-6 text-amber-900">
              مهم: هذا الإصدار يحدّث ويحفظ الاستعلامات التي سجّلها التطبيق من الأقسام التي زرتها فقط، وليس كل سجلات الموقع أو كل الصفحات تلقائياً. افتح كل قسم وصفحات البيانات المطلوبة، ثم أعد التحميل. الأقسام غير الظاهرة لم تُفحص بعد.
            </div>
            {running && <p className="mt-4 text-sm font-semibold text-emerald-700" role="status">جارٍ تحديث البيانات وحفظها على الجهاز…</p>}
            {result && <div className="mt-4 rounded-xl bg-emerald-50 p-3 text-sm leading-6 text-emerald-900">اكتملت العملية. استعلامات فيها بيانات بعد المحاولة: <strong>{result.saved}</strong>. استعلامات بدون بيانات: <strong>{result.failed}</strong>. إجمالي الاستعلامات التي كانت موجودة عند البدء: {result.total}.</div>}
            {error && <p className="mt-4 text-sm text-red-700" role="alert">{error}</p>}
            <div className="mt-5 flex gap-2">
              <button type="button" onClick={() => void downloadAvailableData()} disabled={running} className="flex-1 rounded-xl bg-emerald-700 px-4 py-2.5 text-sm font-bold text-white hover:bg-emerald-800 disabled:opacity-50">{running ? 'جارٍ التحميل…' : 'تحديث وحفظ البيانات المتاحة'}</button>
              <button type="button" onClick={() => setOpen(false)} disabled={running} className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50">إغلاق</button>
            </div>
          </section>
        </div>
      )}
    </>
  );
}
