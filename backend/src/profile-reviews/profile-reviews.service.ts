import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser } from '../common/decorators';
import { recordNotificationChange } from '../notifications/notifications.service';
import { Prisma, Role } from '@prisma/client';
import { normalizePhone, PHONE_MESSAGE, PHONE_PATTERN } from '../common/validators/phone';

const studentFields = ['fullName', 'birthDate', 'nationalId', 'fatherNationalId', 'address', 'guardianName', 'guardianPhone', 'guardianRelation'];
const teacherFields = ['fullName', 'birthDate', 'nationalId', 'address', 'phone', 'email', 'qualification', 'specialization'];
function plain(row: any, kind: string) {
  const source = kind === 'TEACHER' ? { ...row, fullName: row.user.fullName, phone: row.user.phone, email: row.user.email } : row;
  return Object.fromEntries((kind === 'STUDENT' ? studentFields : teacherFields).map(key => [key,
    source[key] instanceof Date ? source[key].toISOString().slice(0, 10) : source[key] ?? '']));
}

@Injectable()
export class ProfileReviewsService {
  constructor(private readonly prisma: PrismaService) {}
  private async subject(db: any, user: AuthUser) {
    const kind = user.role === Role.STUDENT ? 'STUDENT' : user.role === Role.TEACHER ? 'TEACHER' : '';
    if (!kind) throw new ForbiddenException('هذه الخدمة للطالب والمحفظ فقط');
    const row = kind === 'STUDENT' ? await db.student.findFirst({ where: { userId: user.id, deletedAt: null } })
      : await db.teacherProfile.findFirst({ where: { userId: user.id, deletedAt: null }, include: { user: { select: { fullName: true, phone: true, email: true } } } });
    if (!row) throw new NotFoundException('ملفك غير موجود');
    return { row, kind, profile: plain(row, kind) };
  }
  async mine(user: AuthUser) {
    const { row, kind, profile } = await this.subject(this.prisma, user);
    return { id: row.id, kind, profile, requests: await this.prisma.profileReview.findMany({ where: { requesterId: user.id }, orderBy: { createdAt: 'desc' } }) };
  }
  async list(user: AuthUser, kind?: string, page = 1) {
    if (kind && !['STUDENT', 'TEACHER'].includes(kind)) throw new BadRequestException('نوع الملف غير صالح');
    const where = { ...(user.role === Role.ADMIN ? {} : { requesterId: user.id }), ...(kind ? { kind } : {}) };
    const [data, total] = await Promise.all([this.prisma.profileReview.findMany({ where, orderBy: [{ createdAt: 'desc' }, { id: 'asc' }], skip: (page - 1) * 200, take: 200 }), this.prisma.profileReview.count({ where })]);
    return { data, meta: { hasNextPage: total > page * 200, total } };
  }
  async submit(user: AuthUser, patch: Record<string, unknown>, id?: string, expectedSubject?: string) {
    if (!patch || Array.isArray(patch) || typeof patch !== 'object' || !Object.keys(patch).length) throw new BadRequestException('أدخل البيانات المطلوب التحقق منها');
    const fields = user.role === Role.STUDENT ? studentFields : teacherFields;
    const cleaned: Record<string, string> = {};
    for (const [key, value] of Object.entries(patch)) {
      const limit = { address: 250, nationalId: 30, fatherNationalId: 30, guardianRelation: 40, birthDate: 10, email: 160 }[key] || 150;
      if (!fields.includes(key) || typeof value !== 'string' || value.length > limit) throw new BadRequestException('حقول غير صالحة في طلب التحقق');
      cleaned[key] = value.trim();
      if (key === 'fullName' && cleaned[key].length < 2) throw new BadRequestException('الاسم الكامل مطلوب');
      if (key === 'birthDate' && cleaned[key] && (!/^\d{4}-\d{2}-\d{2}$/.test(cleaned[key]) || !Number.isFinite(Date.parse(cleaned[key])) || new Date(cleaned[key]).toISOString().slice(0, 10) !== cleaned[key] || cleaned[key] > new Date().toISOString().slice(0, 10))) throw new BadRequestException('تاريخ الميلاد غير صالح');
      if (['phone', 'guardianPhone'].includes(key) && cleaned[key]) {
        cleaned[key] = String(normalizePhone(cleaned[key]));
        if (!PHONE_PATTERN.test(cleaned[key])) throw new BadRequestException(PHONE_MESSAGE);
      }
      if (key === 'email' && cleaned[key] && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleaned[key])) throw new BadRequestException('البريد غير صالح');
    }
    return this.prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT 1 FROM (SELECT pg_advisory_xact_lock(hashtext('profile-review'), hashtext(${user.id}))) AS locked`;
      const { row, kind, profile } = await this.subject(tx, user);
      if (expectedSubject && row.id !== expectedSubject) throw new ForbiddenException('يمكنك تعديل ملفك فقط');
      if (await tx.profileReview.findFirst({ where: { requesterId: user.id, status: 'PENDING' } })) throw new ConflictException('لديك طلب بانتظار مراجعة الإدارة');
      const request = await tx.profileReview.create({ data: { ...(id ? { id } : {}), kind, subjectId: row.id, requesterId: user.id, patch: cleaned, base: profile } });
      await this.journal(tx, request);
      const admins = await tx.user.findMany({ where: { role: 'ADMIN', isActive: true, deletedAt: null }, select: { id: true } });
      for (const recipient of [...admins.map(a => a.id), user.id]) {
        const notice = await tx.notification.create({ data: { userId: recipient, type: 'SYSTEM', title: recipient === user.id ? 'طلب التحقق بانتظار المراجعة' : `طلب تحقق من بيانات ${kind === 'STUDENT' ? 'طالب' : 'محفظ'}`,
          body: String(profile.fullName), link: recipient === user.id ? '/verify-profile' : `/profile-reviews/${kind === 'STUDENT' ? 'students' : 'teachers'}`, data: { requestId: request.id } } });
        await recordNotificationChange(tx, notice);
      }
      return request;
    });
  }
  async decide(user: AuthUser, id: string, status: string, reason?: string) {
    if (user.role !== Role.ADMIN) throw new ForbiddenException('مراجعة البيانات للإدارة فقط');
    if (reason !== undefined && (typeof reason !== 'string' || reason.length > 1000)) throw new BadRequestException('سبب الرفض غير صالح');
    if (!['APPROVED', 'REJECTED'].includes(status) || status === 'REJECTED' && !reason?.trim()) throw new BadRequestException('حدد القرار وسبب الرفض');
    try { return await this.prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT 1 FROM (SELECT pg_advisory_xact_lock(hashtext('profile-decision'), hashtext(${id}))) AS locked`;
      const request = await tx.profileReview.findUnique({ where: { id } });
      if (!request) throw new NotFoundException('الطلب غير موجود');
      if (request.status !== 'PENDING') throw new ConflictException('تم البت في الطلب بالفعل');
      const { row, profile } = await this.subject(tx, { id: request.requesterId, role: request.kind as Role } as AuthUser);
      if (row.id !== request.subjectId) throw new ConflictException('تغير ارتباط الملف');
      if (status === 'APPROVED') {
        const patch = request.patch as Record<string, string>, base = request.base as Record<string, string>;
        // Lock the canonical rows before checking the snapshot and applying the approved patch.
        if (request.kind === 'STUDENT') await tx.$queryRaw`SELECT id FROM students WHERE id = ${row.id} FOR UPDATE`;
        else await tx.$queryRaw`SELECT id FROM teacher_profiles WHERE id = ${row.id} FOR UPDATE`;
        await tx.$queryRaw`SELECT id FROM users WHERE id = ${request.requesterId} FOR UPDATE`;
        const current = (await this.subject(tx, { id: request.requesterId, role: request.kind as Role } as AuthUser)).profile;
        if (Object.keys(patch).some(key => current[key] !== base[key])) throw new ConflictException('تغيرت بيانات الملف بعد تقديم الطلب؛ ارفض الطلب مع طلب إعادة الإرسال');
        const data: any = { ...patch };
        if ('birthDate' in data) data.birthDate = data.birthDate ? new Date(data.birthDate) : null;
        if ('nationalId' in data) data.nationalId = data.nationalId || null;
        if (request.kind === 'STUDENT') {
          await tx.student.update({ where: { id: row.id }, data });
          if (patch.fullName) await tx.user.update({ where: { id: request.requesterId }, data: { fullName: patch.fullName } });
        } else {
          const { fullName, phone, email, ...teacher } = data;
          await tx.teacherProfile.update({ where: { id: row.id }, data: { ...teacher, user: { update: { ...(fullName !== undefined ? { fullName } : {}), ...(phone !== undefined ? { phone: phone || null } : {}), ...(email !== undefined ? { email: email || null } : {}) } } } });
        }
      }
      const updated = await tx.profileReview.update({ where: { id }, data: { status, reason: reason?.trim() || null, reviewedById: user.id, reviewedAt: new Date() } });
      await this.journal(tx, updated);
      const notice = await tx.notification.create({ data: { userId: request.requesterId, type: 'SYSTEM', title: status === 'APPROVED' ? 'تم اعتماد بياناتك وتحديث ملفك' : 'تم رفض طلب التحقق من البيانات',
        body: reason?.trim(), link: '/verify-profile', data: { requestId: id, status } } });
      await recordNotificationChange(tx, notice);
      await tx.activityLog.create({ data: { userId: user.id, action: `PROFILE_REVIEW_${status}`, entityType: 'ProfileReview', entityId: id, summary: `مراجعة بيانات ${profile.fullName}` } });
      return updated;
    }); } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw new ConflictException('رقم الهوية أو البريد مسجل في ملف آخر');
      throw error;
    }
  }
  private async journal(tx: Prisma.TransactionClient, row: { id: string; requesterId: string }) {
    await tx.$queryRaw`SELECT 1 FROM (SELECT pg_advisory_xact_lock(hashtext('quran-sync-journal'), 0)) AS locked`;
    await tx.syncChange.create({ data: { entity: 'profile_reviews', entityId: row.id, operation: 'UPSERT', payload: { id: row.id, requesterId: row.requesterId } } });
  }
}
