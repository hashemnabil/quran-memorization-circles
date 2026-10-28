import { Capacitor, registerPlugin } from '@capacitor/core';
import { credentialStorage } from './credential-storage';
import { createAppLock } from './app-lock';
export const appLock = createAppLock(credentialStorage);
export const DeviceSecurity = registerPlugin<{ available(): Promise<{ available: boolean }>; authenticate(): Promise<void> }>('DeviceSecurity');
export const nativeDeviceSecurity = () => Capacitor.getPlatform() === 'android' && Capacitor.isPluginAvailable('DeviceSecurity');
export async function resetLockAfterOnlineLogin(account: string) {
  if (sessionStorage.getItem('qc.lockRecovery') !== account) return;
  await credentialStorage.remove(`app-lock-v1:${account}`);
  sessionStorage.removeItem('qc.lockRecovery');
  window.dispatchEvent(new Event('qc:lock-changed'));
}
export async function changeLocalPin(account: string, current: string, next: string) {
  if (!/^\d{6,12}$/.test(next) || /^(\d)\1+$/.test(next)) throw new Error('اختر رمزًا من 6 إلى 12 رقمًا غير متطابق');
  await appLock.verify(account, current);
  const previous = await credentialStorage.get(`app-lock-v1:${account}`);
  if (!previous) throw new Error('القفل غير مهيأ');
  // Keep the previous verifier until the replacement has been durably written.
  let staged: string | undefined;
  const replacement = createAppLock({ get: async () => null, set: async (_key, value) => { staged = value; }, remove: async () => undefined });
  await replacement.setup(account, next, JSON.parse(previous).deviceUnlock);
  await credentialStorage.set(`app-lock-v1:${account}`, staged!);
}
