import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { recordNotificationChange } from '../notifications/notifications.service';

@Injectable()
export class ExamRemindersService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ExamRemindersService.name);
  private timer?: ReturnType<typeof setInterval>;
  private running = false;
  constructor(private readonly prisma: PrismaService, private readonly realtime: RealtimeGateway) {}
  onModuleInit() {
    const run = () => { void this.sendDueReminders().catch(() => this.logger.warn('Exam reminder check failed')); };
    this.timer = setInterval(run, 60_000); this.timer.unref?.(); run();
  }
  onModuleDestroy() { if (this.timer) clearInterval(this.timer); }
  async sendDueReminders(now = new Date()) {
    if (this.running) return;
    this.running = true;
    try {
      const exams = await this.prisma.exam.findMany({ where: { status: 'SCHEDULED',
        scheduledAt: { gt: now, lte: new Date(now.getTime() + 86400000) },
        student: { deletedAt: null, user: { isActive: true, deletedAt: null } } },
        select: { id: true, scheduledAt: true, location: true, student: { select: { userId: true } } },
      });
      for (const exam of exams) {
        const userId = exam.student.userId;
        if (!userId) continue;
        const hour = exam.scheduledAt.getTime() - now.getTime() <= 3600000;
        const reminderKey = `${exam.id}:${exam.scheduledAt.toISOString()}:${hour ? 'hour' : 'day'}`;
        const notification = await this.prisma.$transaction(async tx => {
          await tx.$queryRaw`SELECT 1 FROM (SELECT pg_advisory_xact_lock(hashtext('exam-reminder'), hashtext(${reminderKey}))) AS locked`;
          // Check again under the lock: cancellation or rescheduling invalidates the reminder.
          if (!await tx.exam.count({ where: { id: exam.id, status: 'SCHEDULED', scheduledAt: exam.scheduledAt } })) return;
          if (await tx.notification.findFirst({ where: { userId, type: 'EXAM_SCHEDULED', data: { path: ['reminderKey'], equals: reminderKey } } })) return;
          const saved = await tx.notification.create({ data: { userId, type: 'EXAM_SCHEDULED',
            title: hour ? 'تذكير: اختبارك خلال ساعة' : 'تذكير: اختبارك خلال 24 ساعة',
            body: `موعد الاختبار: ${exam.scheduledAt.toLocaleString('ar', { timeZone: 'Asia/Riyadh' })}${exam.location ? ` — ${exam.location}` : ''}`,
            link: '/student', data: { examId: exam.id, reminderKey, scheduledAt: exam.scheduledAt.toISOString() } } });
          await recordNotificationChange(tx, saved);
          return saved;
        });
        if (notification) {
          try {
            const unreadCount = await this.prisma.notification.count({ where: { userId, isRead: false } });
            this.realtime.emitToUser(userId, 'notification:new', { notification, unreadCount });
          } catch { this.logger.warn('Exam reminder saved; live delivery unavailable'); }
        }
      }
    } finally { this.running = false; }
  }
}
