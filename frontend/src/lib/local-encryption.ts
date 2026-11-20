import nacl from 'tweetnacl';
import Dexie, { type DBCore, type DBCoreCursor } from 'dexie';

const marker = 'qc.encryptedAccount:';
let active: { account: string; key: Uint8Array } | undefined;
const known = new Set<string>();
export function encodeBytes(bytes: Uint8Array) {
  const chunks: string[] = [];
  for (let start = 0; start < bytes.length; start += 32768) chunks.push(String.fromCharCode(...bytes.subarray(start, start + 32768)));
  return btoa(chunks.join(''));
}
export const decodeBytes = (value: string) => Uint8Array.from(atob(value), char => char.charCodeAt(0));
const rootAccount = (account: string) => account.replace(/:snapshot$/, '');
export function dataKey(account: string): Uint8Array | undefined { return active?.account === rootAccount(account) ? active.key : undefined; }
export function activateDataKey(account: string, key: Uint8Array) {
  if (key.length !== 32) throw new Error('Invalid local encryption key');
  const copy = new Uint8Array(key);
  lockDataKeys(); active = { account, key: copy }; known.add(account);
  try { localStorage.setItem(marker + account, '1'); } catch { /* Tests or unavailable storage. */ }
}
export function lockDataKeys() { active?.key.fill(0); active = undefined; }
export function encryptedAccount(account: string) {
  try { return known.has(rootAccount(account)) || localStorage.getItem(marker + rootAccount(account)) === '1'; } catch { return known.has(rootAccount(account)); }
}
export function forgetEncryptionMarker(account: string) { known.delete(account); try { localStorage.removeItem(marker + account); } catch { /* unavailable */ } }
export function sealValue(account: string, context: string, value: unknown): unknown {
  const key = dataKey(account);
  if (!key) { if (encryptedAccount(account)) throw new Error('افتح الحساب بكلمة مروره للوصول إلى بياناته المحلية'); return value; }
  const nonce = nacl.randomBytes(nacl.secretbox.nonceLength);
  const bytes = new TextEncoder().encode(JSON.stringify({ account, context, value }));
  return { __localCipher: 1, nonce: encodeBytes(nonce), ciphertext: encodeBytes(nacl.secretbox(bytes, nonce, key)) };
}
export function openValue<T = any>(account: string, context: string, value: any): T {
  if (value?.__localCipher !== 1) return value;
  const key = dataKey(account); if (!key) throw new Error('بيانات الحساب مقفلة؛ أدخل كلمة مروره');
  const opened = nacl.secretbox.open(decodeBytes(value.ciphertext), decodeBytes(value.nonce), key);
  if (!opened) throw new Error('تعذر التحقق من تشفير البيانات المحلية');
  const packet = JSON.parse(new TextDecoder().decode(opened));
  if (packet.account !== account || packet.context !== context) throw new Error('البيانات المحلية لا تخص هذا الحساب أو السجل');
  return packet.value;
}

// Blob conversion is the only asynchronous part. Dexie.waitFor keeps the write
// transaction alive; encryption itself stays synchronous inside IndexedDB.
async function pack(value: any): Promise<any> {
  if (value instanceof Blob) return { __localBlob: 1, type: value.type, bytes: encodeBytes(new Uint8Array(await value.arrayBuffer())) };
  if (value instanceof Uint8Array) return { __localBytes: 1, bytes: encodeBytes(value) };
  if (value instanceof Date) return { __localDate: value.toISOString() };
  if (Array.isArray(value)) return Promise.all(value.map(pack));
  if (value && typeof value === 'object') return Object.fromEntries(await Promise.all(Object.entries(value).map(async ([key, item]) => [key, await pack(item)])));
  return value;
}
function unpack(value: any): any {
  if (value?.__localBlob === 1) return new Blob([new Uint8Array(decodeBytes(value.bytes))], { type: value.type });
  if (value?.__localBytes === 1) return decodeBytes(value.bytes);
  if (typeof value?.__localDate === 'string') return new Date(value.__localDate);
  if (Array.isArray(value)) return value.map(unpack);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, unpack(item)]));
  return value;
}
const owner = (row: any) => row?.accountId || (typeof row?.key === 'string' && !row.key.startsWith('[') ? row.key.split(':')[0] : '');
export function installLocalEncryption(db: Dexie) {
  db.use({ stack: 'dbcore', name: 'account-payload-encryption', level: 1, create(down: DBCore): DBCore {
    return { ...down, table(name) {
      const table = down.table(name);
      if (name === 'credentialKeys') return table; // Non-extractable queue key; queue payload is encrypted separately.
      const fields = [...new Set([table.schema.primaryKey, ...table.schema.indexes].flatMap(index => typeof index.keyPath === 'string' ? [index.keyPath] : index.keyPath || []))];
      const decode = (row: any) => {
        if (!row?.__sealedLocal) return row;
        const account = owner(row);
        if (!dataKey(account)) return { ...row, __sealedLocal: undefined, __lockedLocal: true };
        const packet = openValue<{ routing: Record<string, any>; data: any }>(account, name, row.__sealedLocal);
        for (const [key, value] of Object.entries(packet.routing)) if (JSON.stringify(row[key]) !== JSON.stringify(value)) throw new Error('تغيّرت معرّفات سجل محلي مشفّر');
        const result = unpack(packet.data);
        if (result.id === undefined && row.id !== undefined) result.id = row.id; // IndexedDB auto-increment.
        return result;
      };
      const wrap = (cursor: DBCoreCursor): DBCoreCursor => new Proxy(cursor, { get(target, property) {
        if (property === 'value') return decode(target.value);
        if (property === 'next') return () => target.next().then(wrap);
        const value = Reflect.get(target, property, target); return typeof value === 'function' ? value.bind(target) : value;
      } });
      return { ...table,
        get: request => table.get(request).then(decode),
        getMany: request => table.getMany(request).then(rows => rows.map(decode)),
        query: request => table.query(request).then(result => request.values === false ? result : { ...result, result: result.result.map(decode) }),
        openCursor: request => table.openCursor(request).then(cursor => cursor && request.values !== false ? wrap(cursor) : cursor),
        mutate(request) {
          if (request.type !== 'add' && request.type !== 'put') return table.mutate(request);
          return Dexie.waitFor(Promise.all(request.values.map(async row => {
            const account = owner(row);
            if (!dataKey(account)) { if (encryptedAccount(account)) throw new Error('الحساب مقفل؛ لم تُحفظ بيانات غير مشفرة'); return row; }
            if (row.__lockedLocal) throw new Error('لا يمكن تعديل بيانات حساب مقفل');
            const routing = Object.fromEntries(fields.filter(field => row[field] !== undefined).map(field => [field, row[field]]));
            return { ...routing, __sealedLocal: sealValue(account, name, { routing, data: await pack(row) }) };
          }))).then(values => table.mutate({ ...request, values }));
        },
      };
    } };
  } });
}
