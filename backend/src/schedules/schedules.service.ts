import { BadRequestException, Injectable, NotFoundException, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { AuthUser } from '../common/decorators';

const TZ = 'Asia/Riyadh';
function dateOnly(input: unknown): Date {
  if (typeof input !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(input)) throw new BadRequestException('التاريخ يجب أن يكون YYYY-MM-DD');
  const date = new Date(input + 'T00:00:00.000Z');
  if (Number.isNaN(date.valueOf()) || date.toISOString().slice(0, 10) !== input) throw new BadRequestException('تاريخ غير صالح');
  return date;
}
function textField(value: unknown, name: string, max = 2000): string {
  if (typeof value !== 'string' || !value.trim() || value.length > max) throw new BadRequestException('حقل غير صالح: ' + name);
  return value.trim();
}
function object(input: unknown): Record<string, any> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new BadRequestException('بيانات غير صالحة');
  return input as Record<string, any>;
}
function mediaData(input: unknown) {
  const b = object(input);
  return { date: dateOnly(b.date), day: textField(b.day, 'day', 30),
    activity: textField(b.activity, 'activity'), idea: textField(b.idea, 'idea'),
    content: textField(b.content, 'content', 10000) };
}
function dutyData(input: unknown) {
  const b = object(input);
  if (!Array.isArray(b.teacherUserIds) || b.teacherUserIds.length === 0 || b.teacherUserIds.length > 100 ||
    b.teacherUserIds.some((x: unknown) => typeof x !== 'string' || !x.trim()) ||
    new Set(b.teacherUserIds).size !== b.teacherUserIds.length) throw new BadRequestException('اختر محفّظًا واحدًا على الأقل دون تكرار');
  return { date: dateOnly(b.date), day: textField(b.day, 'day', 30),
    note: b.note == null || b.note === '' ? null : textField(b.note, 'note'),
    teacherUserIds: b.teacherUserIds as string[] };
}

@Injectable()
export class SchedulesService implements OnModuleInit, OnModuleDestroy {
  private timer?: ReturnType<typeof setInterval>;
  constructor(private readonly prisma: PrismaService, private readonly notifications: NotificationsService) {}
  onModuleInit() {
    this.timer = setInterval(() => { void this.sendDueReminders().catch(() => console.error('Duty reminder check failed')); }, 60_000);
    this.timer.unref?.();
    void this.sendDueReminders().catch(() => console.error('Duty reminder startup check failed'));
  }
  onModuleDestroy() { if (this.timer) clearInterval(this.timer); }

  media() { return this.prisma.mediaPlan.findMany({ orderBy: [{ date: 'asc' }, { createdAt: 'asc' }] }); }
  createMedia(user: AuthUser, input: unknown) {
    return this.prisma.mediaPlan.create({ data: { ...mediaData(input), createdById: user.id } });
  }
  async updateMedia(id: string, input: unknown) {
    if (!(await this.prisma.mediaPlan.count({ where: { id } }))) throw new NotFoundException();
    return this.prisma.mediaPlan.update({ where: { id }, data: mediaData(input) });
  }
  async deleteMedia(id: string) { await this.prisma.mediaPlan.deleteMany({ where: { id } }); return { deleted: true }; }

  teachers() {
    return this.prisma.user.findMany({ where: { role: Role.TEACHER, isActive: true, deletedAt: null },
      select: { id: true, fullName: true }, orderBy: { fullName: 'asc' } });
  }
  async duties(user: AuthUser) {
    const duties = await this.prisma.teacherDuty.findMany({
      where: {},
      include: { assignments: { select: { teacherUserId: true } } },
      orderBy: [{ date: 'asc' }, { createdAt: 'asc' }],
    });
    const ids = [...new Set(duties.flatMap(d => d.assignments.map(a => a.teacherUserId)))];
    const users = await this.prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, fullName: true } });
    const names = new Map(users.map(u => [u.id, u.fullName]));
    return duties.map(d => ({ ...d, assignments: d.assignments.map(a => ({
      ...a, teacherName: names.get(a.teacherUserId) ?? 'محفّظ غير متاح',
    })) }));
  }
  private async verifyTeachers(ids: string[]) {
    const count = await this.prisma.user.count({ where: { id: { in: ids }, role: Role.TEACHER, isActive: true, deletedAt: null } });
    if (count !== ids.length) throw new BadRequestException('أحد المحفّظين غير موجود أو غير نشط');
  }
  async createDuty(user: AuthUser, input: unknown) {
    const data = dutyData(input);
    await this.verifyTeachers(data.teacherUserIds);
    const duty = await this.prisma.teacherDuty.create({ data: {
      date: data.date, day: data.day, note: data.note, createdById: user.id,
      assignments: { create: data.teacherUserIds.map(teacherUserId => ({ teacherUserId })) },
    }, include: { assignments: true } });
    await this.notifyAssigned(duty.id, data.teacherUserIds, data.date);
    return duty;
  }
  async updateDuty(id: string, input: unknown) {
    const data = dutyData(input);
    await this.verifyTeachers(data.teacherUserIds);
    const existing = await this.prisma.teacherDuty.findUnique({ where: { id }, include: { assignments: true } });
    if (!existing) throw new NotFoundException();
    const oldIds = new Set(existing.assignments.map(a => a.teacherUserId));
    const newIds = data.teacherUserIds.filter(x => !oldIds.has(x));
    const removedIds = [...oldIds].filter(x => !data.teacherUserIds.includes(x));
    const dateChanged = existing.date.valueOf() !== data.date.valueOf();
    await this.prisma.$transaction(async tx => {
      await tx.teacherDuty.update({ where: { id }, data: { date: data.date, day: data.day, note: data.note } });
      await tx.teacherDutyAssignment.deleteMany({ where: { dutyId: id, teacherUserId: { notIn: data.teacherUserIds } } });
      if (newIds.length) await tx.teacherDutyAssignment.createMany({ data: newIds.map(teacherUserId => ({ dutyId: id, teacherUserId })) });
      if (dateChanged) await tx.teacherDutyAssignment.updateMany({ where: { dutyId: id },
        data: { assignedNotifiedAt: null, dayBeforeNotifiedAt: null, morningNotifiedAt: null } });
      for (const userId of removedIds) await tx.notification.create({ data: { userId, type: 'SYSTEM', title: 'أُلغي تكليفك بالنظام', body: 'أُلغي تكليفك بتاريخ ' + existing.date.toISOString().slice(0, 10), link: '/teacher-duties', data: { dutyId: id } } });
    });
    if (dateChanged || newIds.length) await this.notifyAssigned(id, dateChanged ? data.teacherUserIds : newIds, data.date);
    return this.prisma.teacherDuty.findUnique({ where: { id }, include: { assignments: true } });
  }
  async deleteDuty(id: string) {
    await this.prisma.$transaction(async tx => {
      const duty = await tx.teacherDuty.findUnique({ where: { id }, include: { assignments: true } });
      if (!duty) return;
      for (const assignment of duty.assignments) await tx.notification.create({ data: { userId: assignment.teacherUserId, type: 'SYSTEM', title: 'أُلغي موعد النظام', body: 'أُلغي موعد النظام بتاريخ ' + duty.date.toISOString().slice(0, 10), link: '/teacher-duties', data: { dutyId: id } } });
      await tx.teacherDuty.delete({ where: { id } });
    });
    return { deleted: true };
  }

  private async notifyAssigned(dutyId: string, ids: string[], date: Date) {
    for (const userId of ids) {
      await this.prisma.$transaction(async tx => {
      const claimed = await tx.teacherDutyAssignment.updateMany({
        where: { dutyId, teacherUserId: userId, assignedNotifiedAt: null, duty: { date } },
        data: { assignedNotifiedAt: new Date() },
      });
      if (claimed.count) await tx.notification.create({ data: { userId, type: 'SYSTEM',
        title: 'تم تعيينك في جدول النظام', body: 'موعد النظام: ' + date.toISOString().slice(0, 10),
        link: '/teacher-duties', data: { dutyId } } });
      });
    }
  }
  async sendDueReminders() {
    const now = new Date();
    const parts = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit',
      day: '2-digit', hour: '2-digit', hourCycle: 'h23' }).formatToParts(now);
    const get = (type: string) => parts.find(p => p.type === type)?.value ?? '';
    const localDate = get('year') + '-' + get('month') + '-' + get('day');
    if (Number(get('hour')) < 8) return;
    const today = dateOnly(localDate);
    const tomorrow = new Date(today.getTime() + 86400000);
    const assignments = await this.prisma.teacherDutyAssignment.findMany({
      where: { OR: [{ duty: { date: today }, morningNotifiedAt: null },
        { duty: { date: tomorrow }, dayBeforeNotifiedAt: null }] },
      include: { duty: true },
    });
    for (const assignment of assignments) {
      const morning = assignment.duty.date.getTime() === today.getTime();
      const field = morning ? 'morningNotifiedAt' : 'dayBeforeNotifiedAt';
      await this.prisma.$transaction(async tx => {
      const claimed = await tx.teacherDutyAssignment.updateMany({
        where: { id: assignment.id, [field]: null, duty: { date: assignment.duty.date } }, data: { [field]: now },
      });
      if (!claimed.count) return;
      await tx.notification.create({ data: { userId: assignment.teacherUserId, type: 'SYSTEM',
        title: morning ? 'تذكير: عليك النظام اليوم' : 'تذكير: عليك النظام غدًا',
        body: 'موعد النظام: ' + assignment.duty.date.toISOString().slice(0, 10),
        link: '/teacher-duties', data: { dutyId: assignment.dutyId } } });
      });
    }
  }
}
