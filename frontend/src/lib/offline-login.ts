import type { AuthUser } from '../types';

const prefix = 'qc.offlineLogin.v1:';
const encode = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));
const decode = (value: string) => Uint8Array.from(atob(value), char => char.charCodeAt(0));
const recordKey = (username: string) => prefix + username.trim().toLowerCase();
const aliasKey = (account: string) => `qc.offlineLogin.aliases:${account}`;
async function derive(password: string, salt: Uint8Array) {
  const material = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', salt: new Uint8Array(salt), iterations: 600000, hash: 'SHA-256' }, material,
    { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}
export async function rememberOfflineLogin(username: string, password: string, user: AuthUser, _legacyTokens?: { accessToken: string; refreshToken: string }) {
  if (!user.isActive || user.role === 'PARENT') return;
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await derive(password, salt);
  const identity = { id: user.id, username: user.username, fullName: user.fullName, role: user.role,
    isActive: true, mustChangePassword: !!user.mustChangePassword };
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key,
    new TextEncoder().encode(JSON.stringify({ user: identity })));
  localStorage.setItem(recordKey(username), JSON.stringify({ salt: encode(salt), iv: encode(iv), data: encode(new Uint8Array(ciphertext)) }));
  const aliases = JSON.parse(localStorage.getItem(aliasKey(user.id)) || '[]') as string[];
  localStorage.setItem(aliasKey(user.id), JSON.stringify([...new Set([...aliases, username.trim().toLowerCase()])]));
}
export function forgetOfflineLogin(username: string) { localStorage.removeItem(recordKey(username)); }
export function forgetAccountOfflineLogin(account: string, username: string) {
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
    if (session.accessToken || session.refreshToken) await rememberOfflineLogin(username, password, session.user);
    // Legacy encrypted envelopes may contain tokens; never restore or expose them.
    return { user: session.user as AuthUser };
  } catch { throw new Error('اسم المستخدم أو كلمة المرور غير صحيحة للدخول المحلي'); }
}
