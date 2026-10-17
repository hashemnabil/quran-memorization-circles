import { BadRequestException, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser } from '../common/decorators';
import { PushProvider, PushSendError } from './push-provider';

@Injectable()
export class PushService implements OnModuleInit, OnModuleDestroy {
  private readonly provider = new PushProvider();
  private readonly logger = new Logger(PushService.name);
  private timer?: ReturnType<typeof setInterval>; private running = false;
  constructor(private readonly prisma: PrismaService) {}
  config() { return { android: this.provider.ready('android'), ios: this.provider.ready('ios') }; }
  onModuleInit() {
    if (!this.provider.ready('android') && !this.provider.ready('ios')) return;
    const run = () => { void this.drain().catch(() => this.logger.warn('Push delivery worker unavailable')); };
    this.timer = setInterval(run, 15000); this.timer.unref?.(); run();
  }
  onModuleDestroy() { if (this.timer) clearInterval(this.timer); }
  async register(user: AuthUser, data: { installationId: string; platform: string; token: string }) {
    if (!data || !/^[\da-f-]{36}$/i.test(data.installationId) || !['android', 'ios'].includes(data.platform) || typeof data.token !== 'string' || data.token.length < 20 || data.token.length > 4096 || data.platform === 'ios' && !/^[a-f\d]+$/i.test(data.token)) throw new BadRequestException('بيانات تسجيل الإشعارات غير صالحة');
    if (!this.provider.ready(data.platform)) throw new BadRequestException('خدمة إشعارات الجوال غير مهيأة بعد');
    await this.prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT 1 FROM (SELECT pg_advisory_xact_lock(hashtext('push-device'), 0)) AS locked`;
      // Token rotation and account switches invalidate old pending deliveries.
      await tx.pushDevice.deleteMany({ where: { token: data.token, installationId: { not: data.installationId } } });
      const existing = await tx.pushDevice.findUnique({ where: { installationId: data.installationId } });
      if (existing && (existing.userId !== user.id || existing.token !== data.token)) await tx.pushDelivery.deleteMany({ where: { deviceId: existing.id } });
      await tx.pushDevice.upsert({ where: { installationId: data.installationId }, create: { ...data, userId: user.id }, update: { userId: user.id, platform: data.platform, token: data.token, enabled: true } });
    });
    return { registered: true };
  }
  async unregister(user: AuthUser, installationId: string) {
    if (typeof installationId !== 'string' || !/^[\da-f-]{36}$/i.test(installationId)) throw new BadRequestException('معرّف الجهاز غير صالح');
    await this.prisma.pushDevice.updateMany({ where: { installationId, userId: user.id }, data: { enabled: false } });
    return { registered: false };
  }
  async drain() {
    if (this.running) return; this.running = true;
    try {
      await this.prisma.$transaction(async tx => {
        await tx.$queryRaw`SELECT 1 FROM (SELECT pg_advisory_xact_lock(hashtext('push-prepare'), 0)) AS locked`;
        const notices = await tx.notification.findMany({ where: { pushQueuedAt: null, isRead: false, createdAt: { gte: new Date(Date.now() - 86400000) } }, orderBy: { createdAt: 'asc' }, take: 100 });
        for (const notice of notices) {
          const devices = await tx.pushDevice.findMany({ where: { userId: notice.userId, enabled: true, createdAt: { lte: notice.createdAt } } });
          for (const device of devices) if (this.provider.ready(device.platform)) await tx.pushDelivery.upsert({ where: { notificationId_deviceId: { notificationId: notice.id, deviceId: device.id } }, create: { notificationId: notice.id, deviceId: device.id }, update: {} });
          await tx.notification.update({ where: { id: notice.id }, data: { pushQueuedAt: new Date() } });
        }
      }, { timeout: 30000 });
      const jobs = await this.prisma.pushDelivery.findMany({ where: { OR: [{ status: 'PENDING', nextAttemptAt: { lte: new Date() } }, { status: 'SENDING', nextAttemptAt: { lte: new Date() } }] }, include: { device: true, notification: true }, take: 50, orderBy: { nextAttemptAt: 'asc' } });
      for (let offset = 0; offset < jobs.length; offset += 5) await Promise.all(jobs.slice(offset, offset + 5).map(async job => {
        // Re-read device ownership immediately before sending. A queued notification
        // may never be delivered to the next account signing into this installation.
        const device = await this.prisma.pushDevice.findUnique({ where: { id: job.deviceId } });
        const active = device?.enabled && device.userId === job.notification.userId && !job.notification.isRead && await this.prisma.user.count({ where: { id: device.userId, isActive: true, deletedAt: null } });
        if (!active) { await this.prisma.pushDelivery.update({ where: { id: job.id }, data: { status: 'SKIPPED' } }); return; }
        const claimed = await this.prisma.pushDelivery.updateMany({ where: { id: job.id, status: job.status, nextAttemptAt: job.nextAttemptAt }, data: { status: 'SENDING', attempts: { increment: 1 }, nextAttemptAt: new Date(Date.now() + 60000) } });
        if (!claimed.count) return;
        try {
          await this.provider.send(device!.platform, device!.token, job.notification);
          await this.prisma.pushDelivery.update({ where: { id: job.id }, data: { status: 'SENT', lastError: null } });
        } catch (error) {
          const invalid = error instanceof PushSendError && error.invalidToken;
          if (invalid) await this.prisma.pushDevice.updateMany({ where: { id: job.deviceId, token: device!.token }, data: { enabled: false } });
          await this.prisma.pushDelivery.update({ where: { id: job.id }, data: { status: invalid || job.attempts >= 7 ? 'FAILED' : 'PENDING', lastError: error instanceof PushSendError ? error.code : 'DELIVERY_UNAVAILABLE', nextAttemptAt: new Date(Date.now() + Math.min(3600000, 15000 * 2 ** job.attempts)) } });
        }
      }));
    } finally { this.running = false; }
  }
}
