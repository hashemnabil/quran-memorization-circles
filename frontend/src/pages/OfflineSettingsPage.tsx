import { useEffect, useState } from 'react';
import { db, entityTables } from '@/lib/db';
import { accountId, clearLocal, exportLocal, importLocal, pullAll, syncAll } from '@/lib/offline-engine';
import { queryClient } from '@/lib/queryClient';

export default function OfflineSettingsPage() {
  const [counts, setCounts] = useState<Record<string, number>>({}); const [message, setMessage] = useState(''); const [busy, setBusy] = useState(false);
  const refresh = async () => { const rows = await Promise.all(entityTables.map(async (table) => [table, await db.table(table).where('accountId').equals(accountId()).count()])); setCounts(Object.fromEntries(rows)); };
  useEffect(() => { void refresh(); }, []);
  const run = async (action: () => Promise<any>) => { setBusy(true); setMessage(''); try { await action(); await refresh(); await queryClient.invalidateQueries(); setMessage('تمت العملية'); } catch (e) { setMessage(e instanceof Error ? e.message : 'تعذرت العملية'); } finally { setBusy(false); } };
  const download = async () => { const backup = await exportLocal(); const url = URL.createObjectURL(new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' })); const link = document.createElement('a'); link.href = url; link.download = `halaqat-${new Date().toISOString().slice(0, 10)}.json`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); };
  return <section dir="rtl" className="space-y-5 p-5"><h1 className="text-2xl font-bold">إدارة البيانات المحلية</h1>
    <p>نزّل البيانات أثناء الاتصال قبل استخدامها دون إنترنت. العمليات المعلقة تبقى محفوظة حتى يؤكد الخادم تطبيقها.</p>
    <table className="w-full text-right"><thead><tr><th>الجدول</th><th>عدد السجلات</th></tr></thead><tbody>{Object.entries(counts).map(([table, count]) => <tr key={table}><td>{table}</td><td>{count}</td></tr>)}</tbody></table>
    <div className="flex flex-wrap gap-4"><button className="btn-primary" disabled={busy} onClick={() => void run(async () => { await syncAll(); await pullAll(); })}>تحميل كل البيانات للأوفلاين</button>
      <button className="btn-secondary" disabled={busy} onClick={() => void run(download)}>تصدير كل البيانات JSON</button>
      <label className="btn-secondary">استيراد JSON<input type="file" accept="application/json,.json" disabled={busy} className="hidden" onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ''; if (file) void run(async () => importLocal(JSON.parse(await file.text()))); }} /></label>
      <button className="btn-secondary" disabled={busy} onClick={() => { if (window.confirm('مسح البيانات المحلية لهذا الحساب؟ تأكد من تصدير نسخة احتياطية.')) void run(clearLocal); }}>مسح الكاش المحلي</button></div>
    <p role="status">{busy ? 'جارٍ التنفيذ…' : message}</p>
  </section>;
}
