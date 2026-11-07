import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api, apiError } from '@/lib/api';
import { useAuthStore } from '@/store/auth';
import { Button, Card, Input, Textarea } from '@/components/ui';
import { DEFAULT_SCHOOL_NAME } from '@/config/branding';
export default function AccountDeletionPage() {
  const user = useAuthStore(state => state.user);
  const [password, setPassword] = useState(''); const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false); const [notice, setNotice] = useState(''); const [error, setError] = useState('');
  const submit = async (event: React.FormEvent) => {
    event.preventDefault(); setError(''); setBusy(true);
    try { const { data } = await api.post('/support/account-deletion', { currentPassword: password, reason }); setPassword(''); setNotice(`وصل طلب حذف حسابك وبياناتك للإدارة برقم ${data.number}. ستراجع الإدارة السجلات المرتبطة وأي احتفاظ مطلوب وتوضح لك نتيجة المعالجة. لم تُحذف بياناتك تلقائيًا.`); }
    catch (failure) { setError(apiError(failure)); } finally { setBusy(false); }
  };
  return <main dir="rtl" className="min-h-screen bg-slate-50 px-5 py-10"><div className="mx-auto max-w-xl">
    <p className="mb-3 text-sm font-bold text-primary-700">{DEFAULT_SCHOOL_NAME}</p><h1 className="mb-6 text-2xl font-extrabold">طلب حذف الحساب والبيانات</h1>
    <Card><p className="mb-5 text-sm leading-8 text-slate-600">يمكن لصاحب الحساب بدء طلب حذف حسابه والبيانات المرتبطة به. تُراجع الإدارة السجلات التعليمية وطلبات الاحتفاظ قبل التنفيذ. يمكنك متابعة الطلب من الدعم الفني. التحقق من الهوية وإرسال هذا الطلب يحتاجان اتصالًا بالخادم.</p>
      {!user ? <Link to="/login" className="btn-primary inline-flex">تسجيل الدخول للتحقق من هويتي</Link> : notice ? <p role="status" className="leading-8">{notice}</p> : <form onSubmit={submit} className="space-y-4">
        <p className="font-bold">الحساب: {user.fullName}</p><Input label="كلمة المرور الحالية للتحقق" type="password" autoComplete="current-password" value={password} maxLength={128} onChange={e => setPassword(e.target.value)} required />
        <Textarea label="ملاحظات للطلب — اختياري" value={reason} maxLength={1000} onChange={e => setReason(e.target.value)} />
        {error && <p role="alert" className="text-red-700">{error}</p>}<Button type="submit" loading={busy} disabled={!navigator.onLine}>إرسال طلب حذف حسابي</Button>
      </form>}
    </Card><div className="mt-5 flex gap-4 text-sm font-bold text-primary-700"><Link to="/privacy">سياسة الخصوصية</Link><Link to={user ? '/profile' : '/login'}>العودة</Link></div>
  </div></main>;
}
