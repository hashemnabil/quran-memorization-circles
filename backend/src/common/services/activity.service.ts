import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

/** Lightweight audit trail feeding the "general activity" panel of the dashboard. */
@Injectable()
export class ActivityService {
  private readonly logger = new Logger(ActivityService.name);

  constructor(private readonly prisma: PrismaService) {}

  async log(params: {
    userId?: string | null;
    action: string;
    summary: string;
    entityType?: string;
    entityId?: string;
    metadata?: Record<string, any>;
  }) {
    try {
      await this.prisma.activityLog.create({
        data: {
          userId: params.userId ?? null,
          action: params.action,
          summary: params.summary,
          entityType: params.entityType,
          entityId: params.entityId,
          metadata: params.metadata as any,
        },
      });
    } catch (error) {
      // Never let auditing break the business operation.
      this.logger.warn(`تعذر تسجيل النشاط: ${(error as Error).message}`);
    }
  }
}
