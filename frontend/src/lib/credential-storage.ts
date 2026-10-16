import { Capacitor } from '@capacitor/core';
import { SecureStorage, KeychainAccess } from '@aparajita/capacitor-secure-storage';

let nativeReady: Promise<void> | undefined;
async function prepare() {
  if (!Capacitor.isNativePlatform()) return;
  if (!Capacitor.isPluginAvailable('SecureStorage')) throw new Error('إضافة التخزين الآمن غير متاحة؛ يلزم تحديث بناء التطبيق');
  nativeReady ||= (async () => {
    await SecureStorage.setSynchronize(false);
    await SecureStorage.setDefaultKeychainAccess(KeychainAccess.whenUnlockedThisDeviceOnly);
    await SecureStorage.setKeyPrefix('halaqat.auth.');
  })().catch(error => { nativeReady = undefined; throw error; });
  await nativeReady;
}
// Browser storage is tab-scoped, not described or used as native secure storage.
// Native errors fail closed: there is deliberately no Preferences/localStorage fallback.
export const credentialStorage = {
  async get(key: string): Promise<string | null> { await prepare(); return Capacitor.isNativePlatform() ? SecureStorage.getItem(key) : sessionStorage.getItem(key); },
  async set(key: string, value: string) { await prepare(); if (Capacitor.isNativePlatform()) await SecureStorage.setItem(key, value); else sessionStorage.setItem(key, value); },
  async remove(key: string) { await prepare(); if (Capacitor.isNativePlatform()) await SecureStorage.remove(key); else sessionStorage.removeItem(key); },
};
