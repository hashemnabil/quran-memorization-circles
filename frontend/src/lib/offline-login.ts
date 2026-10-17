import type { AuthUser } from '../types';
import { activateDataKey, dataKey, encodeBytes, decodeBytes, encryptedAccount } from './local-encryption';

const prefix = 'qc.offlineLogin.v1:';
const encode = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));
const decode = (value: string) => Uint8Array.from(atob(value), char => char.charCodeAt(0));
const recordKey = (username: string) => prefix + username.trim().toLowerCase();
const aliasKey = (account: string) => `qc.offlineLogin.aliases:${account}`;
const accountGeneration = new Map<string, number>();
const usernameGeneration = new Map<string, number>();
async function derive(password: string, salt: Uint8Array) {
  const material = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', salt: new Uint8Array(salt), iterations: 600000, hash: 'SHA-256' }, material,
    { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}
export async function rememberOfflineLogin(username: string, password: string, user: AuthUser, _legacyTokens?: { accessToken: string; refreshToken: string }) {
  if (!user.isActive || user.role === 'PARENT') return;
  const accountVersion = accountGeneration.get(user.id) || 0;
  const usernameVersion = usernameGeneration.get(recordKey(username)) || 0;
  const activeKey = dataKey(user.id);
  let localKey = activeKey ? new Uint8Array(activeKey) : undefined;
  if (!localKey) {
    const existing = localStorage.getItem(recordKey(username));
    if (existing) {
      try {
        const record = JSON.parse(existing);
        const previousKey = await derive(password, decode(record.salt));
        const bytes = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: decode(record.iv) }, previousKey, decode(record.data));
        const previous = JSON.parse(new TextDecoder().decode(bytes));
        if (previous.user?.id === user.id && previous.dataKey) localKey = decodeBytes(previous.dataKey);
      } catch { if (encryptedAccount(user.id)) throw new Error('البيانات المحلية محفوظة بكلمة مرور سابقة؛ افتحها بها أولًا قبل تحديث كلمة المرور المحلية'); }
    }
    if (!localKey && encryptedAccount(user.id)) throw new Error('مفتاح النسخة المحلية غير متاح؛ لم تُمسح بياناتك أو تعديلاتك');
    localKey ||= crypto.getRandomValues(new Uint8Array(32));
  }
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await derive(password, salt);
  const identity = { id: user.id, username: user.username, fullName: user.fullName, role: user.role,
    isActive: true, mustChangePassword: !!user.mustChangePassword };
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key,
    new TextEncoder().encode(JSON.stringify({ user: identity, dataKey: encodeBytes(localKey) })));
  if (accountVersion !== (accountGeneration.get(user.id) || 0) || usernameVersion !== (usernameGeneration.get(recordKey(username)) || 0)) return;
  localStorage.setItem(recordKey(username), JSON.stringify({ salt: encode(salt), iv: encode(iv), data: encode(new Uint8Array(ciphertext)) }));
  const aliases = JSON.parse(localStorage.getItem(aliasKey(user.id)) || '[]') as string[];
  localStorage.setItem(aliasKey(user.id), JSON.stringify([...new Set([...aliases, username.trim().toLowerCase()])]));
  activateDataKey(user.id, localKey);
}
export function forgetOfflineLogin(username: string) {
  const key = recordKey(username); usernameGeneration.set(key, (usernameGeneration.get(key) || 0) + 1);
  localStorage.removeItem(key);
}
export function forgetAccountOfflineLogin(account: string, username: string) {
  accountGeneration.set(account, (accountGeneration.get(account) || 0) + 1);
  let aliases: string[] = [];
  try { aliases = JSON.parse(localStorage.getItem(aliasKey(account)) || '[]'); } catch { /* Legacy record. */ }
  for (const alias of [...aliases, username]) forgetOfflineLogin(alias);
  localStorage.removeItem(aliasKey(account));
}
export async function unlockOfflineLogin(username: string, password: string) {
  const raw = localStorage.getItem(recordKey(username));
  if (!raw) throw new Error('سجّل الدخول بهذا الحساب مرة واحدة مع النت لتفعيل الدخول بدون نت على هذا الجهاز');
  try {
    const record = JSON.parse(raw);
    const key = await derive(password, decode(record.salt));
    const bytes = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: decode(record.iv) }, key, decode(record.data));
    const session = JSON.parse(new TextDecoder().decode(bytes));
    if (!session.user?.isActive || typeof session.user.id !== 'string') throw new Error();
    if (session.dataKey) activateDataKey(session.user.id, decodeBytes(session.dataKey));
    else await rememberOfflineLogin(username, password, session.user);
    // Legacy encrypted envelopes may contain tokens; never restore or expose them.
    return { user: session.user as AuthUser };
  } catch { throw new Error('اسم المستخدم أو كلمة المرور غير صحيحة للدخول المحلي'); }
}
