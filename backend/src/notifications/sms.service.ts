import { BadRequestException, ConflictException, ForbiddenException, Injectable, OnModuleInit, OnModuleDestroy, ServiceUnavailableException } from '@nestjs/common';
import { createCipheriv, createDecipheriv, createHash, randomBytes, randomUUID } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser } from '../common/decorators';
import { normalizePhone, renderSms, smsTemplates } from './sms-policy';
import * as XLSX from 'xlsx';
import * as bcrypt from 'bcryptjs';

@Injectable()
export class SmsService implements OnModuleInit, OnModuleDestroy {
  private timer?: NodeJS.Timeout;
  private running = false;
  constructor(private readonly prisma: PrismaService) {}
  admin(user: AuthUser) { if (user.role !== 'ADMIN') throw new ForbiddenException('الإدارة فقط'); }
  onModuleInit() { this.timer = setInterval(() => { void this.work().catch(() => undefined); }, 2000); this.timer.unref(); }
  onModuleDestroy() { clearInterval(this.timer); }
  private key() {
    const key = Buffer.from(process.env.SMS_ENCRYPTION_KEY || '', 'base64');
    if (key.length !== 32) throw new ServiceUnavailableException('يلزم إعداد SMS_ENCRYPTION_KEY (32 bytes base64)');
    return key;
  }
  private encrypt(text: string) {
    const iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm', this.key(), iv);
    return Buffer.concat([iv, cipher.update(text, 'utf8'), cipher.final(), cipher.getAuthTag()]).toString('base64');
  }
  private decrypt(value: string) {
    const buffer = Buffer.from(value, 'base64'), cipher = createDecipheriv('aes-256-gcm', this.key(), buffer.subarray(0, 12));
    cipher.setAuthTag(buffer.subarray(-16)); return Buffer.concat([cipher.update(buffer.subarray(12, -16)), cipher.final()]).toString('utf8');
  }
  async templates() {
    const saved = await this.prisma.smsTemplate.findMany();
    return { ...smsTemplates, ...Object.fromEntries(saved.map(row => [row.kind, row.text])) };
  }
  async saveTemplate(kind: string, text: string) {
    if (!smsTemplates[kind] || typeof text !== 'string' || !text.trim() || text.length > 1000 || kind !== 'CREDENTIALS' && /كلمة (?:السر|المرور)|password/i.test(text)) throw new BadRequestException('قالب غير صالح');
    if (kind === 'CREDENTIALS' && (!text.includes('{اسم المستخدم}') || !text.includes('{كلمة السر}'))) throw new BadRequestException('قالب بيانات الدخول يجب أن يحتوي اسم المستخدم وكلمة السر المؤقتة');
    return this.prisma.smsTemplate.upsert({ where: { kind }, create: { kind, text }, update: { text } });
  }
  import(file?: Express.Multer.File) {
    if (!file || !/\.(xlsx|xls|csv)$/i.test(file.originalname)) throw new BadRequestException('ارفع XLSX أو XLS أو CSV');
    try {
      const book = XLSX.read(file.buffer, { type: 'buffer', sheetRows: 5002 });
      const grid = XLSX.utils.sheet_to_json<string[]>(book.Sheets[book.SheetNames[0]], { header: 1, defval: '', raw: false });
      const columns = (grid.shift() || []).map(v => String(v).trim());
      if (!columns.length || columns.length > 100 || columns.some(c => !c) || new Set(columns).size !== columns.length || grid.length > 5000) throw new Error();
      if (columns.some(c => /كلمة (?:السر|المرور)|password/i.test(c))) throw new BadRequestException('لا تستورد كلمات المرور؛ استخدم إجراء إصدار كلمة مرور مؤقتة للحساب');
      return { columns, rows: grid.filter(row => row.some(v => String(v).trim())).map(row => Object.fromEntries(columns.map((c, i) => [c, String(row[i] ?? '')]))) };
    } catch (error) { if (error instanceof BadRequestException) throw error; throw new BadRequestException('ملف غير صالح؛ حد الاستيراد 5000 صف و100 عمود'); }
  }
  async recipients() {
    return this.prisma.student.findMany({ where: { deletedAt: null }, select: { id: true, fullName: true, circleId: true, circle: { select: { name: true } }, guardianPhone: true }, orderBy: { fullName: 'asc' } });
  }
  async preview(body: any) {
    if (!smsTemplates[body?.kind] || !['APP', 'SMS', 'BOTH'].includes(body.channel)) throw new BadRequestException('حدد نوع الرسالة وقناة الإرسال');
    if (body.all != null && typeof body.all !== 'boolean') throw new BadRequestException('اختيار الجميع غير صالح');
    if (body.studentIds != null && (!Array.isArray(body.studentIds) || body.studentIds.length > 5000 || body.studentIds.some((id: unknown) => typeof id !== 'string'))) throw new BadRequestException('قائمة الطلاب غير صالحة');
    if (body.kind === 'CREDENTIALS' && body.channel !== 'SMS') throw new BadRequestException('بيانات الدخول المؤقتة عبر SMS فقط');
    if (body.kind === 'SUMMONS' && (!/^\d{4}-\d{2}-\d{2}$/.test(body.date || '') || !/^([01]\d|2[0-3]):[0-5]\d$/.test(body.time || '') || !Number.isFinite(new Date(body.date).getTime()) || new Date(body.date).toISOString().slice(0, 10) !== body.date)) throw new BadRequestException('التاريخ والوقت مطلوبان للاستدعاء');
    if (!body.all && !body.circleId && (!Array.isArray(body.studentIds) || !body.studentIds.length)) throw new BadRequestException('اختر الطلاب');
    const students = await this.prisma.student.findMany({ where: { deletedAt: null, ...(body.all ? {} : body.circleId ? { circleId: body.circleId } : { id: { in: body.studentIds } }) }, select: { id: true, fullName: true, guardianPhone: true, userId: true, user: { select: { username: true, isActive: true } } } });
    if (!students.length || students.length > 5000) throw new BadRequestException('حدد من 1 إلى 5000 طالب');
    const templates = await this.templates(), school = await this.prisma.schoolSettings.findUnique({ where: { id: 'default' } });
    return students.map(student => {
      const reason = body.reasons?.[student.id] || body.reason;
      if (typeof reason !== 'string' || !reason.trim() || reason.length > 1000) throw new BadRequestException(`المحتوى أو السبب مطلوب للطالب ${student.fullName}`);
      if (body.kind === 'CREDENTIALS' && (!student.userId || !student.user?.isActive)) throw new BadRequestException('يلزم حساب طالب نشط لإرسال بيانات الدخول');
      const text = renderSms(templates[body.kind], { 'اسم المستخدم': student.user?.username, 'كلمة السر': '[ستولّد كلمة مرور مؤقتة عند التأكيد]', 'اسم الطالب': student.fullName, 'اسم المدرسة': school?.name || 'المدرسة', 'محتوى الإشعار': reason, 'سبب الإنذار': reason, 'سبب الاستدعاء': reason, 'التاريخ': body.date, 'الوقت': body.time });
      let phone = '', error = '';
      if (body.channel !== 'SMS' && !student.userId) error = 'لا يوجد حساب للطالب؛ اختر SMS فقط أو أنشئ حسابًا';
      if (body.channel !== 'APP') { try { phone = normalizePhone(student.guardianPhone); } catch { error = 'رقم ولي الأمر غير صالح أو مفقود'; } }
      if (text.length > 1000) error = 'الرسالة تتجاوز 1000 حرف';
      return { studentId: student.id, userId: student.userId, name: student.fullName, phone, text, title: body.kind === 'WARNING' ? 'إنذار' : body.kind === 'SUMMONS' ? 'استدعاء' : 'إشعار من المدرسة', error };
    });
  }
  async enqueue(user: AuthUser, body: any) {
    this.admin(user);
    if (body?.confirm !== true || typeof body.requestKey !== 'string' || !/^[\w-]{16,100}$/.test(body.requestKey)) throw new BadRequestException('التأكيد ومعرف العملية مطلوبان');
    if (!Array.isArray(body.messages) || !body.messages.length || body.messages.length > 5000) throw new BadRequestException('حدد من 1 إلى 5000 رسالة');
    const seen = new Set<string>();
    const messages = body.messages.map((row: any) => {
      const phone = normalizePhone(row?.phone), text = row?.text, title = row?.title || 'رسالة من المدرسة';
      if (typeof text !== 'string' || !text.trim() || text.length > 1000 || typeof title !== 'string' || title.length > 160 || /\{[^{}]+\}/.test(text)) throw new BadRequestException('نص أو عنوان غير صالح أو متغيرات ناقصة');
      if (/كلمة (?:السر|المرور)|password/i.test(text)) throw new BadRequestException('إرسال كلمات المرور عبر الاستيراد غير مسموح');
      const identity = phone + '\n' + text;
      if (seen.has(identity)) throw new BadRequestException('رسالة مكررة لنفس الرقم'); seen.add(identity);
      return { phone, title, text };
    });
    const requestHash = createHash('sha256').update(JSON.stringify(messages)).digest('hex');
    const requestKey = user.id + ':' + body.requestKey;
    const existing = await this.prisma.smsCampaign.findUnique({ where: { requestKey } });
    if (existing) { if (existing.requestHash !== requestHash) throw new ConflictException('معرف العملية مستخدم لمحتوى مختلف'); return { id: existing.id }; }
    if (!process.env.OFFLINESMS_API_KEY || process.env.OFFLINESMS_ENABLED !== 'true') throw new ServiceUnavailableException('الإرسال غير مفعّل على الخادم');
    this.key();
    try {
      return await this.prisma.$transaction(async tx => {
        const campaign = await tx.smsCampaign.create({ data: { requestKey, requestHash, createdById: user.id }, select: { id: true } });
        await tx.smsMessage.createMany({ data: messages.map((m: any) => ({ campaignId: campaign.id, phone: m.phone, title: m.title, encryptedText: this.encrypt(m.text) })) });
        return campaign;
      });
    } catch (error: any) {
      if (error?.code === 'P2002') { const row = await this.prisma.smsCampaign.findUniqueOrThrow({ where: { requestKey } }); if (row.requestHash !== requestHash) throw new ConflictException(); return { id: row.id }; }
      throw error;
    }
  }
  async communicate(user: AuthUser, body: any) {
    this.admin(user);
    if (body?.confirm !== true || !/^[\w-]{16,100}$/.test(body.requestKey || '')) throw new BadRequestException('التأكيد ومعرف العملية مطلوبان');
    const requestKey = user.id + ':' + body.requestKey;
    const requestHash = createHash('sha256').update(JSON.stringify(body)).digest('hex');
    const previous = await this.prisma.smsCampaign.findUnique({ where: { requestKey } });
    if (previous) { if (previous.requestHash !== requestHash) throw new ConflictException(); return { id: previous.id }; }
    const rows = await this.preview(body);
    if (JSON.stringify(body.preview) !== JSON.stringify(rows)) throw new ConflictException('تغيرت بيانات المعاينة؛ أعد المعاينة قبل التأكيد');
    if (rows.some(row => row.error)) throw new BadRequestException('راجع أخطاء المعاينة');
    const sms = body.channel !== 'APP';
    if (sms && (!process.env.OFFLINESMS_API_KEY || process.env.OFFLINESMS_ENABLED !== 'true')) throw new ServiceUnavailableException('الإرسال غير مفعّل');
    if (sms) this.key();
    const credentials = body.kind === 'CREDENTIALS' ? rows.map(row => ({ userId: row.userId!, text: row.text })) : [];
    try {
      return await this.prisma.$transaction(async tx => {
        const campaign = await tx.smsCampaign.create({ data: { requestKey, requestHash, createdById: user.id }, select: { id: true } });
        if (sms) await tx.smsMessage.createMany({ data: rows.map((row, i) => ({ campaignId: campaign.id, phone: row.phone, title: row.title, credential: !!credentials[i], encryptedText: this.encrypt(credentials[i] ? 'CREDENTIALS_PENDING:' + JSON.stringify(credentials[i]) : row.text) })) });
        if (body.channel !== 'SMS') {
          if (body.kind !== 'NOTICE') await tx.guardianSummons.createMany({ data: rows.map(row => ({ studentId: row.studentId, issuedById: user.id, title: row.title, body: row.text })) });
          const notices = rows.filter(row => row.userId).map(row => ({ id: randomUUID(), userId: row.userId!, type: 'ATTENDANCE' as const, title: row.title, body: row.text }));
          if (notices.length) {
            await tx.notification.createMany({ data: notices });
            await tx.$queryRaw`SELECT 1 FROM (SELECT pg_advisory_xact_lock(hashtext('quran-sync-journal'), 0)) AS locked`;
            await tx.syncChange.createMany({ data: notices.map(row => ({ entity: 'notifications', entityId: row.id, operation: 'UPSERT', payload: { id: row.id, userId: row.userId } })) });
          }
        }
        return campaign;
      }, { timeout: 60000 });
    } catch (error: any) {
      if (error?.code === 'P2002') { const previous = await this.prisma.smsCampaign.findUniqueOrThrow({ where: { requestKey } }); if (previous.requestHash !== requestHash) throw new ConflictException(); return { id: previous.id }; }
      throw error;
    }
  }
  async history() {
    return this.prisma.smsCampaign.findMany({ orderBy: { createdAt: 'desc' }, take: 50, select: { id: true, createdAt: true, _count: { select: { messages: true } } } });
  }
  async status(id: string) {
    return this.prisma.smsMessage.findMany({ where: { campaignId: id }, select: { id: true, phone: true, title: true, status: true, attempts: true, errorCode: true }, orderBy: { id: 'asc' } });
  }
  async retry(id: string) {
    return this.prisma.smsMessage.updateMany({ where: { campaignId: id, status: 'FAILED', attempts: { lt: 3 } }, data: { status: 'QUEUED', errorCode: null } });
  }
  async work() {
    if (this.running || process.env.OFFLINESMS_ENABLED !== 'true' || !process.env.OFFLINESMS_API_KEY) return;
    this.running = true;
    try {
      // A crashed/ambiguous dispatch is never automatically replayed.
      await this.prisma.smsMessage.updateMany({ where: { status: 'PROCESSING', claimedAt: { lt: new Date(Date.now() - 120000) } }, data: { status: 'UNKNOWN', errorCode: 'RECONCILE_WITH_PROVIDER' } });
      const rows = await this.prisma.smsMessage.findMany({ where: { status: 'QUEUED' }, take: 20, orderBy: { updatedAt: 'asc' } });
      await Promise.all(rows.map(async row => {
        const claim = await this.prisma.smsMessage.updateMany({ where: { id: row.id, status: 'QUEUED' }, data: { status: 'PROCESSING', claimedAt: new Date(), attempts: { increment: 1 } } });
        if (!claim.count) return;
        let status = 'UNKNOWN', errorCode: string | null = 'RECONCILE_WITH_PROVIDER';
        try {
          let text = this.decrypt(row.encryptedText);
          if (row.credential && text.startsWith('CREDENTIALS_PENDING:')) {
            const pending = JSON.parse(text.slice('CREDENTIALS_PENDING:'.length));
            const password = randomBytes(12).toString('base64url');
            const passwordHash = await bcrypt.hash(password, 12);
            const credential = { userId: pending.userId, passwordHash, text: pending.text.replace('[ستولّد كلمة مرور مؤقتة عند التأكيد]', password) };
            text = 'CREDENTIALS:' + JSON.stringify(credential);
            await this.prisma.$transaction(async tx => {
              await tx.user.update({ where: { id: credential.userId, isActive: true, deletedAt: null }, data: { passwordHash, mustChangePassword: true } });
              await tx.refreshToken.updateMany({ where: { userId: credential.userId, revokedAt: null }, data: { revokedAt: new Date() } });
              await tx.smsMessage.update({ where: { id: row.id }, data: { encryptedText: this.encrypt(text) } });
            });
          }
          if (row.credential && text.startsWith('CREDENTIALS:')) {
            const credential = JSON.parse(text.slice('CREDENTIALS:'.length));
            const account = await this.prisma.user.findUnique({ where: { id: credential.userId }, select: { passwordHash: true, mustChangePassword: true, isActive: true } });
            if (!account?.isActive || !account.mustChangePassword || account.passwordHash !== credential.passwordHash) {
              await this.prisma.smsMessage.update({ where: { id: row.id }, data: { status: 'CANCELLED', errorCode: 'SUPERSEDED_CREDENTIALS', encryptedText: '' } });
              return;
            }
            text = credential.text;
          }
          const response = await fetch('https://business.offlinesms.com/api/v1/org/messages/send', { method: 'POST', headers: { Authorization: `Bearer ${process.env.OFFLINESMS_API_KEY}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ messages: [{ phone: row.phone, title: row.title, text }] }), signal: AbortSignal.timeout(25000), redirect: 'error' });
          // Only explicit documented rejection is retryable; HTTP 2xx is acceptance, never delivery.
          if (response.ok) {
            const result = await response.json() as any;
            if (result?.success === true || result?.status === 'success') { status = 'ACCEPTED'; errorCode = null; }
          }
          else if ([400, 401, 403, 422, 429].includes(response.status)) { status = 'FAILED'; errorCode = `HTTP_${response.status}`; }
          if (!response.bodyUsed) await response.body?.cancel();
        } catch { /* Do not log message contents, phone numbers, or provider bodies. */ }
        await this.prisma.smsMessage.update({ where: { id: row.id }, data: { status, errorCode } });
      }));
    } finally { this.running = false; }
  }
}
