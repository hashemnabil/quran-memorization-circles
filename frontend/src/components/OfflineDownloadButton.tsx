import { useMemo, useState } from 'react';
import { queryClient } from '@/lib/queryClient';
import { api } from '@/lib/api';
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
  const role = useAuthStore((state) => state.user?.role);
  const [open, setOpen] = useState(false);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<{ saved: number; failed: number; total: number; bundle?: { circles: number; students: number; complete: boolean } } | null>(null);
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
    let bundleSummary: { circles: number; students: number; complete: boolean } | undefined;
    try {
      // Download the role-scoped bootstrap for every authenticated role, not only
      // attendance staff. Each page is bounded and validated against the server identity.
      const bootstrapCircles = new Map<string, any>();
      const bootstrapStudents = new Map<string, any>();
      const bootstrapCursors = new Set<string>();
      let bootstrapCursor: string | undefined;
      let bootstrapComplete = false;
      for (let page = 0; page < 1000; page += 1) {
        if (!navigator.onLine) throw new Error('انقطع الاتصال أثناء تنزيل البيانات');
        const response = await api.get('/offline-sync/bootstrap', {
          params: { limit: 200, ...(bootstrapCursor ? { cursor: bootstrapCursor } : {}) },
        });
        const data = response.data as {
          version: number; accountId: string;
          circles?: Array<{ id: string; [key: string]: unknown }>;
          students?: Array<{ id: string; [key: string]: unknown }>;
          nextCursor: string | null; complete: boolean;
        };
        if (data.accountId !== accountId || data.version !== 1) throw new Error('Account/version mismatch in offline bootstrap');
        for (const circle of data.circles ?? []) bootstrapCircles.set(circle.id, circle);
        for (const student of data.students ?? []) bootstrapStudents.set(student.id, student);
        bootstrapComplete = data.complete === true;
        if (bootstrapComplete) break;
        if (!data.nextCursor || bootstrapCursors.has(data.nextCursor)) throw new Error('Invalid offline bootstrap cursor');
        bootstrapCursors.add(data.nextCursor);
        bootstrapCursor = data.nextCursor;
      }
      if (!bootstrapComplete) throw new Error('Offline bootstrap pagination limit reached');
      queryClient.setQueryData(['offline', 'bootstrap', accountId], {
        version: 1, accountId, downloadedAt: new Date().toISOString(),
        circles: [...bootstrapCircles.values()], students: [...bootstrapStudents.values()], complete: true,
      });

      // Attendance has a separate roster contract and is only available to these roles.
      if (role === 'ADMIN' || role === 'SUPERVISOR' || role === 'TEACHER') {
        const bundleCircles = new Map<string, any>();
        const bundleStudents = new Map<string, any>();
        const seenCursors = new Set<string>();
        let cursor: string | undefined;
        let complete = false;
        for (let page = 0; page < 1000; page += 1) {
          if (!navigator.onLine) throw new Error('انقطع الاتصال أثناء تنزيل حزمة الحضور');
          const response = await api.get('/attendance/offline-bundle', {
            params: { limit: 500, ...(cursor ? { cursor } : {}) },
          });
          const data = response.data as {
            accountId: string; circles: Array<{ id: string; [key: string]: unknown }>;
            students: Array<{ id: string; [key: string]: unknown }>;
            nextCursor: string | null; complete: boolean;
          };
          if (data.accountId !== accountId) throw new Error('Account mismatch in offline bundle');
          for (const circle of data.circles ?? []) bundleCircles.set(circle.id, circle);
          for (const student of data.students ?? []) bundleStudents.set(student.id, student);
          complete = data.complete === true;
          if (complete) break;
          if (!data.nextCursor || seenCursors.has(data.nextCursor)) throw new Error('Invalid offline bundle cursor');
          seenCursors.add(data.nextCursor);
          cursor = data.nextCursor;
        }
        if (!complete) throw new Error('Offline bundle pagination limit reached');
        const bundle = {
          version: 1, accountId, downloadedAt: new Date().toISOString(),
          circles: [...bundleCircles.values()], students: [...bundleStudents.values()], complete: true,
        };
        queryClient.setQueryData(['offline', 'attendance-bundle', accountId], bundle);
        bundleSummary = { circles: bundle.circles.length, students: bundle.students.length, complete: bundle.complete };
      }

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
      setResult({ saved, failed, total: queries.length, bundle: bundleSummary });
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
                <p className="mt-1 text-sm leading-6 text-slate-600">نزّل الحزمة الأساسية المصرّح بها لدورك، ثم حدّث الاستعلامات المسجّلة من الأقسام التي زرتها.</p>
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
              تنزيل الحزمة الأساسية لا يعني أن كل أقسام الموقع أصبحت متاحة دون إنترنت؛ ما زالت البيانات التفصيلية للأقسام التي لم تُفتح سابقاً، والعمليات غير المدعومة دون اتصال، بحاجة إلى تنفيذ مستقل.
            </div>
            {running && <p className="mt-4 text-sm font-semibold text-emerald-700" role="status">جارٍ تحديث البيانات وحفظها على الجهاز…</p>}
            {result && <div className="mt-4 rounded-xl bg-emerald-50 p-3 text-sm leading-6 text-emerald-900">اكتملت العملية. استعلامات فيها بيانات بعد المحاولة: <strong>{result.saved}</strong>. استعلامات بدون بيانات: <strong>{result.failed}</strong>. إجمالي الاستعلامات التي كانت موجودة عند البدء: {result.total}. {result.bundle && <>وحُفظت حزمة الحضور المصرّح بها: <strong>{result.bundle.circles}</strong> حلقة و<strong>{result.bundle.students}</strong> طالب.</>}</div>}
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
