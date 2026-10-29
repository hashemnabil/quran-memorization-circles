import { db } from './db';
import { accountId, get, save } from './offline-engine';
import { readActiveIdentity } from './active-identity';
function rejected(message: string): never { throw Object.assign(new Error(message), { localWriteRejected: true }); }
const staff = (role?: string) => ['ADMIN', 'SUPPORT'].includes(role || '');
const own = (row: any, id: string) => row.createdById === id || row.createdBy?.id === id;
function visible(row: any) {
  const user = readActiveIdentity();
  return !!user && (user.role === 'ADMIN' || (row.category !== 'PASSWORD_RESET' && (row.category !== 'ACCOUNT_DELETION' || own(row, user.id)) && (staff(user.role) || own(row, user.id))));
}
export async function readLocalSupport(path: string, params: Record<string, any>) {
  const url = new URL(path, 'https://local.invalid');
  if (!/^\/support(?:\/[^/]+)?$/.test(url.pathname) || ['/support/staff', '/support/stats', '/support/public', '/support/account-deletion'].includes(url.pathname)) return undefined;
  const account = accountId();
  // Keep version-12 support caches readable when the upgrade happens offline.
  // Import once only; an authoritative scoped snapshot must never resurrect
  // tickets that the server has subsequently removed from this account.
  if (!(await db.meta.get(`${account}:supportDownloadedAt`)) && !(await db.meta.get(`${account}:supportCacheImported`))) {
    for (const cached of await db.responses.where('accountId').equals(account).toArray()) {
      let savedPath: string;
      try { savedPath = JSON.parse(cached.key)[1]; } catch { continue; }
      if (typeof savedPath !== 'string' || !/^\/support(?:\/[0-9a-f-]{36})?$/i.test(savedPath)) continue;
      const tickets = Array.isArray(cached.data?.data) ? cached.data.data : cached.data?.id ? [cached.data] : [];
      if (accountId() !== account) throw new Error('تغيّر الحساب أثناء قراءة الطلبات');
      await db.transaction('rw', db.table('supportTickets'), async () => {
        for (const ticket of tickets) {
          if (typeof ticket?.id !== 'string' || await db.table('supportTickets').get([account, ticket.id])) continue;
          await db.table('supportTickets').put({ ...ticket, accountId: account, synced: 1, updatedAt: ticket.updatedAt || new Date().toISOString() });
        }
      });
    }
    await db.meta.put({ key: `${account}:supportCacheImported`, value: true });
  }
  const rows = (await get('supportTickets')).filter(visible);
  const errors = await db.queue.where('accountId').equals(account).filter(op => op.table === 'supportTickets' && !!op.error).toArray();
  if (url.pathname !== '/support') {
    const requested = url.pathname.split('/')[2];
    const id = (await db.meta.get(`${account}:id:${requested}`))?.value || requested;
    const row = rows.find(row => row.id === id);
    if (!row) return undefined;
    return { ...row, syncError: errors.find(op => op.entityId === id)?.error, messages: (row.messages || []).filter((message: any) => !message.isInternal || staff(readActiveIdentity()?.role)) };
  }
  if (!rows.length && !(await db.meta.get(`${account}:supportDownloadedAt`))) return undefined;
  const filters = { ...Object.fromEntries(url.searchParams), ...params };
  const filtered = rows.filter(row => (!filters.status || row.status === filters.status) && (!filters.priority || row.priority === filters.priority)
    && (!filters.category || row.category === filters.category) && (filters.mine !== 'true' || (row.assignedToId || row.assignedTo?.id) === account)
    && (!filters.search || `${row.subject} ${row.description}`.toLocaleLowerCase().includes(String(filters.search).toLocaleLowerCase())))
    .sort((a, b) => filters.sortOrder === 'asc' ? String(a.updatedAt).localeCompare(String(b.updatedAt)) : String(b.updatedAt).localeCompare(String(a.updatedAt)));
  const page = Math.max(1, Number(filters.page) || 1), limit = Math.max(1, Math.min(200, Number(filters.limit) || 20));
  return { data: filtered.slice((page - 1) * limit, page * limit), meta: { total: filtered.length, page, limit, hasNextPage: filtered.length > page * limit, totalPages: Math.ceil(filtered.length / limit), local: true } };
}
export async function writeLocalSupport(method: string, path: string, data: any) {
  const actor = readActiveIdentity();
  if (!actor) return undefined;
  const account = accountId();
  if (actor.id !== account) rejected('تغيّر الحساب؛ أعد فتح الطلب');
  if (path === '/support' && method === 'post') {
    if (typeof data?.subject !== 'string' || !data.subject.trim() || data.subject.length > 200 || typeof data?.description !== 'string' || !data.description.trim() || data.description.length > 4000) rejected('اكتب عنوان الطلب ووصف المشكلة ضمن الحد المسموح');
    if (data.category && (typeof data.category !== 'string' || data.category.length > 80) || ['ACCOUNT_DELETION', 'PASSWORD_RESET'].includes(data.category)) rejected('استخدم صفحة التحقق المخصصة لهذا النوع من الطلبات');
    if (data.priority && !['LOW', 'NORMAL', 'HIGH', 'URGENT'].includes(data.priority)) rejected('الأولوية غير صالحة');
    const createdAt = new Date().toISOString();
    return save('supportTickets', { subject: data.subject.trim(), description: data.description.trim(), category: data.category, priority: data.priority || 'NORMAL', status: 'OPEN', number: null,
      createdById: actor.id, createdBy: actor, createdAt, messages: [{ id: crypto.randomUUID(), body: data.description.trim(), sender: actor, isInternal: false, createdAt, synced: 0 }], _count: { messages: 1 } }, 'create');
  }
  const match = path.match(/^\/support\/([^/]+)\/reply$/);
  const updateMatch = path.match(/^\/support\/([^/]+)$/);
  if (updateMatch && method === 'patch') {
    if (!data || typeof data !== 'object' || Array.isArray(data)) rejected('بيانات تعديل الطلب غير صالحة');
    if (!staff(actor.role)) rejected('تعديل الحالة والإسناد متاح لفريق الدعم فقط');
    const id = (await db.meta.get(`${account}:id:${updateMatch[1]}`))?.value || updateMatch[1];
    const ticket = (await get('supportTickets')).find(row => row.id === id);
    if (!ticket || !visible(ticket) || ticket.synced === 0 || !Number.isFinite(Date.parse(ticket.updatedAt))) rejected('حمّل النسخة المعتمدة من الطلب وانتظر مزامنة تغييره السابق');
    if (Object.keys(data || {}).some(field => !['status','priority','assignedToId','category'].includes(field))) rejected('حقول تعديل الطلب غير صالحة');
    if (data.status !== undefined && !['OPEN','IN_PROGRESS','RESOLVED','CLOSED'].includes(data.status)) rejected('حالة الطلب غير صالحة');
    if (data.priority !== undefined && !['LOW','NORMAL','HIGH','URGENT'].includes(data.priority)) rejected('الأولوية غير صالحة');
    if (data.category !== undefined && (typeof data.category !== 'string' || data.category.length > 80 || ['PASSWORD_RESET','ACCOUNT_DELETION'].includes(data.category) && data.category !== ticket.category)) rejected('نوع الطلب غير صالح للتعديل المحلي');
    if (data.assignedToId && (typeof data.assignedToId !== 'string' || !/^[0-9a-f-]{36}$/i.test(data.assignedToId))) rejected('اختر مسؤولًا صالحًا من فريق الدعم');
    if (accountId() !== account || readActiveIdentity()?.id !== account) rejected('تغيّر الحساب؛ لم يُحفظ التعديل');
    return save('supportTickets', { ...data, id, previousUpdatedAt: ticket.updatedAt, pendingStatus: data.status || null, pendingUpdate: true }, 'update');
  }
  if (match && method === 'post') {
    const id = (await db.meta.get(`${accountId()}:id:${match[1]}`))?.value || match[1];
    const ticket = (await get('supportTickets')).find(row => row.id === id);
    if (accountId() !== account || readActiveIdentity()?.id !== account) rejected('تغيّر الحساب؛ لم يُحفظ الرد لحساب آخر');
    if (!ticket || !visible(ticket)) rejected('حمّل طلب الدعم المسموح لك قبل الرد دون اتصال');
    if (ticket.status === 'CLOSED') rejected('الطلب مغلق؛ أنشئ طلبًا جديدًا');
    if (data?.isInternal && !staff(actor.role)) rejected('الملاحظات الداخلية متاحة لفريق الدعم فقط');
    if (data?.isInternal !== undefined && typeof data.isInternal !== 'boolean') rejected('نوع الرد غير صالح');
    if (typeof data?.body !== 'string' || !data.body.trim() || data.body.length > 4000) rejected('اكتب ردًا صالحًا لا يتجاوز 4000 حرف');
    const message = { id: crypto.randomUUID(), sender: actor, body: data.body.trim(), isInternal: !!data.isInternal, createdAt: new Date().toISOString(), synced: 0 };
    return save('supportTickets', { id, replyBody: message.body, isInternal: message.isInternal, messages: [...(ticket.messages || []), message], _count: { messages: (ticket.messages || []).length + 1 } }, 'reply');
  }
  return undefined;
}
