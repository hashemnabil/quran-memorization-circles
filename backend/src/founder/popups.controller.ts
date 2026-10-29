import { BadRequestException, Body, Controller, Get, NotFoundException, Optional, Param, Post, UnauthorizedException } from '@nestjs/common';
import { NotificationType, Prisma, Role } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { AuthUser, CurrentUser, Public, Roles } from '../common/decorators';
import { PrismaService } from '../prisma/prisma.service';
import { popupVisible, safePopupLink, validPopup } from './popup-policy';
import { NotificationsService, recordNotificationChange } from '../notifications/notifications.service';

const visibleSelect = { id: true, title: true, body: true, link: true, audience: true, isActive: true, publishedAt: true, expiresAt: true, popup: true } as const;

@Controller('popup-announcements')
export class PopupsController {
  constructor(private readonly prisma: PrismaService, @Optional() private readonly notifications?: NotificationsService) {}

  private async active(role?: string, userId?: string) {
    const rows = await this.prisma.announcement.findMany({ where: { isPopup: true, isActive: true, publishedAt: { lte: new Date() }, AND: [
      { OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] },
      { OR: role ? [{ audience: { isEmpty: true } }, { audience: { has: role as Role } }] : [{ audience: { isEmpty: true } }] },
    ] }, select: visibleSelect, take: 100 });
    const visible = rows.filter(row => popupVisible(row, role)).sort((a, b) => (b.popup as any).priority - (a.popup as any).priority);
    const receipts = userId ? await this.prisma.announcementReceipt.findMany({ where: { announcementId: { in: visible.map(row => row.id) }, subject: `user:${userId}`, kind: { in: ['ACK', 'VIEW'] } }, select: { announcementId: true, kind: true, createdAt: true } }) : [];
    return visible.map(row => ({ ...row, receipts: receipts.filter(receipt => receipt.announcementId === row.id) }));
  }

  @Public() @Get('public') publicList() { return this.active(); }
  @Get('active') privateList(@CurrentUser() user: AuthUser) { return this.active(user.role, user.id); }

  @Roles(Role.FOUNDER) @Get('manage')
  async manage() {
    const rows = await this.prisma.announcement.findMany({ where: { isPopup: true }, orderBy: { updatedAt: 'desc' }, take: 100, select: visibleSelect });
    return Promise.all(rows.map(async row => ({ ...row,
      counts: await this.prisma.announcementReceipt.groupBy({ by: ['kind'], where: { announcementId: row.id }, _count: true }),
      uniqueAuthenticatedViewers: (await this.prisma.announcementReceipt.groupBy({ by: ['subject'], where: { announcementId: row.id, kind: 'VIEW', subject: { startsWith: 'user:' } } })).length,
    })));
  }

  @Roles(Role.FOUNDER) @Get(':id/readers')
  async readers(@Param('id') id: string) {
    const announcement = await this.prisma.announcement.findFirst({ where: { id, isPopup: true }, select: { audience: true } });
    if (!announcement) throw new NotFoundException('الإعلان غير موجود');
    const receipts = await this.prisma.announcementReceipt.findMany({ where: { announcementId: id, subject: { startsWith: 'user:' }, kind: { in: ['ACK', 'VIEW'] } }, orderBy: { createdAt: 'desc' }, take: 1000, select: { subject: true, kind: true, createdAt: true } });
    const people = await this.prisma.user.findMany({ where: { id: { in: [...new Set(receipts.map(receipt => receipt.subject.slice(5)))] }, deletedAt: null, ...(announcement.audience.length ? { role: { in: announcement.audience } } : {}) }, select: { id: true, fullName: true, role: true } });
    return people.map(person => ({ ...person, receipts: receipts.filter(receipt => receipt.subject === `user:${person.id}`) }));
  }

  @Roles(Role.FOUNDER) @Post('save')
  async save(@CurrentUser() user: AuthUser, @Body() body: any) {
    if (!body || typeof body.password !== 'string' || body.password.length > 128) throw new UnauthorizedException('أعد إدخال كلمة المرور');
    const account = await this.prisma.user.findFirst({ where: { id: user.id, role: Role.FOUNDER, isActive: true, deletedAt: null }, select: { passwordHash: true } });
    if (!account || !await bcrypt.compare(body.password, account.passwordHash)) throw new UnauthorizedException('تعذر التحقق من الهوية');
    if (typeof body.title !== 'string' || !body.title.trim() || body.title.length > 200 || typeof body.body !== 'string' || body.body.length > 2000 || !validPopup(body.popup) || !safePopupLink(body.link || '')) throw new BadRequestException('بيانات الإعلان غير صالحة');
    if (!Array.isArray(body.audience) || body.audience.length > 8 || body.audience.some((role: unknown) => !Object.values(Role).includes(role as Role))) throw new BadRequestException('الجمهور غير صالح');
    if (body.popup.placement !== 'AFTER' && body.audience.length) throw new BadRequestException('إعلان ما قبل الدخول يجب أن يكون عاماً دون جمهور داخلي');
    const start = new Date(body.publishedAt), end = body.expiresAt ? new Date(body.expiresAt) : null;
    if (!Number.isFinite(start.getTime()) || end && (!Number.isFinite(end.getTime()) || end <= start)) throw new BadRequestException('فترة الإعلان غير صالحة');
    if (body.popup.imageAssetId && !await this.prisma.founderAsset.findFirst({ where: { id: body.popup.imageAssetId, kind: 'ANNOUNCEMENT_IMAGE', isActive: true, mime: { startsWith: 'image/' } }, select: { id: true } })) throw new BadRequestException('الصورة غير متاحة في مكتبة صور الإعلانات');
    if (body.popup.videoAssetId && !await this.prisma.founderAsset.findFirst({ where: { id: body.popup.videoAssetId, kind: 'ANNOUNCEMENT_VIDEO', isActive: true }, select: { id: true } })) throw new BadRequestException('الفيديو غير متاح في المكتبة');
    if (body.id && (typeof body.id !== 'string' || !await this.prisma.announcement.findFirst({ where: { id: body.id, isPopup: true }, select: { id: true } }))) throw new NotFoundException('الإعلان غير موجود');
    const { placement, repeat, state, priority, requireAck, important, buttonText, imageAssetId } = body.popup;
    const data = { title: body.title.trim(), body: body.body, link: body.link || null, audience: body.audience, publishedAt: start, expiresAt: end, isPopup: true, isActive: state === 'PUBLISHED', popup: { placement, repeat, state, priority, requireAck, important, buttonText, imageAssetId, videoAssetId: body.popup.videoAssetId || '' } };
    return this.prisma.$transaction(async tx => {
      const row = body.id ? await tx.announcement.update({ where: { id: body.id }, data }) : await tx.announcement.create({ data: { ...data, createdById: user.id } });
      await tx.activityLog.create({ data: { userId: user.id, action: `FOUNDER_POPUP_${state}`, summary: `إعلان منبثق: ${row.title}`, entityType: 'Announcement', entityId: row.id } });
      return row;
    });
  }

  @Roles(Role.FOUNDER) @Post(':id/notify')
  async notify(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() body: { password?: string }) {
    if (typeof body.password !== 'string' || body.password.length > 128) throw new UnauthorizedException('أعد إدخال كلمة المرور');
    const account = await this.prisma.user.findFirst({ where: { id: user.id, role: Role.FOUNDER, isActive: true, deletedAt: null }, select: { passwordHash: true } });
    if (!account || !await bcrypt.compare(body.password, account.passwordHash)) throw new UnauthorizedException('تعذر التحقق من الهوية');
    const row = await this.prisma.announcement.findFirst({ where: { id, isPopup: true }, select: visibleSelect });
    if (!row || !validPopup(row.popup) || row.popup.placement === 'BEFORE' || row.popup.state !== 'PUBLISHED' || !row.isActive || row.publishedAt > new Date() || row.expiresAt && row.expiresAt <= new Date()) throw new BadRequestException('انشر إعلاناً صالحاً بعد الدخول قبل إرسال إشعار');
    const people = await this.prisma.user.findMany({ where: { isActive: true, deletedAt: null, role: row.audience.length ? { in: row.audience } : { not: Role.PARENT } }, select: { id: true }, take: 501 });
    if (people.length > 500) throw new BadRequestException('الإرسال الحالي يدعم حتى 500 مستلم؛ خصّص جمهور الإعلان');
    const notices = await this.prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT 1 FROM (SELECT pg_advisory_xact_lock(hashtext(${id}), 6291002)) AS locked`;
      const marker = { announcementId: id, subject: 'system', kind: 'DISPATCH', eventKey: 'once' };
      if (await tx.announcementReceipt.findUnique({ where: { announcementId_subject_kind_eventKey: marker } })) return [];
      await tx.announcementReceipt.create({ data: marker });
      const saved = [];
      for (const person of people) {
        const notice = await tx.notification.create({ data: { userId: person.id, type: NotificationType.ANNOUNCEMENT, title: 'إعلان جديد من المدرسة', body: 'افتح الموقع لعرض الإعلان وفق صلاحيات حسابك', link: `/notifications?announcement=${id}`, data: { announcementId: id } } });
        await recordNotificationChange(tx, notice); saved.push(notice);
      }
      await tx.activityLog.create({ data: { userId: user.id, action: 'FOUNDER_POPUP_NOTIFY', summary: `إرسال إشعار إعلان إلى ${saved.length} حساب`, entityType: 'Announcement', entityId: id } });
      return saved;
    }, { timeout: 30000 });
    for (const notice of notices) await this.notifications?.deliver(notice);
    return { recipientCount: notices.length, message: notices.length ? 'حُفظت الإشعارات للإرسال؛ هذا لا يعني عرض الإعلان أو وصول Push فعلياً' : 'سبق إرسال إشعار لهذا الإعلان أو لا يوجد مستلمون' };
  }

  private async event(id: string, body: any, user?: AuthUser) {
    if (!body || !['VIEW', 'CLICK', 'ACK'].includes(body.kind) || typeof body.eventKey !== 'string' || !/^[a-zA-Z0-9-]{1,80}$/.test(body.eventKey)) throw new BadRequestException('حدث غير صالح');
    if (!user && (typeof body.device !== 'string' || !/^[a-f0-9-]{36}$/i.test(body.device) || body.kind === 'ACK')) throw new BadRequestException('يلزم تسجيل الدخول لتأكيد القراءة');
    const row = await this.prisma.announcement.findFirst({ where: { id, isPopup: true }, select: visibleSelect });
    // An offline ACK may arrive after expiry/stop: accept it only for the same
    // authenticated audience without sending the announcement back to the caller.
    const delayedAck = user && body.kind === 'ACK' && row && row.publishedAt <= new Date() && validPopup(row.popup) && row.popup.state !== 'DRAFT' && ['AFTER', 'BOTH'].includes(row.popup.placement) && (!row.audience.length || row.audience.includes(user.role));
    if (!row || !popupVisible(row, user?.role) && !delayedAck) throw new NotFoundException('الإعلان غير متاح');
    const subject = user ? `user:${user.id}` : `device:${body.device}`;
    const eventKey = body.kind === 'ACK' ? 'ack' : body.eventKey;
    const where = { announcementId: id, subject, kind: body.kind, eventKey };
    try { await this.prisma.announcementReceipt.create({ data: where }); } catch (error) { if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') throw error; }
    return { saved: true };
  }
  @Public() @Post(':id/public-event') publicEvent(@Param('id') id: string, @Body() body: any) { return this.event(id, body); }
  @Post(':id/event') privateEvent(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() body: any) { return this.event(id, body, user); }
}
