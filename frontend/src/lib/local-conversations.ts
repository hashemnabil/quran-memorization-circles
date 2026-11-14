import { db, type LocalRow } from './db';
import { accountId, get, save } from './offline-engine';
import { readActiveIdentity } from './active-identity';
import { readPrefetched } from './offline-prefetch';
import { cacheConversations } from './conversation-cache';
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const exactKey = (account: string, path: string) => JSON.stringify([account, path, []]);
function reject(message: string): never { throw Object.assign(new Error(message), { localWriteRejected: true }); }
async function hydrate(account: string) {
  if ((await db.meta.get(`${account}:conversationListKnown`))?.value) return;
  const cached = await readPrefetched(account, '/chat/conversations') ?? (await db.responses.get(exactKey(account, '/chat/conversations')))?.data;
  if (Array.isArray(cached)) await cacheConversations(account, cached, true);
}
export async function localConversation(path: string): Promise<any | undefined> {
  const account = accountId();
  await hydrate(account);
  const match = path.match(/^\/chat\/conversations(?:\/([^/]+))?$/);
  if (!match) return undefined;
  const rows = await get('chatConversations');
  const errors = await db.queue.where('accountId').equals(account).filter(op => op.table === 'chatConversations' && !!op.error).toArray();
  const decorated = rows.map((row): LocalRow => ({ ...row, syncError: errors.find(op => op.entityId === row.id)?.error }))
    .sort((a, b) => Number(b.synced === 0) - Number(a.synced === 0) || (Number(a._listOrder ?? 1e9) - Number(b._listOrder ?? 1e9)) || String(b.lastMessageAt || b.createdAt || '').localeCompare(String(a.lastMessageAt || a.createdAt || '')));
  if (!match[1]) return rows.length || (await db.meta.get(`${account}:conversationListKnown`))?.value ? decorated : undefined;
  const mapped = (await db.meta.get(`${account}:id:${match[1]}`))?.value || match[1];
  return decorated.find(row => row.id === mapped);
}
export async function createLocalConversation(kind: string, data: any) {
  const account = accountId(), actor = readActiveIdentity();
  if (!actor || actor.id !== account) reject('يلزم فتح الحساب قبل إنشاء محادثة');
  await hydrate(account);
  const ids = kind === 'direct' ? [data?.userId] : data?.memberIds;
  if (!Array.isArray(ids) || !ids.length || ids.length > 200 || ids.some(id => typeof id !== 'string' || !uuid.test(id) || id === account)) reject('اختر أعضاء صالحين من دليل التواصل المحفوظ');
  if (kind === 'group' && (typeof data?.title !== 'string' || !data.title.trim() || data.title.length > 120 || data.description !== undefined && (typeof data.description !== 'string' || data.description.length > 500))) reject('اكتب اسم مجموعة صالحًا ووصفًا لا يتجاوز 500 حرف');
  let directory = await readPrefetched(account, '/users/directory') ?? (await db.responses.get(exactKey(account, '/users/directory')))?.data;
  if (!Array.isArray(directory)) {
    const variants = await db.responses.where('accountId').equals(account).filter(cached => {
      try { return JSON.parse(cached.key)[1] === '/users/directory' && Array.isArray(cached.data); } catch { return false; }
    }).toArray();
    directory = variants.flatMap(cached => cached.data);
  }
  if (!Array.isArray(directory) || ids.some(id => !directory.some(person => person.id === id))) reject('نزّل دليل التواصل المسموح به قبل اختيار الأعضاء دون اتصال');
  if (accountId() !== account || readActiveIdentity()?.id !== account) reject('تغيّر الحساب؛ لم تُحفظ محادثة لحساب آخر');
  const members = [...new Set<string>(ids)].map(id => ({ id: crypto.randomUUID(), isAdmin: false, user: directory.find(person => person.id === id) }));
  if (kind === 'direct') {
    const existing = (await get('chatConversations')).find(row => row.type === 'DIRECT' && (row.otherUser?.id === ids[0] || row.members?.some((member: any) => member.user?.id === ids[0])));
    if (existing) return existing;
  }
  return save('chatConversations', { kind, userId: kind === 'direct' ? ids[0] : undefined, memberIds: kind === 'group' ? [...new Set(ids)] : undefined,
    title: kind === 'group' ? data.title.trim() : members[0].user.fullName, description: kind === 'group' ? data.description : undefined,
    type: kind === 'group' ? 'GROUP' : 'DIRECT', otherUser: kind === 'direct' ? members[0].user : null,
    members: [{ id: crypto.randomUUID(), isAdmin: kind === 'group', user: actor }, ...members], memberCount: members.length + 1,
    unreadCount: 0, isOnline: false, isClosed: false, adminOnly: false, isAdmin: kind === 'group', canPost: true, lastMessageAt: null, lastMessage: null }, 'create');
}
