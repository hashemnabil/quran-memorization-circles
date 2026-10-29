export const LOCK_AFTER_MS = 60_000;
export interface LockStorage { get(key: string): Promise<string | null>; set(key: string, value: string): Promise<void>; remove(key: string): Promise<void> }
type Record = { version: 1; salt: string; hash: string; failures: number; retryAt: number; departedAt: number | null; deviceUnlock: boolean };
const encode = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));
const decode = (value: string) => Uint8Array.from(atob(value), char => char.charCodeAt(0));
async function digest(pin: string, salt: Uint8Array) {
  const material = await crypto.subtle.importKey('raw', new TextEncoder().encode(pin), 'PBKDF2', false, ['deriveBits']);
  return encode(new Uint8Array(await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: new Uint8Array(salt), iterations: 600000, hash: 'SHA-256' }, material, 256)));
}
export const needsLocalLock = (departed: number | null, now: number) => departed === null || now < departed || now - departed >= LOCK_AFTER_MS;
export function createAppLock(storage: LockStorage, now = Date.now) {
  const key = (account: string) => `app-lock-v1:${account}`;
  // Serialize writes so background persistence cannot overwrite failed-attempt limits.
  let serial: Promise<unknown> = Promise.resolve();
  const run = <T>(work: () => Promise<T>): Promise<T> => { const result = serial.then(work, work); serial = result.catch(() => undefined); return result; };
  const read = async (account: string): Promise<Record | null> => {
    const raw = await storage.get(key(account)); if (!raw) return null;
    const value = JSON.parse(raw);
    if (value.version !== 1 || typeof value.salt !== 'string' || typeof value.hash !== 'string' || !Number.isFinite(value.failures) || !Number.isFinite(value.retryAt) || value.departedAt !== null && !Number.isFinite(value.departedAt)) throw new Error('تعذر قراءة إعدادات القفل بأمان');
    return value;
  };
  const write = (account: string, value: Record) => storage.set(key(account), JSON.stringify(value));
  return {
    read: (account: string) => run(() => read(account)),
    setup: (account: string, pin: string, deviceUnlock = false) => run(async () => {
      if (!/^\d{6,12}$/.test(pin) || /^(\d)\1+$/.test(pin)) throw new Error('اختر رمزًا من 6 إلى 12 رقمًا غير متطابق');
      if (await read(account)) throw new Error('افتح القفل الحالي قبل تغيير الرمز');
      const salt = crypto.getRandomValues(new Uint8Array(16));
      await write(account, { version: 1, salt: encode(salt), hash: await digest(pin, salt), failures: 0, retryAt: 0, departedAt: null, deviceUnlock });
    }),
    verify: (account: string, pin: string) => run(async () => {
      const record = await read(account); if (!record) throw new Error('لم يتم إعداد رمز القفل');
      if (record.retryAt > now()) throw new Error(`حاول بعد ${Math.ceil((record.retryAt - now()) / 1000)} ثانية`);
      const candidate = await digest(pin, decode(record.salt));
      let difference = candidate.length ^ record.hash.length;
      for (let index = 0; index < record.hash.length; index++) difference |= record.hash.charCodeAt(index) ^ (candidate.charCodeAt(index) || 0);
      if (difference) {
        record.failures++;
        record.retryAt = record.failures >= 5 ? now() + Math.min(900000, 30000 * 2 ** Math.min(5, record.failures - 5)) : 0;
        await write(account, record); throw new Error('رمز القفل غير صحيح');
      }
      record.failures = 0; record.retryAt = 0; record.departedAt = null; await write(account, record);
    }),
    depart: (account: string, at = now()) => run(async () => { const record = await read(account); if (record) { record.departedAt = at; await write(account, record); } }),
    // Called only after the native OS authentication callback reports success.
    deviceVerified: (account: string) => run(async () => { const record = await read(account); if (!record?.deviceUnlock) throw new Error('فتح الجهاز غير مفعّل'); record.failures = 0; record.retryAt = 0; record.departedAt = null; await write(account, record); }),
  };
}
