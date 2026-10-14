import { useState } from 'react';
import JSZip from 'jszip';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { api, apiError } from '@/lib/api';
import { useAuthStore } from '@/store/auth';
import { Button, Card, Input, LoadingState, PageHeader } from '@/components/ui';

type Media = { id: string; date: string; day: string; activity: string; idea: string; content: string };
type Duty = { id: string; date: string; day: string; note: string | null; assignments: { teacherUserId: string }[] };
type Teacher = { id: string; fullName: string };
const dateText = (s: string) => s.slice(0, 10);
const escapeXml = (value: unknown) => String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
async function excel(filename: string, headers: string[], rows: string[][]) {
  const zip = new JSZip();
  const all = [headers, ...rows];
  const xmlRows = all.map((row, i) => '<row r="' + (i + 1) + '">' + row.map((v, j) =>
    '<c r="' + String.fromCharCode(65 + j) + (i + 1) + '" t="inlineStr"><is><t xml:space="preserve">' + escapeXml(v) + '</t></is></c>').join('') + '</row>').join('');
  zip.file('[Content_Types].xml', '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>');
  zip.file('_rels/.rels', '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>');
  zip.file('xl/workbook.xml', '<?xml version="1.0"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="الجدول" sheetId="1" r:id="rId1"/></sheets></workbook>');
  zip.file('xl/_rels/workbook.xml.rels', '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>');
  zip.file('xl/worksheets/sheet1.xml', '<?xml version="1.0"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>' + xmlRows + '</sheetData></worksheet>');
  const blob = await zip.generateAsync({ type: 'blob', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = filename + '.xlsx'; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
const initialMedia = { date: new Date().toISOString().slice(0, 10), day: '', activity: '', idea: '', content: '' };
export function MediaSchedulePage() {
  const qc = useQueryClient();
  const [form, setForm] = useState(initialMedia);
  const [editing, setEditing] = useState<string | null>(null);
  const query = useQuery({ queryKey: ['schedule-media'], queryFn: async () => (await api.get<Media[]>('/schedules/media')).data });
  const save = useMutation({ mutationFn: () => editing ? api.patch('/schedules/media/' + editing, form) : api.post('/schedules/media', form),
    onSuccess: () => { toast.success('تم الحفظ'); setEditing(null); setForm(initialMedia); void qc.invalidateQueries({ queryKey: ['schedule-media'] }); },
    onError: e => toast.error(apiError(e)) });
  const remove = useMutation({ mutationFn: (id: string) => api.delete('/schedules/media/' + id),
    onSuccess: () => { toast.success('تم الحذف'); void qc.invalidateQueries({ queryKey: ['schedule-media'] }); }, onError: e => toast.error(apiError(e)) });
  return <div className="space-y-5" dir="rtl"><PageHeader title="جدول الإعلام" subtitle="خطة الإعلام الخاصة بالإدارة" />
    <Card title={editing ? 'تعديل خطة إعلامية' : 'إضافة خطة إعلامية'}><form className="grid gap-3 md:grid-cols-2" onSubmit={e => { e.preventDefault(); save.mutate(); }}>
      <Input label="اليوم" value={form.day} required onChange={e => setForm({ ...form, day: e.target.value })} />
      <Input label="التاريخ" type="date" value={form.date} required onChange={e => setForm({ ...form, date: e.target.value })} />
      <Input label="شو بدنا نعمل؟" value={form.activity} required onChange={e => setForm({ ...form, activity: e.target.value })} />
      <Input label="الفكرة" value={form.idea} required onChange={e => setForm({ ...form, idea: e.target.value })} />
      <label className="grid gap-1 md:col-span-2">المحتوى<textarea className="rounded-lg border p-3" required value={form.content} onChange={e => setForm({ ...form, content: e.target.value })} /></label>
      <div className="flex gap-2"><Button type="submit" disabled={save.isPending}>حفظ</Button>{editing && <Button type="button" variant="secondary" onClick={() => { setEditing(null); setForm(initialMedia); }}>إلغاء</Button>}</div>
    </form></Card>
    <Card title="الخطط الإعلامية"><div className="mb-3"><Button type="button" onClick={() => void excel('media-schedule', ['اليوم', 'التاريخ', 'العمل', 'الفكرة', 'المحتوى'], (query.data || []).map(x => [x.day, dateText(x.date), x.activity, x.idea, x.content])).catch(e => toast.error(String(e)))}>تصدير Excel</Button></div>
      {query.isLoading ? <LoadingState /> : query.isError ? <p>تعذر تحميل الجدول</p> : <div className="overflow-x-auto"><table className="w-full text-right text-sm"><thead><tr>{['اليوم', 'التاريخ', 'العمل', 'الفكرة', 'المحتوى', 'الإجراءات'].map(h => <th key={h} className="border p-2">{h}</th>)}</tr></thead><tbody>{query.data?.map(x => <tr key={x.id}><td className="border p-2">{x.day}</td><td className="border p-2">{dateText(x.date)}</td><td className="border p-2">{x.activity}</td><td className="border p-2">{x.idea}</td><td className="border p-2 whitespace-pre-wrap">{x.content}</td><td className="border p-2"><div className="flex gap-2"><Button variant="secondary" onClick={() => { setEditing(x.id); setForm({ date: dateText(x.date), day: x.day, activity: x.activity, idea: x.idea, content: x.content }); }}>تعديل</Button><Button variant="secondary" onClick={() => { if (confirm('حذف السجل؟')) remove.mutate(x.id); }}>حذف</Button></div></td></tr>)}</tbody></table></div>}
    </Card></div>;
}
export function TeacherDutyPage() {
  const qc = useQueryClient();
  const admin = useAuthStore(s => s.user?.role === 'ADMIN');
  const [form, setForm] = useState({ date: new Date().toISOString().slice(0, 10), day: '', note: '', teacherUserIds: [] as string[] });
  const [editing, setEditing] = useState<string | null>(null);
  const duties = useQuery({ queryKey: ['teacher-duties'], queryFn: async () => (await api.get<Duty[]>('/schedules/duties')).data });
  const teachers = useQuery({ queryKey: ['duty-teachers'], enabled: admin, queryFn: async () => (await api.get<Teacher[]>('/schedules/teachers')).data });
  const save = useMutation({ mutationFn: () => editing ? api.patch('/schedules/duties/' + editing, form) : api.post('/schedules/duties', form),
    onSuccess: () => { toast.success('تم حفظ النظام وإرسال إشعارات التعيين'); setEditing(null); setForm({ date: new Date().toISOString().slice(0, 10), day: '', note: '', teacherUserIds: [] }); void qc.invalidateQueries({ queryKey: ['teacher-duties'] }); },
    onError: e => toast.error(apiError(e)) });
  const remove = useMutation({ mutationFn: (id: string) => api.delete('/schedules/duties/' + id),
    onSuccess: () => { toast.success('تم الحذف'); void qc.invalidateQueries({ queryKey: ['teacher-duties'] }); }, onError: e => toast.error(apiError(e)) });
  const names = (d: Duty) => d.assignments.map(a => teachers.data?.find(t => t.id === a.teacherUserId)?.fullName || a.teacherUserId).join('، ');
  return <div className="space-y-5" dir="rtl"><PageHeader title="جدول نظام المحفّظين" subtitle="تعيين أكثر من محفّظ في اليوم نفسه مع تذكير عند التعيين وقبل يوم وصباح الموعد" />
    {admin && <Card title={editing ? 'تعديل النظام' : 'تعيين نظام'}><form className="grid gap-3 md:grid-cols-2" onSubmit={e => { e.preventDefault(); save.mutate(); }}>
      <Input label="اليوم" required value={form.day} onChange={e => setForm({ ...form, day: e.target.value })} />
      <Input label="التاريخ" type="date" required value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} />
      <Input label="ملاحظات" value={form.note} onChange={e => setForm({ ...form, note: e.target.value })} />
      <fieldset className="rounded-lg border p-3 md:col-span-2"><legend>اختر المحفّظين (يمكن اختيار أكثر من واحد)</legend><div className="grid gap-2 md:grid-cols-3">{teachers.data?.map(t => <label key={t.id} className="flex gap-2"><input type="checkbox" checked={form.teacherUserIds.includes(t.id)} onChange={e => setForm({ ...form, teacherUserIds: e.target.checked ? [...form.teacherUserIds, t.id] : form.teacherUserIds.filter(id => id !== t.id) })} />{t.fullName}</label>)}</div></fieldset>
      <div className="flex gap-2"><Button type="submit" disabled={save.isPending || !form.teacherUserIds.length}>حفظ التعيين</Button>{editing && <Button type="button" variant="secondary" onClick={() => { setEditing(null); setForm({ date: new Date().toISOString().slice(0, 10), day: '', note: '', teacherUserIds: [] }); }}>إلغاء</Button>}</div>
    </form></Card>}
    <Card title="مواعيد النظام"><div className="mb-3"><Button type="button" onClick={() => void excel('teacher-duties', ['اليوم', 'التاريخ', 'المحفّظون', 'ملاحظات'], (duties.data || []).map(d => [d.day, dateText(d.date), names(d), d.note || ''])).catch(e => toast.error(String(e)))}>تصدير Excel</Button></div>
      {duties.isLoading ? <LoadingState /> : duties.isError ? <p>تعذر تحميل جدول النظام</p> : <div className="overflow-x-auto"><table className="w-full text-right text-sm"><thead><tr>{['اليوم', 'التاريخ', 'المحفّظون', 'ملاحظات', ...(admin ? ['الإجراءات'] : [])].map(h => <th key={h} className="border p-2">{h}</th>)}</tr></thead><tbody>{duties.data?.map(d => <tr key={d.id}><td className="border p-2">{d.day}</td><td className="border p-2">{dateText(d.date)}</td><td className="border p-2">{names(d)}</td><td className="border p-2">{d.note}</td>{admin && <td className="border p-2"><div className="flex gap-2"><Button variant="secondary" onClick={() => { setEditing(d.id); setForm({ date: dateText(d.date), day: d.day, note: d.note || '', teacherUserIds: d.assignments.map(a => a.teacherUserId) }); }}>تعديل</Button><Button variant="secondary" onClick={() => { if (confirm('حذف التعيين؟')) remove.mutate(d.id); }}>حذف</Button></div></td>}</tr>)}</tbody></table></div>}
    </Card></div>;
}
