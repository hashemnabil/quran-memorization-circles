import { readActiveIdentity } from './active-identity';
import { db } from './db';
import { accountId, get, save } from './offline-engine';

type Recipient = { id: string; fullName: string; circleId?: string | null; circle?: { name?: string } | null; guardianPhone?: string | null; userId?: string | null; user?: { username?: string; isActive?: boolean } | null };
type PreviewRow = { studentId: string; userId: string | null; name: string; phone: string; text: string; title: string; error: string };

const rejected = (message: string) => Object.assign(new Error(message), { localWriteRejected: true });
const templates = ['NOTICE', 'WARNING', 'SUMMONS', 'CREDENTIALS'];
const channels = ['APP', 'SMS', 'BOTH'];

async function cached(path: string): Promise<any> {
  const account = accountId();
  const response = await db.responses.get(JSON.stringify([account, path, []]));
  const prefetch = (await db.meta.get(`${account}:prefetch:${path}`))?.value;
  return prefetch?.data ?? response?.data;
}

export async function localSmsRecipients(): Promise<Recipient[]> {
  if (readActiveIdentity()?.role !== 'ADMIN') throw rejected('قائمة مستلمي الرسائل متاحة للإدارة فقط');
  const recipients = await cached('/sms/recipients');
  if (Array.isArray(recipients)) return recipients;
  return (await get('students')).map(row => ({ id: row.id, fullName: row.fullName, circleId: row.circleId, circle: row.circle }));
}

export async function localSmsTemplates(): Promise<Record<string, string> | undefined> {
  if (readActiveIdentity()?.role !== 'ADMIN') throw rejected('قوالب الرسائل متاحة للإدارة فقط');
  return cached('/sms/templates');
}

function normalizedPhone(value: unknown): string {
  let phone = String(value ?? '').replace(/[٠-٩]/g, c => String(c.charCodeAt(0) - 1632)).replace(/[۰-۹]/g, c => String(c.charCodeAt(0) - 1776)).replace(/[\s()+.-]/g, '');
  if (phone.startsWith('00')) phone = phone.slice(2);
  if (/^05[69]\d{7}$/.test(phone)) phone = '970' + phone.slice(1);
  if (/^5[69]\d{7}$/.test(phone)) phone = '970' + phone;
  if (!/^[1-9]\d{7,14}$/.test(phone) || /^970/.test(phone) && !/^9705[69]\d{7}$/.test(phone)) throw rejected('رقم ولي الأمر غير صالح أو مفقود');
  return phone;
}

export async function localSmsPreview(body: any): Promise<PreviewRow[]> {
  if (readActiveIdentity()?.role !== 'ADMIN') throw rejected('إرسال الرسائل متاح للإدارة فقط');
  if (!templates.includes(body?.kind) || !channels.includes(body?.channel)) throw rejected('حدد نوع الرسالة وقناة الإرسال');
  if (body.all != null && typeof body.all !== 'boolean') throw rejected('اختيار الجميع غير صالح');
  if (body.studentIds != null && (!Array.isArray(body.studentIds) || body.studentIds.length > 5000 || body.studentIds.some((id: unknown) => typeof id !== 'string'))) throw rejected('قائمة الطلاب غير صالحة');
  if (body.kind === 'CREDENTIALS' && body.channel !== 'SMS') throw rejected('بيانات الدخول المؤقتة عبر SMS فقط');
  if (body.kind === 'SUMMONS' && (!/^\d{4}-\d{2}-\d{2}$/.test(body.date || '') || !/^([01]\d|2[0-3]):[0-5]\d$/.test(body.time || '') || !Number.isFinite(new Date(body.date).getTime()) || new Date(body.date).toISOString().slice(0, 10) !== body.date)) throw rejected('التاريخ والوقت مطلوبان للاستدعاء');
  if (!body.all && !body.circleId && (!Array.isArray(body.studentIds) || !body.studentIds.length)) throw rejected('اختر الطلاب');
  const recipients = await cached('/sms/recipients') as Recipient[] | undefined;
  const savedTemplates = await localSmsTemplates();
  if (!Array.isArray(recipients) || !savedTemplates?.[body.kind]) throw rejected('نزّل قائمة المستلمين والقوالب مرة واحدة أثناء الاتصال قبل إعداد الرسائل دون نت');
  const chosen = recipients.filter(student => body.all || body.circleId ? body.all || student.circleId === body.circleId : body.studentIds.includes(student.id));
  if (!chosen.length || chosen.length > 5000) throw rejected('حدد من 1 إلى 5000 طالب');
  const settings = (await cached('/settings')) ?? (await cached('/settings/public'));
  const school = settings?.name || 'المدرسة';
  return chosen.map(student => {
    const reason = body.reasons?.[student.id] || body.reason;
    if (typeof reason !== 'string' || !reason.trim() || reason.length > 1000) throw rejected(`المحتوى أو السبب مطلوب للطالب ${student.fullName}`);
    if (body.kind === 'CREDENTIALS' && (!student.userId || !student.user?.isActive)) throw rejected('يلزم حساب طالب نشط لإرسال بيانات الدخول');
    const values: Record<string, unknown> = { 'اسم المستخدم': student.user?.username, 'كلمة السر': '[ستولّد كلمة مرور مؤقتة عند التأكيد]', 'اسم الطالب': student.fullName, 'اسم المدرسة': school, 'محتوى الإشعار': reason, 'سبب الإنذار': reason, 'سبب الاستدعاء': reason, 'التاريخ': body.date, 'الوقت': body.time };
    const text = savedTemplates[body.kind].replace(/\{([^{}]+)\}/g, (_: string, key: string) => { const value = values[key.trim()]; if (value == null || !String(value).trim()) throw rejected(`حقل ناقص: ${key}`); return String(value); });
    let phone = '', error = '';
    if (body.channel !== 'SMS' && !student.userId) error = 'لا يوجد حساب للطالب؛ اختر SMS فقط أو أنشئ حسابًا';
    if (body.channel !== 'APP') { try { phone = normalizedPhone(student.guardianPhone); } catch { error = 'رقم ولي الأمر غير صالح أو مفقود'; } }
    if (text.length > 1000) error = 'الرسالة تتجاوز 1000 حرف';
    return { studentId: student.id, userId: student.userId ?? null, name: student.fullName, phone, text, title: body.kind === 'WARNING' ? 'إنذار' : body.kind === 'SUMMONS' ? 'استدعاء' : 'إشعار من المدرسة', error };
  });
}

export async function queueSmsCommunication(body: any) {
  if (readActiveIdentity()?.role !== 'ADMIN' || body?.confirm !== true || !/^[\w-]{16,100}$/.test(body.requestKey || '')) throw rejected('تأكيد الإدارة ومعرّف العملية مطلوبان');
  const preview = await localSmsPreview(body);
  if (JSON.stringify(body.preview) !== JSON.stringify(preview)) throw rejected('تغيرت بيانات المعاينة؛ أعد المعاينة قبل التأكيد');
  if (preview.some(row => row.error)) throw rejected('راجع أخطاء المعاينة');
  return save('smsCampaigns', { ...body, createdAt: new Date().toISOString(), _count: { messages: body.channel === 'APP' ? 0 : preview.length } }, 'communicate');
}

export async function localSmsCampaigns(): Promise<any[]> {
  if (readActiveIdentity()?.role !== 'ADMIN') throw rejected('سجل الرسائل متاح للإدارة فقط');
  const remote = await cached('/sms/campaigns');
  return [...(await get('smsCampaigns')), ...(Array.isArray(remote) ? remote : [])].sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
}

export async function localSmsCampaignStatus(id: string): Promise<any[] | undefined> {
  if (readActiveIdentity()?.role !== 'ADMIN') throw rejected('سجل الرسائل متاح للإدارة فقط');
  const campaign = (await get('smsCampaigns')).find(row => row.id === id);
  if (campaign) {
    const queue = await db.queue.where('accountId').equals(accountId()).filter(op => op.table === 'smsCampaigns' && op.entityId === id).first();
    return (campaign.preview || []).filter((row: PreviewRow) => row.phone).map((row: PreviewRow) => ({ id: `${id}:${row.studentId}`, phone: row.phone, title: row.title, status: queue?.error ? 'FAILED' : 'QUEUED', attempts: 0, errorCode: queue?.error || 'بانتظار المزامنة' }));
  }
  return cached(`/sms/campaigns/${id}`);
}

export async function pendingSmsSummons(): Promise<any[]> {
  if (readActiveIdentity()?.role !== 'ADMIN') return [];
  return (await get('smsCampaigns')).filter(row => ['SUMMONS', 'WARNING'].includes(row.kind))
    .flatMap(row => (row.preview || []).map((preview: PreviewRow) => ({ id: `${row.id}:${preview.studentId}`, studentId: preview.studentId, student: { id: preview.studentId, fullName: preview.name }, title: preview.title, body: preview.text, channel: row.channel, createdAt: row.createdAt, synced: 0 })));
}
