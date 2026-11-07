import { db, type QueuedWrite } from './db';

const encode = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));
const decode = (text: string) => Uint8Array.from(atob(text), char => char.charCodeAt(0));
const binding = (op: Pick<QueuedWrite, 'accountId' | 'table' | 'entityId' | 'action' | 'opId'>) =>
  new TextEncoder().encode(JSON.stringify([op.accountId, op.table, op.entityId, op.action, op.opId]));
async function deviceKey(accountId: string, create: boolean) {
  const table = db.table('credentialKeys');
  let record = await table.get(accountId);
  if (!record && create) {
    const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
    // Recheck atomically so simultaneous saves cannot overwrite each other's key.
    await db.transaction('rw', table, async () => {
      record = await table.get(accountId);
      if (!record) { record = { accountId, key }; await table.put(record); }
    });
  }
  if (!record?.key) throw new Error('مفتاح العملية المحفوظة غير متاح على هذا الجهاز');
  return record.key as CryptoKey;
}
export async function sealCredentials(op: QueuedWrite): Promise<Record<string, any>> {
  const data = { ...op.data }; const secret: Record<string, string> = {};
  for (const name of ['password', 'newPassword', 'currentPassword', 'accountPassword']) if (data[name] !== undefined) {
    secret[name] = data[name]; delete data[name];
  }
  if (!Object.keys(secret).length) return data;
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deviceKey(op.accountId, true);
  const cipher = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: binding(op) }, key,
    new TextEncoder().encode(JSON.stringify(secret)));
  return { ...data, _sealedCredentials: { iv: encode(iv), ciphertext: encode(new Uint8Array(cipher)) } };
}
export async function openCredentials(op: QueuedWrite): Promise<Record<string, any>> {
  const { _sealedCredentials: sealed, ...data } = op.data;
  if (!sealed) return data;
  const key = await deviceKey(op.accountId, false);
  const bytes = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: decode(sealed.iv), additionalData: binding(op) }, key, decode(sealed.ciphertext));
  return { ...data, ...JSON.parse(new TextDecoder().decode(bytes)) };
}
