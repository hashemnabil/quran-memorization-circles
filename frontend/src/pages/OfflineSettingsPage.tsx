import { useEffect, useState } from 'react';
import { db, entityTables } from '@/lib/db';
import { accountId, clearLocal, exportLocal, importLocal, refreshOffline } from '@/lib/offline-engine';
import { queryClient } from '@/lib/queryClient';
import { localDomainLabels } from '@/lib/local-domain-labels';
import { studentPhotoCount } from '@/lib/pending-student-photos';

export default function OfflineSettingsPage() {
  const [counts, setCounts] = useState<Record<string, number>>({}); const [message, setMessage] = useState(''); const [busy, setBusy] = useState(false);
  const [online, setOnline] = useState(navigator.onLine);
  const [downloadedAt, setDownloadedAt] = useState('');
  const [pending, setPending] = useState(0);
  const [rejected, setRejected] = useState(0);
  useEffect(() => {
    let active = true;
    const update = async () => {
      const account = accountId();
      const [snapshot, operations, avatar, cover, photos] = await Promise.all([db.meta.get(`${account}:downloadedAt`), db.queue.where('accountId').equals(account).toArray(), db.meta.get(`${account}:pendingAvatar`), db.meta.get(`${account}:pendingCover`), studentPhotoCount(account)]);
      if (!active || account !== accountId()) return;
      setDownloadedAt(snapshot?.value || ''); setPending(operations.length + Number(Boolean(avatar)) + Number(Boolean(cover)) + photos); setRejected(operations.filter(row => row.error).length);
    };
    const connectivity = () => { setOnline(navigator.onLine); void update(); };
    void update();
    window.addEventListener('online', connectivity); window.addEventListener('offline', connectivity);
    window.addEventListener('halaqat:changed', connectivity);
    const timer = window.setInterval(() => void update(), 3000);
    return () => { active = false; clearInterval(timer); window.removeEventListener('online', connectivity); window.removeEventListener('offline', connectivity); window.removeEventListener('halaqat:changed', connectivity); };
  }, []);
  const refresh = async () => { const rows = await Promise.all(entityTables.map(async (table) => [table, await db.table(table).where('accountId').equals(accountId()).count()])); setCounts(Object.fromEntries(rows)); };
  useEffect(() => { void refresh(); const changed = () => { void refresh(); }; window.addEventListener('halaqat:changed', changed); return () => window.removeEventListener('halaqat:changed', changed); }, []);
  const run = async (action: () => Promise<any>) => { setBusy(true); setMessage(''); try { await action(); await refresh(); await queryClient.invalidateQueries(); setMessage('تمت العملية'); } catch (e) { setMessage(e instanceof Error ? e.message : 'تعذرت العملية'); } finally { setBusy(false); } };
  const download = async () => { const backup = await exportLocal(); const url = URL.createObjectURL(new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' })); const link = document.createElement('a'); link.href = url; link.download = `halaqat-${new Date().toISOString().slice(0, 10)}.json`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); };
  return <section dir="rtl" className="offline-settings space-y-6">
    <div className="page-heading"><div><p className="offline-eyebrow">بياناتك على هذا الجهاز</p><h1 className="text-2xl font-bold">العمل بدون إنترنت</h1><p>تابع أعمالك من النسخة المحفوظة، وتزامن تعديلاتك تلقائيًا عند عودة الاتصال.</p></div></div>
    <div className="offline-readiness" data-ready={Boolean(downloadedAt)}>
      <div><span className="offline-eyebrow">{online ? 'متصل بالإنترنت' : 'أنت الآن بدون اتصال'}</span><h2>{downloadedAt ? 'نسختك المحلية محفوظة' : 'جهّز بياناتك قبل قطع الاتصال'}</h2><p>{downloadedAt ? `آخر تنزيل مكتمل: ${new Date(downloadedAt).toLocaleString('ar')}` : 'افتح حسابك مع الإنترنت أولًا، وانتظر اكتمال تنزيل البيانات.'}</p></div>
      <button className="btn-primary" disabled={busy || !online} onClick={() => void run(async () => { if (!navigator.onLine) throw new Error('تحتاج اتصالًا لتحديث النسخة المحلية'); await refreshOffline({ forceDownload: true }); if (!navigator.onLine) throw new Error('انقطع الاتصال؛ تحقق من اكتمال التنزيل قبل المغادرة'); setDownloadedAt((await db.meta.get(`${accountId()}:downloadedAt`))?.value || ''); })}>{busy ? 'جارٍ تجهيز البيانات…' : 'تحديث النسخة المحلية'}</button>
    </div>
    <div className="offline-metrics" aria-label="ملخص البيانات المحلية"><div><strong>{Object.values(counts).reduce((sum, count) => sum + count, 0).toLocaleString('ar')}</strong><span>سجل محفوظ</span></div><div><strong>{pending.toLocaleString('ar')}</strong><span>عملية بانتظار المزامنة</span></div><div><strong>{rejected.toLocaleString('ar')}</strong><span>عملية تحتاج مراجعة</span></div></div>
    <div className="offline-help"><h2>كيف تستخدم التطبيق بدون نت؟</h2><ol><li>حدّث النسخة المحلية وأنت متصل قبل مغادرة المدرسة.</li><li>استخدم الحساب نفسه وعلى الجهاز نفسه للوصول إلى بياناتك المحفوظة.</li><li>عند عودة الاتصال، راجع العمليات المعلّقة حتى تكتمل مزامنتها.</li></ol><p>التواصل مع أجهزة الآخرين وتنزيل ملفات جديدة والخدمات الخارجية تكتمل عند توفر الإنترنت. النسخة المحفوظة تعكس آخر تحديث ناجح.</p></div>
    <details className="offline-details"><summary>تفاصيل البيانات المحفوظة</summary><div className="table-wrap"><table className="table w-full text-right"><thead><tr><th scope="col">البيانات</th><th scope="col">عدد السجلات</th></tr></thead><tbody>{Object.entries(counts).map(([table, count]) => <tr key={table}><td>{localDomainLabels[table] || 'بيانات محفوظة'}</td><td>{count.toLocaleString('ar')}</td></tr>)}</tbody></table></div></details>
    <div className="offline-help"><h2>النسخ الاحتياطية</h2><p>ملف التصدير يحتوي على بيانات حسابك. احفظه في مكان خاص وآمن.</p>
    <div className="flex flex-wrap gap-4">
      <button className="btn-secondary" disabled={busy} onClick={() => void run(download)}>تصدير كل البيانات JSON</button>
      <label className="btn-secondary">استيراد JSON<input type="file" accept="application/json,.json" disabled={busy} className="hidden" onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ''; if (file) void run(async () => importLocal(JSON.parse(await file.text()))); }} /></label>
      <button className="btn-secondary" disabled={busy} onClick={() => { if (window.confirm('مسح البيانات المحلية لهذا الحساب؟ تأكد من تصدير نسخة احتياطية.')) void run(clearLocal); }}>مسح الكاش المحلي</button></div>
    </div><p role="status" aria-live="polite">{busy ? 'جارٍ التنفيذ…' : message}</p>
  </section>;
}
