import { useState } from 'react';
import { queryClient } from '@/lib/queryClient';
import { persistQueryCache } from '@/lib/offline/queryCache';
import { useAuthStore } from '@/store/auth';
import { IconDownload } from '@/components/ui/Icons';

export default function OfflineDownloadButton() {
  const accountId = useAuthStore((state) => state.user?.id ?? '');
  const [open, setOpen] = useState(false);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<{ saved: number; failed: number; total: number } | null>(null);
  const [error, setError] = useState('');

  const downloadAvailableData = async () => {
    if (!accountId || running) return;
    setRunning(true);
    setError('');
    setResult(null);
    const queries = queryClient.getQueryCache().getAll();
    let saved = 0;
    let failed = 0;
    try {
      // Refresh every query that this account has already opened in the app.
      for (const query of queries) {
        if (!query.options.queryFn || query.state.fetchStatus === 'fetching') continue;
        try {
          await query.fetch();
          if (query.state.data !== undefined) saved += 1;
          else failed += 1;
        } catch {
          if (query.state.data !== undefined) saved += 1; // Keep its last good offline copy.
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

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title="تحميل البيانات للاستخدام دون إنترنت"
        aria-label="تحميل البيانات للاستخدام دون إنترنت"
        className="inline-flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-800 transition hover:bg-emerald-100 sm:text-sm"
      >
        <IconDownload size={18} />
        <span className="hidden sm:inline">تحميل دون إنترنت</span>
      </button>

      {open && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/50 p-4" role="dialog" aria-modal="true" aria-labelledby="offline-download-title" dir="rtl">
          <section className="w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl">
            <div className="mb-4 flex items-start gap-3">
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-emerald-50 text-emerald-700"><IconDownload size={22} /></span>
              <div className="flex-1">
                <h2 id="offline-download-title" className="text-lg font-extrabold text-slate-900">تحميل البيانات للاستخدام دون إنترنت</h2>
                <p className="mt-1 text-sm leading-6 text-slate-600">يحدّث ويحفظ محلياً البيانات التي سبق فتحها في هذا الحساب، لتكون متاحة عند انقطاع الاتصال.</p>
              </div>
            </div>
            <div className="rounded-xl bg-amber-50 p-3 text-sm leading-6 text-amber-900">
              ملاحظة: هذه العملية تحفظ الأقسام التي سبق تحميلها أو فتحها؛ لا يمكنها جلب أقسام لم يزرها المستخدم بعد. افتح الأقسام المطلوبة والإنترنت متصل ثم شغّل التحميل مرة أخرى.
            </div>
            {running && <p className="mt-4 text-sm font-semibold text-emerald-700" role="status">جارٍ تحديث البيانات وحفظها على الجهاز…</p>}
            {result && <div className="mt-4 rounded-xl bg-emerald-50 p-3 text-sm leading-6 text-emerald-900">اكتمل الحفظ. بيانات جاهزة محلياً: <strong>{result.saved}</strong> استعلام. تعذّر جلب بيانات جديدة: <strong>{result.failed}</strong>. عدد الاستعلامات الموجودة: {result.total}.</div>}
            {error && <p className="mt-4 text-sm text-red-700" role="alert">{error}</p>}
            <div className="mt-5 flex gap-2">
              <button type="button" onClick={() => void downloadAvailableData()} disabled={running} className="flex-1 rounded-xl bg-emerald-700 px-4 py-2.5 text-sm font-bold text-white hover:bg-emerald-800 disabled:opacity-50">{running ? 'جارٍ التحميل…' : 'تحميل البيانات المتاحة'}</button>
              <button type="button" onClick={() => setOpen(false)} disabled={running} className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50">إغلاق</button>
            </div>
          </section>
        </div>
      )}
    </>
  );
}
