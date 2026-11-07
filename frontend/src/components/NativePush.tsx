import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/store/auth';
import { connectNativePush, enableNativePush, nativePushAvailable, nativePushClientConfigured, PushSetupError, hideNotificationPreview, saveNotificationPrivacy } from '@/lib/native-push';
import { Button, Card } from '@/components/ui';
import { apiError } from '@/lib/api';
export function NativePushConnection() {
  const user = useAuthStore(state => state.user); const navigate = useNavigate();
  useEffect(() => {
    if (!user || user.mustChangePassword) return;
    let active = true; let cleanup: (() => void) | undefined;
    void connectNativePush(user.id, navigate).then(stop => { if (active) cleanup = stop; else stop(); }).catch(() => undefined);
    return () => { active = false; cleanup?.(); };
  }, [user?.id, user?.mustChangePassword, navigate]);
  return null;
}
export function NativePushSettings() {
  const account = useAuthStore(state => state.user?.id || '');
  const [privatePreview, setPrivatePreview] = useState(() => hideNotificationPreview(account));
  const [status, setStatus] = useState(''); const [busy, setBusy] = useState(false);
  useEffect(() => { const handler = (event: Event) => setStatus((event as CustomEvent<string>).detail); window.addEventListener('halaqat:push-status', handler); return () => window.removeEventListener('halaqat:push-status', handler); }, []);
  if (!nativePushAvailable()) return null;
  const missingFirebase = !nativePushClientConfigured();
  return <Card title="إشعارات الجوال"><label className="mb-4 flex items-start gap-3 text-sm leading-7"><input className="mt-2" type="checkbox" checked={privatePreview} onChange={event => { setPrivatePreview(event.target.checked); saveNotificationPrivacy(account,event.target.checked); setStatus("حُفظت خصوصية المعاينة على الجهاز؛ تُحدّث إعدادات إشعارات الخلفية عند الاتصال وتسجيل الجهاز."); }} /><span>إخفاء محتوى الإشعارات خارج التطبيق. ألغِ التحديد لعرض العنوان والنص الحقيقيين.</span></label>{missingFirebase && <p role="status" className="mb-3 rounded-xl bg-amber-50 p-3 text-sm leading-6 text-amber-900">نسخة أندرويد هذه غير مربوطة بمشروع Firebase، لذلك أوقفنا التسجيل حتى لا يتعطل التطبيق. على المسؤول إعداد ملف google-services.json ثم إصدار نسخة جديدة.</p>}<Button disabled={busy || missingFirebase} onClick={async () => { setBusy(true); try { await enableNativePush(); setStatus('تم منح الإذن، جارٍ تسجيل الجهاز للإشعارات'); } catch (error) { setStatus(error instanceof PushSetupError ? error.message : apiError(error, 'تعذر تفعيل الإشعارات؛ تحقق من إعداد Firebase أو Apple في نسخة التطبيق')); } finally { setBusy(false); } }}>تفعيل إشعارات الجوال</Button>{status && <p role="status" className="mt-3 text-sm">{status}</p>}</Card>;
}
