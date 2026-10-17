import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/store/auth';
import { connectNativePush, enableNativePush, nativePushAvailable, PushSetupError } from '@/lib/native-push';
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
  return <Card title="إشعارات الجوال"><Button disabled={busy} onClick={async () => { setBusy(true); try { await enableNativePush(); setStatus('مُنح الإذن، جارٍ تسجيل الجهاز للإشعارات'); } catch (error) { setStatus(error instanceof PushSetupError ? error.message : apiError(error, 'تعذر تفعيل الإشعارات؛ يلزم التحقق من إعداد Firebase أو Apple في نسخة التطبيق')); } finally { setBusy(false); } }}>تفعيل إشعارات الجوال</Button>{status && <p role="status" className="mt-3 text-sm">{status}</p>}</Card>;
}
