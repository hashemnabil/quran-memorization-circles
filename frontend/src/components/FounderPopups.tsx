import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, apiError } from '@/lib/api';
import { Button, Card, Input, Modal, Select, Textarea } from '@/components/ui';
import { PopupBody, type Popup } from './PopupAnnouncements';
import { ROLE_LABELS } from '@/lib/labels';

const localDateValue = (value: string | Date) => { const date = new Date(value); return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16); };
const draft = () => ({ title: '', body: '', link: '', audience: [] as string[], publishedAt: localDateValue(new Date()), expiresAt: '', popup: { placement: 'BEFORE', repeat: 'ONCE_DEVICE', state: 'DRAFT', priority: 0, requireAck: false, important: false, buttonText: '', imageAssetId: '', videoAssetId: '' } });
export default function FounderPopups() {
  const cache = useQueryClient(), [form, setForm] = useState<any>(draft), [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false), [message, setMessage] = useState(''), [preview, setPreview] = useState(false);
  const [phone, setPhone] = useState(true), [dark, setDark] = useState(false);
  const [afterLogin, setAfterLogin] = useState(false);
  const [readers, setReaders] = useState<any[] | null>(null);
  const rows = useQuery({ queryKey: ['founder', 'popups'], queryFn: async () => (await api.get('/popup-announcements/manage')).data });
  const assets = useQuery({ queryKey: ['founder-assets'], queryFn: async () => (await api.get('/founder-assets')).data });
  const field = (key: string, value: unknown) => setForm((previous: any) => ({ ...previous, [key]: value }));
  const config = (key: string, value: unknown) => setForm((previous: any) => ({ ...previous, popup: { ...previous.popup, [key]: value } }));
  return <Card title="الإعلانات والرسائل العامة">
    <p className="mb-4 text-sm text-slate-500">الإيقاف يصل للأجهزة المتصلة؛ قد يبقى الإعلان المحفوظ لدى جهاز غير متصل حتى انتهاء صلاحيته.</p>
    <form className="space-y-3" onSubmit={async event => {
      event.preventDefault(); setBusy(true); setMessage('');
      try { await api.post('/popup-announcements/save', { ...form, password, publishedAt: new Date(form.publishedAt).toISOString(), expiresAt: form.expiresAt ? new Date(form.expiresAt).toISOString() : null }); setPassword(''); setForm(draft()); setMessage('حُفظ الإعلان'); await cache.invalidateQueries({ queryKey: ['founder', 'popups'] }); }
      catch (error) { setMessage(apiError(error)); } finally { setBusy(false); }
    }}>
      <Input label="العنوان" maxLength={200} value={form.title} onChange={event => field('title', event.target.value)} />
      <Textarea label="نص الإعلان" maxLength={2000} value={form.body} onChange={event => field('body', event.target.value)} />
      <div className="grid gap-3 sm:grid-cols-2">
        <Select label="مكان الظهور" value={form.popup.placement} onChange={event => { config('placement', event.target.value); if (event.target.value !== 'AFTER') field('audience', []); }}><option value="BEFORE">قبل تسجيل الدخول</option><option value="AFTER">بعد تسجيل الدخول</option><option value="BOTH">قبل الدخول وبعده — إعلان عام</option></Select>
        <Select label="حالة الإعلان" value={form.popup.state} onChange={event => config('state', event.target.value)}><option value="DRAFT">مسودة</option><option value="PUBLISHED">منشور</option><option value="STOPPED">متوقف</option><option value="ARCHIVED">محذوف من العرض — حفظ السجل والإحصاءات</option></Select>
        <Select label="سياسة الظهور" value={form.popup.repeat} onChange={event => config('repeat', event.target.value)}><option value="ONCE_USER">مرة لكل مستخدم</option><option value="ONCE_DEVICE">مرة لكل جهاز</option><option value="DAILY">مرة يومياً</option><option value="OPEN">كل فتح للموقع</option><option value="UNTIL_ACK">حتى تأكيد القراءة</option></Select>
        <Input label="الأولوية (0–100)" type="number" min={0} max={100} value={form.popup.priority} onChange={event => config('priority', Number(event.target.value))} />
        <Input label="تاريخ البداية" type="datetime-local" value={form.publishedAt} onChange={event => field('publishedAt', event.target.value)} />
        <Input label="تاريخ النهاية — اختياري" type="datetime-local" value={form.expiresAt} onChange={event => field('expiresAt', event.target.value)} />
        <Input label="نص الزر — اختياري" maxLength={60} value={form.popup.buttonText} onChange={event => config('buttonText', event.target.value)} />
        <Input label="رابط الزر — مسار داخلي أو HTTPS" value={form.link} maxLength={500} onChange={event => field('link', event.target.value)} />
        <Select label="صورة من المكتبة — اختياري" value={form.popup.imageAssetId} onChange={event => config('imageAssetId', event.target.value)}><option value="">بدون صورة</option>{(Array.isArray(assets.data) ? assets.data : []).filter((asset: any) => asset.kind === 'ANNOUNCEMENT_IMAGE').map((asset: any) => <option value={asset.id} key={asset.id}>{asset.title}</option>)}</Select>
        <Select label="فيديو من المكتبة — اختياري" value={form.popup.videoAssetId || ''} onChange={event => config('videoAssetId', event.target.value)}><option value="">بدون فيديو</option>{(Array.isArray(assets.data) ? assets.data : []).filter((asset: any) => asset.kind === 'ANNOUNCEMENT_VIDEO').map((asset: any) => <option value={asset.id} key={asset.id}>{asset.title}</option>)}</Select>
      </div>
      {form.popup.placement === 'AFTER' && <fieldset><legend className="mb-2 text-sm">الجمهور — تركه فارغاً يعني الجميع</legend><div className="flex flex-wrap gap-3">{Object.entries(ROLE_LABELS).map(([role, label]) => <label key={role} className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" checked={form.audience.includes(role)} onChange={event => field('audience', event.target.checked ? [...form.audience, role] : form.audience.filter((value: string) => value !== role))} />{label}</label>)}</div></fieldset>}
      <label className="flex min-h-11 items-center gap-2"><input type="checkbox" checked={form.popup.requireAck} onChange={event => config('requireAck', event.target.checked)} />يتطلب تأكيد القراءة بعد الدخول</label>
      <label className="flex min-h-11 items-center gap-2"><input type="checkbox" checked={form.popup.important} onChange={event => config('important', event.target.checked)} />إعلان مهم</label>
      <Input label="كلمة المرور لتأكيد الحفظ أو النشر" type="password" autoComplete="current-password" value={password} onChange={event => setPassword(event.target.value)} />
      <div className="flex flex-wrap gap-2"><Button type="submit" loading={busy} disabled={!password || !form.title.trim()}>حفظ الإعلان</Button><Button type="button" variant="secondary" onClick={() => setPreview(true)}>معاينة الإعلان</Button><Button type="button" variant="ghost" onClick={() => setForm(draft())}>إعلان جديد</Button></div>
      {form.id && <div className="flex flex-wrap gap-2"><Button type="button" variant="secondary" disabled={busy || !password} onClick={async () => {
        setBusy(true); try { const { data } = await api.post(`/popup-announcements/${form.id}/notify`, { password }); setMessage(data.message); setPassword(''); } catch (error) { setMessage(apiError(error)); } finally { setBusy(false); }
      }}>إرسال إشعار مرتبط — مرة واحدة</Button><Button type="button" variant="ghost" onClick={async () => {
        try { const { data } = await api.get(`/popup-announcements/${form.id}/readers`); setReaders(Array.isArray(data) ? data : []); } catch (error) { setMessage(apiError(error)); }
      }}>حالات القراءة للمستخدمين</Button></div>}
    </form>
    {message && <p role="status" className="my-3">{message}</p>}
    {rows.isError && <p role="alert">تعذر تحميل الإعلانات</p>}
    <ul className="mt-5 divide-y">{(Array.isArray(rows.data) ? rows.data : []).map((row: Popup & { counts: any[] }) => <li key={row.id} className="space-y-2 py-4"><strong>{row.title}</strong><p className="text-xs text-slate-500">{({DRAFT:"مسودة",PUBLISHED:"منشور",STOPPED:"متوقف",ARCHIVED:"محذوف من العرض"} as Record<string,string>)[row.popup.state]} · {row.counts.map(count => `${({VIEW:"ظهور فعلي",CLICK:"ضغطات",ACK:"تأكيد قراءة",DISPATCH:"دفعة إشعارات محفوظة"} as Record<string,string>)[count.kind] || count.kind}: ${count._count}`).join(' · ')}</p><div className="flex gap-2"><Button variant="secondary" onClick={() => { setPassword(''); setForm({ ...row, publishedAt: localDateValue(row.publishedAt), expiresAt: row.expiresAt ? localDateValue(row.expiresAt) : '', link: row.link || '' }); }}>تعديل / إيقاف</Button><Button variant="ghost" onClick={() => { setPassword(''); setForm({ ...row, id: undefined, publishedAt: localDateValue(row.publishedAt), expiresAt: row.expiresAt ? localDateValue(row.expiresAt) : "", title: `${row.title} — نسخة`, popup: { ...row.popup, state: 'DRAFT' } }); }}>نسخ كمسودة</Button></div></li>)}</ul>
    <Modal open={preview} onClose={() => setPreview(false)} title="معاينة — لم يُنشر الإعلان" size="lg"><div className="mb-4 flex flex-wrap gap-2"><Button variant="secondary" onClick={() => setPhone(value => !value)}>{phone ? 'عرض الكمبيوتر' : 'عرض الهاتف'}</Button><Button variant="secondary" onClick={() => setDark(value => !value)}>{dark ? 'الوضع الفاتح' : 'الوضع الداكن'}</Button><Button variant="secondary" onClick={() => setAfterLogin(value => !value)}>{afterLogin ? 'معاينة قبل الدخول' : 'معاينة بعد الدخول'}</Button></div><div className={`mx-auto rounded-2xl border p-5 ${dark ? 'bg-slate-900 text-white' : 'bg-white text-slate-800'}`} style={{ maxWidth: phone ? 360 : undefined }}><p className="mb-2 text-xs">{afterLogin ? 'بعد تسجيل الدخول' : 'قبل تسجيل الدخول'}</p><h2 className="mb-4 text-xl font-bold">{form.title || 'عنوان الإعلان'}</h2><PopupBody row={form} />{afterLogin && (form.popup.requireAck || form.popup.repeat === 'UNTIL_ACK') && <Button className="mt-4" type="button">اطلعت — معاينة فقط</Button>}</div></Modal>
    <Modal open={readers !== null} onClose={() => setReaders(null)} title="حالات القراءة — آخر 1000 حدث"><ul className="divide-y">{readers?.map(person => <li key={person.id} className="py-3"><strong>{person.fullName}</strong><p className="text-sm">{person.receipts.some((receipt: any) => receipt.kind === 'ACK') ? 'أكد القراءة' : 'ظهر الإعلان'}</p></li>)}</ul></Modal>
  </Card>;
}
