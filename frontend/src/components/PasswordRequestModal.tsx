import { useState } from 'react';
import axios from 'axios';
import { api, apiError } from '@/lib/api';
import { Modal, Input, Button } from '@/components/ui';
import { phoneError } from '@/lib/validation';
import { savePendingSupport } from '@/lib/offline/pendingSupport';

export default function PasswordRequestModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [form, setForm] = useState({ name: '', code: '', nationalId: '', username: '', whatsapp: '' });
  const [busy, setBusy] = useState(false); const [message, setMessage] = useState(''); const [error, setError] = useState('');
  const [requestId] = useState(() => crypto.randomUUID());
  const submit = async (event: React.FormEvent) => {
    event.preventDefault(); setError('');
    if (Object.values(form).some(value => !value.trim())) return setError('يرجى تعبئة جميع الحقول');
    const invalidPhone = phoneError(form.whatsapp); if (invalidPhone) return setError(invalidPhone);
    const payload = { requestId, contactName: form.name.trim(), contactPhone: form.whatsapp.trim(), subject: 'طلب تغيير كلمة المرور',
      description: `الاسم: ${form.name.trim()}\nرقم الطالب: ${form.code.trim()}\nرقم الهوية: ${form.nationalId.trim()}\nاسم المستخدم: ${form.username.trim()}\nواتساب: ${form.whatsapp.trim()}` };
    setBusy(true);
    try {
      if (!navigator.onLine) { await savePendingSupport(payload); setMessage('حُفظ الطلب على جهازك وسيُرسل للإدارة عند عودة الإنترنت.'); }
      else {
        try { const { data } = await api.post('/support/public', payload); setMessage(`وصل طلبك للإدارة برقم ${data.number}. ستراجع هويتك وتتواصل معك على رقم واتساب الذي أدخلته.`); }
        catch (failure) { if (axios.isAxiosError(failure) && !failure.response) { await savePendingSupport(payload); setMessage('تعذر تأكيد وصول الطلب؛ حُفظ محليًا لإعادة المحاولة عند الاتصال.'); } else throw failure; }
      }
    } catch (failure) { setError(apiError(failure)); } finally { setBusy(false); }
  };
  return <Modal open={open} onClose={onClose} title="طلب تغيير كلمة المرور">
    {message ? <div role="status" className="space-y-5"><p className="leading-8">{message}</p><Button onClick={onClose}>تم</Button></div> : <form onSubmit={submit} className="space-y-4">
      <p className="text-sm leading-7 text-slate-500">أدخل بيانات حسابك لتتحقق الإدارة منها. إرسال الطلب لا يغيّر كلمة المرور تلقائيًا.</p>
      {([['name', 'الاسم الكامل'], ['code', 'رقم الطالب'], ['nationalId', 'رقم الهوية'], ['username', 'اسم المستخدم'], ['whatsapp', 'رقم واتساب للتواصل']] as const).map(([key, label]) => <Input key={key} label={label} value={form[key]} maxLength={key === 'name' ? 120 : 50} required onChange={e => setForm({ ...form, [key]: e.target.value })} type={key === 'whatsapp' ? 'tel' : 'text'} />)}
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
      <Button type="submit" loading={busy} className="w-full">إرسال الطلب للإدارة</Button>
    </form>}
  </Modal>;
}
