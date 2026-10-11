import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { CertificateKind, Role, StudentFileRequestKind, StudentFileRequestStatus } from '@prisma/client';
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
  constructor(private readonly prisma: PrismaService) {}

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
    return this.prisma.studentFileRequest.create({
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

  async listRequests() {
    return this.prisma.studentFileRequest.findMany({
      include: { student: { select: { id: true, fullName: true, code: true } }, reviewedBy: { select: { fullName: true } } },
      orderBy: [{ status: 'asc' }, { createdAt: 'asc' }],
    });
  }

  async decideRequest(user: AuthUser, id: string, body: { status?: StudentFileRequestStatus; decisionNote?: string; fileUrl?: string }) {
    if (![StudentFileRequestStatus.APPROVED, StudentFileRequestStatus.REJECTED, StudentFileRequestStatus.READY].includes(body.status as StudentFileRequestStatus)) {
      throw new BadRequestException('حالة القرار غير صحيحة');
    }
    const request = await this.prisma.studentFileRequest.findUnique({ where: { id } });
    if (!request) throw new NotFoundException('الطلب غير موجود');
    if (body.status === StudentFileRequestStatus.READY && !body.fileUrl?.trim()) {
      throw new BadRequestException('يجب توفير رابط الملف قبل نشره للطالب');
    }
    return this.prisma.studentFileRequest.update({
      where: { id },
      data: {
        status: body.status!,
        decisionNote: body.decisionNote?.trim() || null,
        fileUrl: body.status === StudentFileRequestStatus.READY ? body.fileUrl!.trim() : request.fileUrl,
        reviewedById: user.id,
        reviewedAt: new Date(),
      },
    });
  }

  async issueRecord(user: AuthUser, body: { studentId?: string; templateId?: string; kind?: CertificateKind; title?: string; details?: unknown; fileUrl?: string }) {
    if (!body.studentId || !body.title?.trim() || !body.fileUrl?.trim() || !Object.values(CertificateKind).includes(body.kind as CertificateKind)) {
      throw new BadRequestException('الطالب ونوع الشهادة وعنوانها وملف PDF مطلوبة');
    }
    const student = await this.prisma.student.findFirst({ where: { id: body.studentId, deletedAt: null }, select: { id: true } });
    if (!student) throw new NotFoundException('الطالب غير موجود');
    if (body.templateId) {
      const template = await this.prisma.certificateTemplate.findUnique({ where: { id: body.templateId } });
      if (!template || !template.isActive) throw new BadRequestException('القالب غير موجود أو متوقف');
    }
    return this.prisma.certificateRecord.create({
      data: {
        studentId: student.id,
        templateId: body.templateId || null,
        kind: body.kind!,
        title: body.title.trim(),
        details: (body.details ?? {}) as any,
        fileUrl: body.fileUrl.trim(),
        issuedById: user.id,
      },
    });
  }
}
