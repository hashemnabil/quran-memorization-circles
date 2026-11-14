import { db } from './db';
import { accountId, get, save } from './offline-engine';
import { readActiveIdentity } from './active-identity';
import { SURAHS } from './quran-surahs';

const reject = (message: string): never => { throw Object.assign(new Error(message), { localWriteRejected: true }); };
export async function writeLocalPlan(method: string, route: string[], data: any) {
  const actor = readActiveIdentity();
  if (!actor || !['ADMIN', 'SUPERVISOR', 'TEACHER'].includes(actor.role)) return reject('إدارة الخطط للمسؤول عن الطالب فقط');
  const studentId = (await db.meta.get(`${accountId()}:id:${route[1]}`))?.value || route[1];
  if (!(await get('students')).some(student => student.id === studentId)) return reject('نزّل بيانات الطالب أولًا');
  const id = route[3] ? (await db.meta.get(`${accountId()}:id:${route[3]}`))?.value || route[3] : crypto.randomUUID();
  const plan = route[3] ? await db.table('memorizationPlans').get([accountId(), id]) : undefined;
  if (route[3] && !plan || plan && plan.studentId !== studentId) return reject('نزّل الخطة قبل تعديلها دون اتصال');
  if (!data || typeof data !== 'object') return reject('بيانات الخطة غير صالحة');
  if (method === 'post' && route.length === 5 && route[4] === 'progress' && plan) {
    if (typeof data.requestId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(data.requestId)) return reject('معرّف الإنجاز غير صالح');
    if (plan.logs?.some((log: any) => log.id === data.requestId)) return plan;
    const items = data.itemIds ?? [];
    if (!Array.isArray(items)) return reject('عناصر الإنجاز غير صالحة');
    const amount = plan.scope?.items ? items.length : data.amount;
    if (plan.scope?.items && (!items.length || new Set(items).size !== items.length || items.some((item: number) => !Number.isInteger(item) || !plan.scope.items.includes(item) || plan.logs?.some((log: any) => log.itemIds?.includes(item))))) return reject('اختر عناصر غير مسجلة من نطاق الخطة');
    if (typeof amount !== 'number' || !Number.isFinite(amount) || amount <= 0 || amount > 1_000_000 || plan.scope?.surah && !Number.isInteger(amount) || plan.archived || plan.completed + amount > plan.target) return reject('الإنجاز يتجاوز المتبقي أو الخطة مؤرشفة');
    if (data.note !== undefined && (typeof data.note !== 'string' || data.note.length > 500) || data.versesCount !== undefined && (!Number.isInteger(data.versesCount) || data.versesCount < 0 || data.versesCount > 6236)) return reject('بيانات الإنجاز غير صالحة');
    const log = { id: data.requestId, amount, itemIds: items, versesCount: data.versesCount ?? (plan.unit === 'VERSES' ? amount : 0), note: data.note?.trim() || '', createdAt: new Date().toISOString(), recorderName: actor.fullName };
    return save('memorizationPlans', { id, studentId, ...data, completed: plan.completed + amount, logs: [log, ...(plan.logs || [])] }, 'progress');
  }
  if (!(method === 'post' && route.length === 3 || method === 'patch' && route.length === 4)) return undefined;
  if (typeof data.title !== 'string' || !data.title.trim() || data.title.length > 160 || !['VERSES','PAGES','SURAHS','JUZ','TASKS'].includes(data.unit) || !['WEEKLY','MONTHLY','GOAL'].includes(data.period)) return reject('أدخل عنوانًا ووحدة ومدة صالحة');
  if (data.dueAt && !Number.isFinite(new Date(data.dueAt).getTime())) return reject('تاريخ نهاية الخطة غير صالح');
  if (data.archived !== undefined && typeof data.archived !== 'boolean') return reject('حالة الأرشفة غير صالحة');
  let scope = null;
  if (data.scope != null) {
    if (data.unit === 'VERSES') {
      const { surah, from, to } = data.scope;
      if (![surah, from, to].every(Number.isInteger) || !SURAHS[surah - 1] || from < 1 || to < from || to > SURAHS[surah - 1].ayahs) return reject('حدد سورة وآيات صحيحة');
      scope = { surah, from, to };
    } else {
      const items = data.scope.items, max = data.unit === 'JUZ' ? 30 : data.unit === 'SURAHS' ? 114 : 604;
      if (data.unit === 'TASKS' || !Array.isArray(items) || !items.length || new Set(items).size !== items.length || items.some((item: number) => !Number.isInteger(item) || item < 1 || item > max)) return reject('حدد نطاق الخطة دون تكرار');
      scope = { items: [...items].sort((a, b) => a - b) };
    }
  }
  const target = scope ? 'items' in scope ? scope.items!.length : scope.to! - scope.from! + 1 : data.target;
  if (typeof target !== 'number' || !Number.isFinite(target) || target <= 0 || target > 1_000_000 || plan && target < plan.completed) return reject('هدف الخطة غير صالح');
  if (plan?.completed > 0 && (plan.unit !== data.unit || JSON.stringify(scope) !== JSON.stringify(plan.scope ?? null))) return reject('لا يمكن تغيير النطاق أو الوحدة بعد تسجيل الإنجاز');
  return save('memorizationPlans', { ...data, id, studentId, title: data.title.trim(), target, scope, completed: plan?.completed ?? 0, archived: data.archived ?? plan?.archived ?? false, logs: plan?.logs ?? [] }, plan ? 'update' : 'create');
}
