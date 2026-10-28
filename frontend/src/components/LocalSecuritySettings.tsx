import { useState } from 'react';
import toast from 'react-hot-toast';
import { changeLocalPin } from '@/lib/local-lock';
import { useAuthStore } from '@/store/auth';
import { Button, Card, Input } from './ui';
export default function LocalSecuritySettings() {
  const account = useAuthStore(state => state.user!.id);
  const [current, setCurrent] = useState(''); const [next, setNext] = useState(''); const [confirm, setConfirm] = useState(''); const [busy, setBusy] = useState(false);
  return <Card title="القفل الأمني"><p className="mb-4 text-sm leading-7 text-slate-500">يُقفل التطبيق بعد مغادرته 60 ثانية. رمز التطبيق مستقل عن كلمة مرور المدرسة، ولا يحذف القفل بياناتك أو التعديلات المعلقة. يلزم التحقق من الخادم كل 30 يومًا للعمل دون إنترنت.</p><Button variant="secondary" onClick={() => window.dispatchEvent(new Event('qc:lock-now'))}>قفل التطبيق الآن</Button><form className="mt-5 grid gap-4 sm:grid-cols-2" onSubmit={async event => {
    event.preventDefault(); setBusy(true);
    try { if (next !== confirm) throw new Error('رمزا القفل غير متطابقين'); await changeLocalPin(account, current, next); setCurrent(''); setNext(''); setConfirm(''); toast.success('تم تغيير رمز التطبيق'); }
    catch (error) { toast.error(error instanceof Error ? error.message : 'تعذر تغيير الرمز'); } finally { setBusy(false); }
  }}><Input label="رمز التطبيق الحالي" type="password" inputMode="numeric" required autoComplete="off" value={current} onChange={event => setCurrent(event.target.value)} /><Input label="رمز جديد (6 إلى 12 رقمًا)" type="password" inputMode="numeric" required autoComplete="off" value={next} onChange={event => setNext(event.target.value)} /><Input label="تأكيد الرمز الجديد" type="password" inputMode="numeric" required autoComplete="off" value={confirm} onChange={event => setConfirm(event.target.value)} /><Button loading={busy} type="submit">تغيير رمز التطبيق</Button></form></Card>;
}
