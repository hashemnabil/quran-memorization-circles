import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/store/auth';
import { connectNativePush, enableNativePush, nativePushAvailable, nativePushClientConfigured, PushSetupError } from '@/lib/native-push';
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
  const [status, setStatus] = useState(''); const [busy, setBusy] = useState(false);
  useEffect(() => { const handler = (event: Event) => setStatus((event as CustomEvent<string>).detail); window.addEventListener('halaqat:push-status', handler); return () => window.removeEventListener('halaqat:push-status', handler); }, []);
  if (!nativePushAvailable()) return null;
  const missingFirebase = !nativePushClientConfigured();
  return <Card title="إشعارات الجوال">{missingFirebase && <p role="status" className="mb-3 rounded-xl bg-amber-50 p-3 text-sm leading-6 text-amber-900">نسخة أندرويد هذه غير مربوطة بمشروع Firebase، لذلك أوقفنا التسجيل حتى لا يتعطل التطبيق. على المسؤول إعداد ملف google-services.json ثم إصدار نسخة جديدة.</p>}<Button disabled={busy || missingFirebase} onClick={async () => { setBusy(true); try { await enableNativePush(); setStatus('تم منح الإذن، جارٍ تسجيل الجهاز للإشعارات'); } catch (error) { setStatus(error instanceof PushSetupError ? error.message : apiError(error, 'تعذر تفعيل الإشعارات؛ تحقق من إعداد Firebase أو Apple في نسخة التطبيق')); } finally { setBusy(false); } }}>تفعيل إشعارات الجوال</Button>{status && <p role="status" className="mt-3 text-sm">{status}</p>}</Card>;
}
