import { useMemo, useState } from 'react';
import JSZip from 'jszip';
import toast from 'react-hot-toast';
import { api, apiError } from '@/lib/api';
import { Button, Card, PageHeader, Textarea } from '@/components/ui';

type Row = Record<string, string>;
const normalizePhone = (value: string) => value.replace(/[\s()-]/g, '');
const fill = (template: string, row: Row) => template.replace(/\{([^{}]+)\}/g, (_, name: string) => row[name.trim()] ?? '');
function parseCsv(text: string): string[][] {
  const rows: string[][] = []; let row: string[] = []; let cell = ''; let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"' && quoted && text[i+1] === '"') { cell += '"'; i++; }
    else if (c === '"') quoted = !quoted;
    else if (c === ',' && !quoted) { row.push(cell); cell = ''; }
    else if ((c === '\n' || c === '\r') && !quoted) { if (c === '\r' && text[i+1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = ''; }
    else cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows;
}
async function parseWorkbook(file: File): Promise<Row[]> {
  let grid: string[][];
  if (file.name.toLowerCase().endsWith('.csv')) grid = parseCsv(await file.text());
  else if (file.name.toLowerCase().endsWith('.xlsx')) {
    const zip = await JSZip.loadAsync(file);
    const sharedFile = zip.file('xl/sharedStrings.xml');
    const xml = new DOMParser();
    const shared = sharedFile ? Array.from(xml.parseFromString(await sharedFile.async('text'), 'text/xml').getElementsByTagName('si')).map(n => n.textContent ?? '') : [];
    const sheet = zip.file('xl/worksheets/sheet1.xml');
    if (!sheet) throw new Error('لم يتم العثور على الورقة الأولى');
    const doc = xml.parseFromString(await sheet.async('text'), 'text/xml');
    grid = Array.from(doc.getElementsByTagName('row')).map(row => {
      const cells: string[] = [];
      for (const cell of Array.from(row.getElementsByTagName('c'))) {
        const ref = cell.getAttribute('r') ?? '';
        const letters = ref.match(/^[A-Z]+/)?.[0] ?? 'A';
        let index = 0; for (const letter of letters) index = index * 26 + letter.charCodeAt(0) - 64;
        const raw = cell.getElementsByTagName('v')[0]?.textContent ?? cell.getElementsByTagName('is')[0]?.textContent ?? '';
        cells[index-1] = cell.getAttribute('t') === 's' ? (shared[Number(raw)] ?? '') : raw;
      }
      return cells;
    });
  } else throw new Error('ارفع ملف XLSX أو CSV');
  const headers = (grid.shift() ?? []).map(v => String(v ?? '').trim());
  if (!headers.length || headers.some(v => !v) || new Set(headers).size !== headers.length) throw new Error('أسماء الأعمدة فارغة أو مكررة');
  return grid.filter(row => row.some(v => String(v ?? '').trim())).map(row => Object.fromEntries(headers.map((name,i) => [name, String(row[i] ?? '')])));
}
export default function SmsPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [template, setTemplate] = useState('ولي الأمر المحترم، بخصوص الطالب {الاسم}: {الملاحظة}. إدارة المدرسة.');
  const [phoneColumn, setPhoneColumn] = useState('رقم الهاتف');
  const [sending, setSending] = useState(false);
  const columns = Object.keys(rows[0] ?? {});
  const tokens = [...template.matchAll(/\{([^{}]+)\}/g)].map(m => m[1].trim());
  const missing = [...new Set(tokens.filter(t => !columns.includes(t)))];
  const messages = useMemo(() => rows.map(row => ({ phone: normalizePhone(row[phoneColumn] ?? ''), title: 'رسالة من المدرسة', text: fill(template,row).trim() })), [rows, phoneColumn, template]);
  const invalid = messages.filter(m => !/^\+?[0-9]{8,15}$/.test(m.phone) || !m.text || m.text.length > 1000).length;
  const upload = async (file?: File) => {
    if (!file) return;
    try { const data = await parseWorkbook(file); if (data.length > 5000) throw new Error('الحد الأقصى 5000 صف'); setRows(data); setPhoneColumn(Object.keys(data[0] ?? {}).find(c => /هاتف|جوال|موبايل|phone|mobile/i.test(c)) ?? 'رقم الهاتف'); toast.success(`تم تحميل ${data.length} صف`); }
    catch(e) { toast.error(e instanceof Error ? e.message : 'تعذر قراءة الملف'); }
  };
  const send = async () => {
    if (!rows.length || missing.length || invalid) return toast.error('راجع الأعمدة والأرقام قبل الإرسال');
    if (!window.confirm(`تأكيد إرسال ${messages.length} رسالة SMS فعلية؟ قد تُخصم رسوم من رصيدك.`)) return;
    setSending(true);
    try {
      let accepted = 0;
      for (let i=0; i<messages.length; i+=200) {
        const result = await api.post('/sms/send', { confirm:true, messages: messages.slice(i,i+200) });
        if (!result.data?.accepted) throw new Error('لم يؤكد الخادم قبول الدفعة');
        accepted += Math.min(200,messages.length-i);
      }
      toast.success(`قبل المزوّد ${accepted} رسالة للمعالجة؛ راجع حالة التسليم في لوحة OfflineSMS`);
    } catch(e) { toast.error(apiError(e)); } finally { setSending(false); }
  };
  return <div dir="rtl" className="space-y-5"><PageHeader title="رسائل SMS" />
    <Card><div className="space-y-4"><h2 className="font-bold">استيراد المستلمين</h2><p className="text-sm">ارفع XLSX أو CSV؛ الصف الأول يحتوي أسماء الأعمدة. لا ترفع كلمات مرور دائمة.</p>
      <input aria-label="ملف المستلمين" type="file" accept=".xlsx,.csv" onChange={e => void upload(e.target.files?.[0])}/>
      {!!columns.length && <label className="block">عمود رقم الهاتف <select className="block w-full rounded-lg border p-2" value={phoneColumn} onChange={e=>setPhoneColumn(e.target.value)}>{columns.map(c=><option key={c}>{c}</option>)}</select></label>}
    </div></Card>
    <Card><div className="space-y-3"><h2 className="font-bold">القالب الموحّد</h2><Textarea label="نص الرسالة" value={template} onChange={e=>setTemplate(e.target.value)} />
      <div className="flex flex-wrap gap-2">{columns.filter(c=>c!==phoneColumn).map(c=><button key={c} className="rounded-lg border px-3 py-1 text-sm" onClick={()=>setTemplate(v=>v+' {'+c+'}')}>{'{'+c+'}'}</button>)}</div>
      {!!missing.length && <p role="alert" className="text-red-700">أعمدة غير موجودة: {missing.join('، ')}</p>}
      <p>عدد المستلمين: {rows.length} | أرقام أو رسائل غير صالحة: {invalid}</p>
    </div></Card>
    {!!rows.length && <Card><div className="space-y-3"><h2 className="font-bold">معاينة الرسائل</h2><div className="max-h-96 space-y-3 overflow-auto">{messages.slice(0,30).map((m,i)=><div key={i} className="rounded-xl border p-3"><strong>{m.phone}</strong><p className="whitespace-pre-wrap">{m.text}</p></div>)}</div>{messages.length>30 && <p>تظهر أول 30 رسالة فقط؛ سيتم إرسال جميع الصفوف.</p>}
      <Button disabled={sending || !!missing.length || !!invalid} onClick={()=>void send()}>{sending?'جارٍ الإرسال…':`تأكيد وإرسال ${messages.length} رسالة`}</Button>
    </div></Card>}
  </div>;
}
