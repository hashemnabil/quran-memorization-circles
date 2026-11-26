import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser } from '../common/decorators';

const text = (value: unknown, label: string, max = 2000, optional = false) => {
  if (optional && (value == null || value === '')) return '';
  if (typeof value !== 'string' || !value.trim() || value.length > max) throw new BadRequestException(`${label} غير صالح`);
  return value.trim();
};
export function operationDate(value: unknown) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}(T.*)?$/.test(value)) throw new BadRequestException('التاريخ غير صالح');
  const date = new Date(value); if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0,10) !== value.slice(0,10)) throw new BadRequestException('التاريخ غير صالح');
  return date;
}
export function meetingData(body: any) {
  if (!body || !Array.isArray(body.attendees) || body.attendees.length > 500 || !Array.isArray(body.sections) || body.sections.length > 100) throw new BadRequestException('بيانات الاجتماع غير صالحة');
  return { title: text(body.title, 'العنوان', 200), heldAt: operationDate(body.heldAt), notes: text(body.notes, 'الملاحظات', 10000, true),
    attendees: body.attendees.map((name: unknown) => text(name, 'اسم الحاضر', 150)),
    sections: body.sections.map((row: any) => ({ title: text(row?.title, 'عنوان القسم', 200), description: text(row?.description, 'الشرح', 10000, true), speaker: text(row?.speaker, 'المحاضر', 200, true) })) };
}
export function committeeData(body: any) {
  if (!body || !Array.isArray(body.members) || !body.members.length || body.members.length > 50) throw new BadRequestException('أضف أعضاء اللجنة');
  return { number: text(body.number, 'رقم اللجنة', 80), heldAt: operationDate(body.heldAt), location: text(body.location, 'المكان', 200), notes: text(body.notes, 'الملاحظات', 10000, true),
    members: body.members.map((row: any) => ({ name: text(row?.name, 'اسم العضو', 150), userId: row?.userId ? text(row.userId, 'معرف العضو', 36) : null })) };
}
@Injectable()
export class SchoolOperationsService {
  constructor(private readonly prisma: PrismaService) {}
  private admin(user: AuthUser) { if (user.role !== 'ADMIN') throw new ForbiddenException('الإدارة فقط'); }
  async meetings(user: AuthUser) { this.admin(user); return this.prisma.meeting.findMany({ orderBy: { heldAt: 'desc' } }); }
  async committees(user: AuthUser) {
    if (!['ADMIN','SUPERVISOR','TEACHER','EXAM_COMMITTEE'].includes(user.role)) throw new ForbiddenException();
    // Lists contain committee logistics only; student/results access stays in ExamsService.
    return this.prisma.examCommittee.findMany({ orderBy: { heldAt: 'desc' } });
  }
  async write(user: AuthUser, kind: 'meetings'|'examCommittees', body: unknown, id?: string, create = false) {
    this.admin(user);
    const model = kind === 'meetings' ? this.prisma.meeting : this.prisma.examCommittee;
    const data = kind === 'meetings' ? meetingData(body) : committeeData(body);
    if (create || !id) return (model as any).create({ data: { ...data, ...(id ? { id } : {}), createdById: user.id } });
    const existing = await (model as any).findUnique({ where: { id } }); if (!existing) throw new NotFoundException();
    return (model as any).update({ where: { id }, data });
  }
  async remove(user: AuthUser, kind: 'meetings'|'examCommittees', id: string) {
    this.admin(user);
    if (kind === 'examCommittees' && await this.prisma.exam.count({ where: { committeeId: id } })) throw new BadRequestException('لا يمكن حذف لجنة مرتبطة باختبارات؛ احتفظ بسجلها');
    const model = kind === 'meetings' ? this.prisma.meeting : this.prisma.examCommittee;
    await (model as any).delete({ where: { id } }); return { id };
  }
}
