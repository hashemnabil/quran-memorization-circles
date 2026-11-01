import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { api, apiError } from '@/lib/api';
import { Button, Input, Modal } from './ui';

export default function CreateFounderAccount() {
  const [open, setOpen] = useState(false), [busy, setBusy] = useState(false), [message, setMessage] = useState('');
  const empty = { username: '', fullName: '', password: '', currentPassword: '' };
  const [form, setForm] = useState(empty);
  const queries = useQueryClient();
  const close = () => { if (!busy) { setOpen(false); setForm(empty); setMessage(''); } };
  return <>
    <Button variant="secondary" onClick={() => { setForm(empty); setMessage(''); setOpen(true); }}>إضافة مؤسس آخر</Button>
    <Modal open={open} onClose={close} title="إضافة حساب مؤسس جديد">
      <p className="mb-4 text-sm leading-7 text-slate-500">هذا الحساب يملك صلاحيات المؤسس. الإضافة تحتاج اتصالاً بالخادم وتأكيد كلمة مرور حسابك، وتُسجّل في سجل العمليات. الحساب الجديد يغيّر كلمته المؤقتة عند أول دخول.</p>
      <form className="space-y-3" onSubmit={async event => {
        event.preventDefault(); setMessage('');
        if (!navigator.onLine) { setMessage('إضافة مؤسس تتطلب اتصالاً مباشراً؛ لم يُحفظ طلب ترقية محلي.'); return; }
        setBusy(true);
        try { await api.post('/founder/accounts', form); setForm(empty); setOpen(false); await queries.invalidateQueries({ queryKey: ['users'] }); await queries.invalidateQueries({ queryKey: ['founder'] }); }
        catch (error) { setMessage(apiError(error)); }
        finally { setBusy(false); }
      }}>
        <Input label="اسم مستخدم المؤسس الجديد" autoComplete="off" minLength={3} maxLength={32} value={form.username} onChange={event => setForm({ ...form, username: event.target.value })} />
        <Input label="اسم المؤسس الجديد" maxLength={120} value={form.fullName} onChange={event => setForm({ ...form, fullName: event.target.value })} />
        <Input label="كلمة المرور المؤقتة للمؤسس الجديد" type="password" autoComplete="new-password" minLength={12} maxLength={128} value={form.password} onChange={event => setForm({ ...form, password: event.target.value })} />
        <Input label="كلمة مرور حسابك لتأكيد الإضافة" type="password" autoComplete="current-password" value={form.currentPassword} onChange={event => setForm({ ...form, currentPassword: event.target.value })} />
        {message && <p role="alert" className="text-sm text-red-700">{message}</p>}
        <div className="flex gap-2"><Button type="submit" loading={busy} disabled={!form.username.trim() || !form.fullName.trim() || form.password.length < 12 || !form.currentPassword}>إنشاء حساب المؤسس</Button><Button type="button" variant="ghost" disabled={busy} onClick={close}>إلغاء</Button></div>
      </form>
    </Modal>
  </>;
}
