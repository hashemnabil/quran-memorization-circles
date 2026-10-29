import { assertSafeFileUrl } from '../common/validators/safe-url';
import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { CertificateKind, NotificationType, Prisma, Role, StudentFileRequestKind, StudentFileRequestStatus } from '@prisma/client';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { recordNotificationChange } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser } from '../common/decorators';

const STUDENT_REQUESTABLE_CERTIFICATES: CertificateKind[] = [
  CertificateKind.JUZ_COMPLETION,
  CertificateKind.TAJWEED_COURSE,
  CertificateKind.SHARIA_COURSE,
  CertificateKind.COURSE_COMPLETION,
];

@Injectable()
export class CertificatesService {
  private readonly logger = new Logger(CertificatesService.name);
  constructor(private readonly prisma: PrismaService, private readonly realtime: RealtimeGateway) {}

  private async withStudentNotice<T>(studentId: string, title: string, write: (tx: Prisma.TransactionClient) => Promise<T>, body?: string) {
    const saved = await this.prisma.$transaction(async tx => {
      const result = await write(tx);
      const student = await tx.student.findUnique({ where: { id: studentId }, select: { userId: true, parentProfile: { select: { userId: true } } } });
      const notices = [];
      for (const userId of new Set([student?.userId, student?.parentProfile?.userId].filter((id): id is string => !!id))) {
        const notice = await tx.notification.create({ data: { userId, type: 'SYSTEM', title, body,
          link: userId === student?.userId ? '/my-files' : `/parent/children/${studentId}`, data: { studentId } } });
        await recordNotificationChange(tx, notice); notices.push(notice);
      }
      return { result, notices };
    });
    for (const notification of saved.notices) {
      try { const unreadCount = await this.prisma.notification.count({ where: { userId: notification.userId, isRead: false } });
        this.realtime.emitToUser(notification.userId, 'notification:new', { notification, unreadCount });
      } catch { this.logger.warn('Student notification saved; live delivery unavailable'); }
    }
    return saved.result;
  }

  private async studentFor(user: AuthUser) {
    if (user.role !== Role.STUDENT) throw new ForbiddenException('هذه الخدمة متاحة لحساب الطالب فقط');
    const student = await this.prisma.student.findFirst({ where: { userId: user.id, deletedAt: null }, select: { id: true } });
    if (!student) throw new NotFoundException('ملف الطالب غير موجود');
    return student;
  }

  async listTemplates() {
    return this.prisma.certificateTemplate.findMany({ where: { isActive: true }, orderBy: [{ kind: 'asc' }, { name: 'asc' }] });
  }

  async createTemplate(user: AuthUser, body: { name?: string; kind?: CertificateKind; sourceType?: string; fileUrl?: string; design?: unknown }) {
    if (!body.name?.trim() || !Object.values(CertificateKind).includes(body.kind as CertificateKind)) {
      throw new BadRequestException('اسم القالب ونوع الشهادة مطلوبان');
    }
    if (body.fileUrl) assertSafeFileUrl(body.fileUrl);
    const sourceType = body.sourceType === 'BUILDER' ? 'BUILDER' : 'UPLOAD';
    return this.prisma.certificateTemplate.create({
      data: {
        name: body.name.trim(),
        kind: body.kind!,
        sourceType,
        fileUrl: body.fileUrl || null,
        design: (body.design ?? {}) as any,
        createdById: user.id,
      },
    });
  }

  async deactivateTemplate(id: string) {
    const template = await this.prisma.certificateTemplate.findUnique({ where: { id } });
    if (!template) throw new NotFoundException('القالب غير موجود');
    return this.prisma.certificateTemplate.update({ where: { id }, data: { isActive: false } });
  }

  async createRequest(user: AuthUser, body: { kind?: StudentFileRequestKind; certificateKind?: CertificateKind; courseName?: string; periodFrom?: string; periodTo?: string; requestNote?: string }) {
    const student = await this.studentFor(user);
    if (!Object.values(StudentFileRequestKind).includes(body.kind as StudentFileRequestKind)) {
      throw new BadRequestException('نوع الطلب غير صحيح');
    }
    if (body.kind === StudentFileRequestKind.CERTIFICATE) {
      if (!body.certificateKind || !STUDENT_REQUESTABLE_CERTIFICATES.includes(body.certificateKind)) {
        throw new BadRequestException('يمكن للطالب طلب شهادات الإنجاز والنجاح فقط');
      }
    }
    const from = body.periodFrom ? new Date(body.periodFrom) : undefined;
    const to = body.periodTo ? new Date(body.periodTo) : undefined;
    if ((from && Number.isNaN(from.getTime())) || (to && Number.isNaN(to.getTime())) || (from && to && from > to)) {
      throw new BadRequestException('الفترة الزمنية غير صحيحة');
    }
    const saved = await this.prisma.$transaction(async tx => {
    const request = await tx.studentFileRequest.create({
      data: {
        studentId: student.id,
        kind: body.kind!,
        certificateKind: body.kind === StudentFileRequestKind.CERTIFICATE ? body.certificateKind : null,
        courseName: body.courseName?.trim() || null,
        periodFrom: from,
        periodTo: to,
        requestNote: body.requestNote?.trim() || null,
      },
    });
    const admins = await tx.user.findMany({ where: { role: Role.ADMIN, isActive: true, deletedAt: null }, select: { id: true } });
    const notifications = [];
    for (const admin of admins) notifications.push(await tx.notification.create({ data: {
      userId: admin.id, type: NotificationType.SYSTEM,
      title: body.kind === StudentFileRequestKind.CERTIFICATE ? 'طلب شهادة جديد' : 'طلب ملف طالب جديد',
      body: `قدّم الطالب ${user.fullName} طلبًا جديدًا`, link: '/certificates-admin',
      data: { requestId: request.id, studentId: student.id },
    } }));
    notifications.push(await tx.notification.create({ data: { userId: user.id, type: NotificationType.SYSTEM,
      title: 'تم تقديم طلبك', body: 'طلبك بانتظار مراجعة الإدارة', link: '/my-files',
      data: { requestId: request.id, studentId: student.id } } }));
    for (const notification of notifications) await recordNotificationChange(tx, notification);
    return { request, notifications };
    });
    for (const notification of saved.notifications) {
      try {
      const unreadCount = await this.prisma.notification.count({ where: { userId: notification.userId, isRead: false } });
      this.realtime.emitToUser(notification.userId, 'notification:new', { notification, unreadCount });
      } catch { this.logger.warn('Certificate request notification was saved; live delivery is unavailable.'); }
    }
    return saved.request;
  }

  async myRequests(user: AuthUser) {
    const student = await this.studentFor(user);
    return this.prisma.studentFileRequest.findMany({
      where: { studentId: student.id },
      orderBy: { createdAt: 'desc' },
      select: { id: true, kind: true, certificateKind: true, courseName: true, periodFrom: true, periodTo: true, status: true, requestNote: true, decisionNote: true, fileUrl: true, createdAt: true, updatedAt: true },
    });
  }

  async myCertificates(user: AuthUser) {
    const student = await this.studentFor(user);
    return this.prisma.certificateRecord.findMany({
      where: { studentId: student.id },
      orderBy: { issuedAt: 'desc' },
      select: { id: true, kind: true, title: true, details: true, fileUrl: true, issuedAt: true },
    });
  }

  async listIssuedRecords() {
    return this.prisma.certificateRecord.findMany({
      include: {
        student: { select: { id: true, fullName: true, code: true, circle: { select: { name: true } } } },
        issuedBy: { select: { fullName: true } },
        template: { select: { name: true } },
      },
      orderBy: { issuedAt: 'desc' },
      take: 500,
    });
  }

  async monthlyReportData(fromValue: string, toValue: string) {
    const from = new Date(fromValue);
    const to = new Date(toValue);
    if (!fromValue || !toValue || Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || from > to) {
      throw new BadRequestException('فترة التقرير غير صحيحة');
    }
    from.setUTCHours(0, 0, 0, 0);
    to.setUTCHours(23, 59, 59, 999);
    const students = await this.prisma.student.findMany({
      where: { deletedAt: null, status: 'ACTIVE' },
      orderBy: { fullName: 'asc' },
      select: {
        id: true, code: true, fullName: true, evaluation: true, evaluationNote: true,
        memorizedParts: true, currentSurah: true,
        circle: { select: { name: true } },
        attendance: { where: { date: { gte: from, lte: to } }, select: { status: true } },
        recitations: {
          where: { date: { gte: from, lte: to }, deletedAt: null },
          orderBy: { date: 'asc' },
          select: { date: true, type: true, fromSurah: true, fromAyah: true, toSurah: true, toAyah: true, pagesCount: true, mistakes: true, warnings: true, points: true, evaluation: true, notes: true },
        },
      },
    });
    return students.map((student) => ({
      id: student.id, code: student.code, fullName: student.fullName,
      circleName: student.circle?.name ?? 'بدون حلقة',
      evaluation: student.evaluation, evaluationNote: student.evaluationNote,
      memorizedParts: student.memorizedParts, currentSurah: student.currentSurah,
      attendance: {
        recorded: student.attendance.length,
        present: student.attendance.filter((x) => x.status === 'PRESENT').length,
        absent: student.attendance.filter((x) => x.status === 'ABSENT').length,
        excused: student.attendance.filter((x) => x.status === 'EXCUSED').length,
      },
      recitations: {
        sessions: student.recitations.length,
        pages: student.recitations.reduce((sum, x) => sum + (x.pagesCount ?? 0), 0),
        points: student.recitations.reduce((sum, x) => sum + x.points, 0),
        mistakes: student.recitations.reduce((sum, x) => sum + x.mistakes, 0),
        warnings: student.recitations.reduce((sum, x) => sum + x.warnings, 0),
        entries: student.recitations,
      },
    }));
  }

  async listRequests() {
    return this.prisma.studentFileRequest.findMany({
      include: { student: { select: { id: true, fullName: true, code: true } }, reviewedBy: { select: { fullName: true } } },
      orderBy: [{ status: 'asc' }, { createdAt: 'asc' }],
    });
  }

  async decideRequest(user: AuthUser, id: string, body: { status?: StudentFileRequestStatus; decisionNote?: string; fileUrl?: string }) {
    if (body.status !== StudentFileRequestStatus.APPROVED && body.status !== StudentFileRequestStatus.REJECTED && body.status !== StudentFileRequestStatus.READY) {
      throw new BadRequestException('حالة القرار غير صحيحة');
    }
    const request = await this.prisma.studentFileRequest.findUnique({ where: { id } });
    if (!request) throw new NotFoundException('الطلب غير موجود');
    if (body.fileUrl) assertSafeFileUrl(body.fileUrl);
    if (body.status === StudentFileRequestStatus.READY && !body.fileUrl?.trim()) {
      throw new BadRequestException('يجب توفير رابط الملف قبل نشره للطالب');
    }
    const labels = { APPROVED: 'تمت الموافقة على طلبك', REJECTED: 'تم رفض طلبك', READY: 'ملفك جاهز للتحميل' };
    if (request.status === body.status && request.decisionNote === (body.decisionNote?.trim() || null) &&
        (body.status !== StudentFileRequestStatus.READY || request.fileUrl === body.fileUrl?.trim())) return request;
    return this.withStudentNotice(request.studentId, labels[body.status], tx => tx.studentFileRequest.update({
      where: { id },
      data: {
        status: body.status!,
        decisionNote: body.decisionNote?.trim() || null,
        fileUrl: body.status === StudentFileRequestStatus.READY ? body.fileUrl!.trim() : request.fileUrl,
        reviewedById: user.id,
        reviewedAt: new Date(),
      },
    }), body.decisionNote);
  }

  async publishMonthlyReport(user: AuthUser, body: { studentId?: string; from?: string; to?: string; fileUrl?: string; reportDraft?: unknown }) {
    if (!body.studentId || !body.from || !body.to || !body.fileUrl?.startsWith('data:application/pdf;base64,')) {
      throw new BadRequestException('الطالب والفترة وملف PDF مطلوبون');
    }
    const from = new Date(body.from);
    const to = new Date(body.to);
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || from > to) {
      throw new BadRequestException('فترة التقرير غير صحيحة');
    }
    assertSafeFileUrl(body.fileUrl);
    const student = await this.prisma.student.findFirst({ where: { id: body.studentId, deletedAt: null }, select: { id: true } });
    if (!student) throw new NotFoundException('الطالب غير موجود');
    return this.withStudentNotice(student.id, 'التقرير الشهري جاهز', tx => tx.studentFileRequest.create({
      data: {
        studentId: student.id,
        kind: StudentFileRequestKind.MONTHLY_REPORT,
        periodFrom: from,
        periodTo: to,
        status: StudentFileRequestStatus.READY,
        fileUrl: body.fileUrl,
        reportDraft: (body.reportDraft ?? {}) as any,
        reviewedById: user.id,
        reviewedAt: new Date(),
        decisionNote: 'تم إنشاء التقرير الشهري ونشره تلقائيًا من بيانات النظام.',
      },
    }));
  }

  async issueRecord(user: AuthUser, body: { studentId?: string; templateId?: string; kind?: CertificateKind; title?: string; details?: unknown; fileUrl?: string }) {
    if (!body.studentId || !body.title?.trim() || !body.fileUrl?.trim() || !Object.values(CertificateKind).includes(body.kind as CertificateKind)) {
      throw new BadRequestException('الطالب ونوع الشهادة وعنوانها وملف PDF مطلوبة');
    }
    assertSafeFileUrl(body.fileUrl);
    const student = await this.prisma.student.findFirst({ where: { id: body.studentId, deletedAt: null }, select: { id: true } });
    if (!student) throw new NotFoundException('الطالب غير موجود');
    if (body.templateId) {
      const template = await this.prisma.certificateTemplate.findUnique({ where: { id: body.templateId } });
      if (!template || !template.isActive) throw new BadRequestException('القالب غير موجود أو متوقف');
    }
    return this.withStudentNotice(student.id, 'صدرت لك شهادة جديدة', tx => tx.certificateRecord.create({
      data: {
        studentId: student.id,
        templateId: body.templateId || null,
        kind: body.kind!,
        title: body.title.trim(),
        details: (body.details ?? {}) as any,
        fileUrl: body.fileUrl.trim(),
        issuedById: user.id,
      },
    }), body.title);
  }
}
