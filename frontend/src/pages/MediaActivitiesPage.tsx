import { useState } from 'react';
import JSZip from 'jszip';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { api, apiError } from '@/lib/api';
import { Button, Card, Input, LoadingState, PageHeader } from '@/components/ui';

type Activity = { id: string; type: string; title: string; description: string; activityDate: string; workUrl?: string | null; createdAt: string; createdBy?: { fullName: string } };
const types: Record<string, string> = {
  REPORT_FILLING: 'تعبئة تقارير',
  PHOTOGRAPHY: 'تصوير',
  PUBLISHING: 'نشر',
  EDITING: 'مونتاج',
  DESIGN: 'تصميم',
};

const xmlEscape = (value: unknown) => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&apos;');

async function downloadExcel(rows: Activity[], from: string, to: string) {
  const headers = ['تاريخ التنفيذ', 'نوع العمل', 'عنوان العمل', 'التفاصيل', 'رابط العمل', 'أضافه'];
  const data = rows.map(a => [
    String(a.activityDate).slice(0, 10),
    types[a.type] || a.type,
    a.title,
    a.description,
    a.workUrl || '',
    a.createdBy?.fullName || '—',
  ]);
  const allRows = [headers, ...data];
  const cell = (value: unknown, column: number, row: number) =>
    `<c r="${String.fromCharCode(65 + column)}${row}" t="inlineStr"><is><t xml:space="preserve">${xmlEscape(value)}</t></is></c>`;
  const sheetRows = allRows.map((row, ri) =>
    `<row r="${ri + 1}">${row.map((value, ci) => cell(value, ci, ri + 1)).join('')}</row>`
  ).join('');
  const zip = new JSZip();
  zip.file('[Content_Types].xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>');
  zip.file('_rels/.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>');
  zip.file('xl/workbook.xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="سجل الإعلام" sheetId="1" r:id="rId1"/></sheets></workbook>');
  zip.file('xl/_rels/workbook.xml.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>');
  zip.file('xl/worksheets/sheet1.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${sheetRows}</sheetData></worksheet>`);
  const blob = await zip.generateAsync({ type: 'blob', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `media-activities-${from}-to-${to}.xlsx`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export default function MediaActivitiesPage() {
  const qc = useQueryClient();
  const [type, setType] = useState('PHOTOGRAPHY');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [activityDate, setActivityDate] = useState(new Date().toISOString().slice(0, 10));
  const [workUrl, setWorkUrl] = useState('');
  const [reportFrom, setReportFrom] = useState('');
  const [reportTo, setReportTo] = useState('');
  const [exporting, setExporting] = useState(false);
  const activities = useQuery({ queryKey: ['media-activities'], queryFn: async () => (await api.get<Activity[]>('/media-activities')).data });
  const create = useMutation({
    mutationFn: async () => (await api.post('/media-activities', { type, title, description, activityDate, workUrl: workUrl.trim() || undefined })).data,
    onSuccess: async () => { toast.success('تم حفظ النشاط الإعلامي'); setTitle(''); setDescription(''); setWorkUrl(''); await qc.invalidateQueries({ queryKey: ['media-activities'] }); },
    onError: e => toast.error(apiError(e)),
  });
  const remove = useMutation({
    mutationFn: (id: string) => api.delete('/media-activities/' + id),
    onSuccess: async () => { toast.success('تم حذف السجل'); await qc.invalidateQueries({ queryKey: ['media-activities'] }); },
    onError: e => toast.error(apiError(e)),
  });

  const exportReport = async () => {
    if (!reportFrom || !reportTo) {
      toast.error('يرجى تحديد تاريخ البداية والنهاية');
      return;
    }
    if (reportFrom > reportTo) {
      toast.error('تاريخ البداية يجب أن يكون قبل تاريخ النهاية');
      return;
    }
    setExporting(true);
    try {
      const response = await api.get<Activity[]>('/media-activities', { params: { from: reportFrom, to: reportTo } });
      if (!response.data.length) {
        toast.error('لا توجد سجلات إعلام ضمن الفترة المحددة');
        return;
      }
      await downloadExcel(response.data, reportFrom, reportTo);
      toast.success(`تم تصدير ${response.data.length} سجل إعلام`);
    } catch (error) {
      toast.error(apiError(error));
    } finally {
      setExporting(false);
    }
  };

  return <div className="space-y-6" dir="rtl">
    <PageHeader title="سجل الإعلام" subtitle="سجّل الأعمال الإعلامية مع وصف واضح وتاريخ التنفيذ ورابط العمل المنشور إن وجد." />
    <Card title="تصدير تقرير سجل الإعلام إلى Excel">
      <p className="mb-4 text-sm text-slate-600">اختر الفترة الزمنية لتصدير كل سجلات الإعلام الواقعة ضمنها.</p>
      <div className="grid gap-4 md:grid-cols-3 md:items-end">
        <Input label="من تاريخ" type="date" value={reportFrom} onChange={e => setReportFrom(e.target.value)} required />
        <Input label="إلى تاريخ" type="date" value={reportTo} onChange={e => setReportTo(e.target.value)} required />
        <Button type="button" onClick={exportReport} disabled={exporting || !reportFrom || !reportTo}>
          {exporting ? 'جارٍ تجهيز التقرير...' : 'تصدير Excel'}
        </Button>
      </div>
    </Card>
    <Card title="إضافة نشاط إعلامي">
      <form className="grid gap-4 md:grid-cols-2" onSubmit={e => { e.preventDefault(); create.mutate(); }}>
        <label className="grid gap-1 text-sm font-medium">نوع العمل
          <select className="rounded-lg border border-slate-300 bg-white p-2.5" value={type} onChange={e => setType(e.target.value)}>
            {Object.entries(types).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label>
        <Input label="عنوان العمل" value={title} onChange={e => setTitle(e.target.value)} required placeholder="مثال: تصوير حفل تكريم الطلاب" />
        <Input label="تاريخ التنفيذ" type="date" value={activityDate} onChange={e => setActivityDate(e.target.value)} required />
        <Input label="رابط العمل (اختياري)" value={workUrl} onChange={e => setWorkUrl(e.target.value)} placeholder="رابط المنشور أو الملف" />
        <label className="grid gap-1 text-sm font-medium md:col-span-2">شو تم تصويره أو تصميمه أو نشره أو مونتاجه؟
          <textarea className="min-h-28 rounded-lg border border-slate-300 p-3" value={description} onChange={e => setDescription(e.target.value)} required placeholder="اكتب تفاصيل العمل، المكان أو المناسبة، والمخرجات..." />
        </label>
        <div><Button type="submit" disabled={create.isPending || !title.trim() || !description.trim()}>{create.isPending ? 'جارٍ الحفظ...' : 'حفظ النشاط'}</Button></div>
      </form>
    </Card>
    <Card title="سجل الأعمال">
      {activities.isLoading ? <LoadingState /> : activities.isError ? <p className="text-sm text-red-600">تعذر تحميل سجل الإعلام.</p> : activities.data?.length ? <div className="space-y-3">
        {activities.data.map(a => <article key={a.id} className="rounded-xl border border-slate-200 p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="mb-2 flex flex-wrap items-center gap-2"><span className="rounded-full bg-primary-50 px-3 py-1 text-xs font-semibold text-primary-800">{types[a.type] || a.type}</span><span className="text-xs text-slate-500">{new Date(a.activityDate).toLocaleDateString('ar')}</span></div>
              <h3 className="font-bold text-slate-900">{a.title}</h3>
              <p className="mt-2 whitespace-pre-wrap text-sm leading-7 text-slate-600">{a.description}</p>
              <p className="mt-2 text-xs text-slate-400">أضافه: {a.createdBy?.fullName || '—'}</p>
              {a.workUrl && <a className="mt-2 inline-block text-sm text-primary-700 underline" href={a.workUrl} target="_blank" rel="noreferrer">فتح رابط العمل</a>}
            </div>
            <Button variant="secondary" onClick={() => { if (window.confirm('هل تريد حذف هذا السجل؟')) remove.mutate(a.id); }} disabled={remove.isPending}>حذف</Button>
          </div>
        </article>)}
      </div> : <p className="text-sm text-slate-500">لا توجد أعمال مسجلة حتى الآن.</p>}
    </Card>
  </div>;
}
