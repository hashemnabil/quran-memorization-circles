import { dataKey, openValue, sealValue } from './local-encryption';

export type ReconnectCredentials = { account: string; username: string; password: string };
const slot = 'qc.reconnectCredentials';
// The tab already holds the unlocked data key. Keep only authenticated
// ciphertext here so a page reload can still verify the supplied password on
// reconnect. Never use localStorage, IndexedDB, exports or logs for this packet.
export function cacheReconnectCredentials(value: ReconnectCredentials) {
  if (!dataKey(value.account)) throw new Error('الحساب مقفل');
  sessionStorage.setItem(slot, JSON.stringify(sealValue(value.account, slot, value)));
}
export function restoreReconnectCredentials(account: string): ReconnectCredentials | undefined {
  const raw = sessionStorage.getItem(slot); if (!raw || !dataKey(account)) return;
  try {
    const value = openValue<ReconnectCredentials>(account, slot, JSON.parse(raw));
    if (value?.account === account && typeof value.username === 'string' && typeof value.password === 'string') return value;
  } catch { /* Another account or an invalid packet cannot restore verification. */ }
}
export function clearReconnectCredentials() { sessionStorage.removeItem(slot); }
