import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { App as NativeApp } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { useAuthStore } from '@/store/auth';
import { appLock, DeviceSecurity, nativeDeviceSecurity } from '@/lib/local-lock';
import { needsLocalLock } from '@/lib/app-lock';
import { Button, Input } from './ui';
import NotificationPermissionPrompt from './NotificationPermissionPrompt';
import { offlineAccessAllowed } from '@/lib/offline-access';
import { DEFAULT_SCHOOL_LOGO } from '@/config/branding';

async function ensureLocalAccess(account: string) {
  if (await offlineAccessAllowed(account)) return;
  if (navigator.onLine) await useAuthStore.getState().resumeOnline().catch(() => undefined);
  if (!await offlineAccessAllowed(account)) throw new Error('يلزم الاتصال للتحقق من الحساب كل 30 يومًا. بياناتك وتعديلاتك محفوظة.');
}

export default function AppSecurityGate({ children }: { children: ReactNode }) {
  const account = useAuthStore(state => state.user?.id);
  return account ? <AccountGate key={account} account={account}>{children}</AccountGate> : <>{children}</>;
}
function AccountGate({ account, children }: { account: string; children: ReactNode }) {
  const [state, setState] = useState<'checking' | 'setup' | 'locked' | 'open' | 'hidden'>('checking');
  const [pin, setPin] = useState(''); const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const [device, setDevice] = useState(false); const [useDevice, setUseDevice] = useState(false);
  const [deviceEnabled, setDeviceEnabled] = useState(false);
  const lockedRef = useRef(false); const authenticating = useRef(false);
  useEffect(() => {
    let active = true; let departed: number | null = null;
    const check = async () => {
      try {
        await ensureLocalAccess(account);
        const record = await appLock.read(account); if (!active) return;
        setDeviceEnabled(!!record?.deviceUnlock);
        lockedRef.current = !!record && (lockedRef.current || needsLocalLock(record.departedAt, Date.now()));
        setState(record ? lockedRef.current ? 'locked' : 'open' : 'setup');
      } catch (cause) { if (active) { lockedRef.current = true; setState('locked'); setError(cause instanceof Error && cause.message.startsWith('يلزم الاتصال') ? cause.message : 'تعذر فتح التخزين الآمن. أعد المحاولة أو سجّل الدخول من جديد.'); } }
    };
    void check();
    if (nativeDeviceSecurity()) void DeviceSecurity.available().then(result => { if (active) setDevice(result.available); }).catch(() => undefined);
    const lifecycle = (visible: boolean) => {
      if (!active || authenticating.current) return;
      if (!visible) {
        if (departed === null) { departed = Date.now(); setState('hidden'); void appLock.depart(account, departed).catch(() => { lockedRef.current = true; }); }
      } else if (departed !== null) { departed = null; void check(); }
    };
    const visibility = () => lifecycle(document.visibilityState === 'visible');
    const pagehide = () => lifecycle(false);
    const changed = () => { void check(); };
    const lockNow = () => { lockedRef.current = true; setState('locked'); };
    document.addEventListener('visibilitychange', visibility); window.addEventListener('pagehide', pagehide); window.addEventListener('qc:lock-changed', changed);
    const native = Capacitor.isNativePlatform() ? NativeApp.addListener('appStateChange', event => lifecycle(event.isActive)) : undefined;
    window.addEventListener('qc:lock-now', lockNow);
    // The authenticated subtree stays mounted during locking; its authorized sync remains active.
    return () => { active = false; document.removeEventListener('visibilitychange', visibility); window.removeEventListener('pagehide', pagehide); window.removeEventListener('qc:lock-changed', changed); window.removeEventListener('qc:lock-now', lockNow); void native?.then(listener => listener.remove()); };
  }, [account]);
  const blocked = state !== 'open';
  useLayoutEffect(() => {
    document.documentElement.dataset.appLocked = blocked ? '1' : '0';
    const protectPortals = () => document.querySelectorAll<HTMLElement>('[data-app-modal]').forEach(element => { element.inert = blocked; if (blocked) element.setAttribute('aria-hidden','true'); else element.removeAttribute('aria-hidden'); });
    protectPortals();
    const observer = new MutationObserver(protectPortals); observer.observe(document.body, { childList: true });
    return () => { observer.disconnect(); delete document.documentElement.dataset.appLocked; document.querySelectorAll<HTMLElement>('[data-app-modal]').forEach(element => { element.inert = false; element.removeAttribute('aria-hidden'); }); };
  }, [blocked]);
  return <>
    {!blocked && <NotificationPermissionPrompt />}
    <div ref={element => { if (element) element.inert = blocked; }} aria-hidden={blocked || undefined} style={blocked ? { visibility: 'hidden', position: 'fixed', inset: 0, pointerEvents: 'none' } : undefined}>{children}</div>
    {blocked && <main className="security-screen" data-security-blocked dir="rtl" aria-label="قفل التطبيق">
      <section className="security-panel"><img src={DEFAULT_SCHOOL_LOGO} alt="شعار المدرسة" className="security-mark object-contain p-1" /><h1>{state === 'setup' ? 'احمِ حسابك على هذا الجهاز' : 'حسابك في أمان'}</h1>
        <p>{state === 'setup' ? 'أنشئ رمزًا خاصًا بالتطبيق. يُقفل بعد مغادرته دقيقة، وتفتحه دون إنترنت مع بقاء بياناتك وتعديلاتك محفوظة.' : 'أدخل رمز التطبيق للعودة إلى الصفحة التي توقفت عندها.'}</p>
        {(state === 'checking' || state === 'hidden') ? <p role="status">حماية الحساب…</p> : <form onSubmit={async event => {
          event.preventDefault(); if (busy) return; setBusy(true); setError('');
          try {
            await ensureLocalAccess(account);
            if (state === 'setup') { if (pin !== confirm) throw new Error('رمزا القفل غير متطابقين'); await appLock.setup(account, pin, useDevice); setDeviceEnabled(useDevice); }
            else await appLock.verify(account, pin);
            if (useAuthStore.getState().user?.id === account) { lockedRef.current = false; setState('open'); setPin(''); setConfirm(''); }
          } catch (cause) { setError(cause instanceof Error ? cause.message : 'تعذر فتح القفل'); } finally { setBusy(false); }
        }}>
          <Input label="رمز التطبيق" type="password" inputMode="numeric" autoComplete="off" minLength={6} maxLength={12} required value={pin} onChange={event => setPin(event.target.value.replace(/\D/g, ''))} />
          {state === 'setup' && <><Input label="تأكيد الرمز" type="password" inputMode="numeric" autoComplete="off" required maxLength={12} value={confirm} onChange={event => setConfirm(event.target.value.replace(/\D/g, ''))} />{device && <label className="prayer-check"><input type="checkbox" checked={useDevice} onChange={event => setUseDevice(event.target.checked)} />السماح بالبصمة أو قفل الجهاز</label>}</>}
          {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
          <Button type="submit" loading={busy} className="w-full">{state === 'setup' ? 'حفظ الحماية والمتابعة' : 'فتح التطبيق'}</Button>
        </form>}
        {state === 'locked' && deviceEnabled && device && <Button disabled={busy} variant="secondary" className="mt-3 w-full" onClick={async () => { authenticating.current = true; setBusy(true); setError(''); try { await ensureLocalAccess(account); await DeviceSecurity.authenticate(); await appLock.deviceVerified(account); if (useAuthStore.getState().user?.id === account) { lockedRef.current = false; setState('open'); } } catch { setError('لم يكتمل التحقق؛ يمكنك استخدام رمز التطبيق.'); } finally { authenticating.current = false; setBusy(false); } }}>البصمة أو قفل الجهاز</Button>}
        {!Capacitor.isNativePlatform() && <p className="security-note">قفل الويب يحمي الواجهة في هذه الجلسة؛ لا يوفر حماية تخزين أندرويد أو ضمان فتح جلسة جديدة دون إنترنت.</p>}
        {state === 'locked' && <button type="button" className="mt-5 min-h-11 text-sm underline" onClick={() => { sessionStorage.setItem('qc.lockRecovery', account); void useAuthStore.getState().logout(); }}>نسيت الرمز؟ سجّل الدخول بكلمة مرور المدرسة مع الإنترنت لإعادة إعداده</button>}
      </section>
    </main>}
  </>;
}
