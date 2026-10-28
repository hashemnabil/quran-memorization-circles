import { db } from './db';
import { accountId, get, save } from './offline-engine';
import { readActiveIdentity } from './active-identity';
import { draftPdf } from './draft-pdf';
function reject(message: string): never { throw Object.assign(new Error(message), { localWriteRejected: true }); }
export async function queueCertificateDraft(action: 'issue' | 'publish-monthly-report', data: any, render = draftPdf) {
  const account = accountId(), actor = readActiveIdentity();
  if (!actor || actor.id !== account || actor.role !== 'ADMIN') reject('إصدار الشهادات والتقارير متاح للإدارة فقط');
  const student = (await get('students')).find(row => row.id === data?.studentId);
  if (!student) reject('حمّل بيانات الطالب قبل تجهيز الملف دون اتصال');
  if (typeof data.fileUrl !== 'string' || !data.fileUrl.startsWith('data:application/pdf;base64,')) reject('جهّز ملف PDF محليًا قبل حفظ طلب الإصدار');
  const encoded = data.fileUrl.slice('data:application/pdf;base64,'.length);
  if (encoded.length > 8 * 1024 * 1024 || !/^[A-Za-z0-9+/]+={0,2}$/.test(encoded)) reject('حجم ملف PDF المعلق يتجاوز الحد المسموح (نحو 6 ميجابايت) أو تنسيقه غير صالح');
  try { if (!atob(encoded.slice(0,16)).startsWith('%PDF-')) reject('ملف PDF غير صالح'); } catch { reject('ملف PDF غير صالح'); }
  if (action === 'issue') {
    if (!['JUZ_COMPLETION','QURAN_COMPLETION','TAJWEED_COURSE','SHARIA_COURSE','COURSE_COMPLETION','HONOR'].includes(data.kind) || typeof data.title !== 'string' || !data.title.trim()) reject('اختر نوع الشهادة وعنوانها');
    if (data.templateId && !(await get('certificateTemplates')).some(row => row.id === data.templateId && row.isActive !== false)) reject('حمّل قالب الشهادة النشط قبل الإصدار دون اتصال');
  } else {
    if (!Number.isFinite(Date.parse(data.from)) || !Number.isFinite(Date.parse(data.to)) || data.from > data.to) reject('اختر فترة تقرير صالحة');
    // Monthly totals must come from a downloaded report for this exact period.
    const key = JSON.stringify([account, '/certificates/monthly-report-data', [['from', data.from], ['to', data.to]]]);
    const snapshot = (await db.responses.get(key))?.data;
    const source = Array.isArray(snapshot) && snapshot.find(row => row.id === data.studentId);
    if (!source) reject('حمّل التقرير لهذه الفترة قبل تجهيز مسودته دون اتصال');
    data = { ...data, reportDraft: { studentCode: source.code, circleName: source.circleName, attendance: source.attendance, recitations: source.recitations, evaluation: source.evaluation, evaluationNote: source.evaluationNote } };
  }
  const pending = await db.queue.where('accountId').equals(account).filter(operation => operation.table === 'certificates' || operation.table === 'certificateRequests').toArray();
  if (pending.reduce((size, operation) => size + (operation.data.fileUrl?.length || 0), 0) + data.fileUrl.length > 16 * 1024 * 1024) reject('بلغت ملفات PDF المعلقة حد التخزين؛ زامن الملفات المحفوظة قبل إضافة المزيد');
  const preview = await render(data.fileUrl);
  if (accountId() !== account || readActiveIdentity()?.id !== account) reject('تغيّر الحساب؛ لم يُحفظ ملف لحساب آخر');
  const common = { ...data, _localPreviewUrl: preview, student: { id: student.id, fullName: student.fullName, code: student.code }, issuancePending: true };
  return action === 'issue'
    ? save('certificates', { ...common, issuedAt: null }, 'issue')
    : save('certificateRequests', { ...common, kind: 'MONTHLY_REPORT', status: 'PENDING', periodFrom: data.from, periodTo: data.to, createdAt: new Date().toISOString() }, action);
}
