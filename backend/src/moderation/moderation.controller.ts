import { BadRequestException, Body, Controller, ForbiddenException, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ModerationActionType, ModerationReportStatus, ModerationTargetType, Role } from '@prisma/client';
import { AuthUser, CurrentUser } from '../common/decorators';
import { PrismaService } from '../prisma/prisma.service';
import { visibility } from '../community/community-policy';

const REASONS = new Set(['ABUSE', 'BULLYING', 'INAPPROPRIATE', 'SPAM', 'IMPERSONATION', 'OTHER']);

@Controller('moderation')
export class ModerationController {
  constructor(private readonly prisma: PrismaService) {}

  private staff(user: AuthUser) {
    const moderationRoles: Role[] = [Role.ADMIN, Role.SUPERVISOR, Role.FOUNDER];
    if (!moderationRoles.includes(user.role)) throw new ForbiddenException('هذه الصفحة مخصصة لمشرفي المحتوى');
  }

  private async assertReportable(user: AuthUser, type: ModerationTargetType, id: string) {
    if (type === ModerationTargetType.POST) {
      const row = await this.prisma.communityPost.findFirst({ where: { AND: [{ id }, visibility(user.id)] }, select: { authorId: true } });
      if (!row) throw new BadRequestException('المحتوى غير موجود أو غير متاح');
      return row.authorId;
    }
    if (type === ModerationTargetType.COMMENT) {
      const row = await this.prisma.communityComment.findFirst({ where: { id, post: { AND: [visibility(user.id)] } }, select: { userId: true } });
      if (!row) throw new BadRequestException('التعليق غير موجود أو غير متاح');
      return row.userId;
    }
    if (type === ModerationTargetType.STORY) {
      const row = await this.prisma.communityStory.findFirst({ where: { id, expiresAt: { gt: new Date() } }, select: { authorId: true } });
      if (!row) throw new BadRequestException('الستوري غير موجود أو انتهت صلاحيته');
      return row.authorId;
    }
    const row = await this.prisma.message.findFirst({ where: { id, deletedAt: null, conversation: { members: { some: { userId: user.id, leftAt: null } } } }, select: { senderId: true } });
    if (!row) throw new BadRequestException('الرسالة غير موجودة أو لا تخص محادثاتك');
    return row.senderId;
  }

  @Post('reports')
  async report(@CurrentUser() user: AuthUser, @Body() body: { targetType?: string; targetId?: string; reason?: string; details?: string }) {
    if (!Object.values(ModerationTargetType).includes(body.targetType as ModerationTargetType) || !body.targetId || body.targetId.length > 100) throw new BadRequestException('هدف البلاغ غير صالح');
    if (!body.reason || !REASONS.has(body.reason)) throw new BadRequestException('اختر سببًا صحيحًا للبلاغ');
    if (typeof body.details !== 'undefined' && (typeof body.details !== 'string' || body.details.length > 500)) throw new BadRequestException('تفاصيل البلاغ طويلة جدًا');
    const type = body.targetType as ModerationTargetType;
    const ownerId = await this.assertReportable(user, type, body.targetId);
    if (ownerId === user.id) throw new BadRequestException('لا يمكنك الإبلاغ عن محتواك');
    const existing = await this.prisma.moderationReport.findUnique({ where: { reporterId_targetType_targetId: { reporterId: user.id, targetType: type, targetId: body.targetId } } });
    if (existing) return { ...existing, duplicate: true };
    return this.prisma.moderationReport.create({ data: { reporterId: user.id, targetType: type, targetId: body.targetId, reason: body.reason, details: body.details?.trim() || null } });
  }

  @Get('reports')
  async reports(@CurrentUser() user: AuthUser, @Query('status') rawStatus?: string) {
    this.staff(user);
    const status = Object.values(ModerationReportStatus).includes(rawStatus as ModerationReportStatus) ? rawStatus as ModerationReportStatus : ModerationReportStatus.PENDING;
    const rows = await this.prisma.moderationReport.findMany({ where: { status }, orderBy: { createdAt: 'desc' }, take: 100, include: { reporter: { select: { id: true, fullName: true } }, reviewedBy: { select: { id: true, fullName: true } }, actions: { orderBy: { createdAt: 'desc' }, include: { actor: { select: { fullName: true } } } } } });
    return Promise.all(rows.map(async report => ({ ...report, target: await this.targetPreview(report.targetType, report.targetId) })));
  }

  @Get('stats')
  async stats(@CurrentUser() user: AuthUser) {
    this.staff(user);
    const start = new Date(); start.setHours(0, 0, 0, 0);
    const [pending, reviewedToday, removedToday] = await Promise.all([
      this.prisma.moderationReport.count({ where: { status: ModerationReportStatus.PENDING } }),
      this.prisma.moderationReport.count({ where: { reviewedAt: { gte: start } } }),
      this.prisma.moderationAction.count({ where: { action: ModerationActionType.REMOVE, createdAt: { gte: start } } }),
    ]);
    return { pending, reviewedToday, removedToday };
  }

  private async targetPreview(type: ModerationTargetType, id: string) {
    if (type === ModerationTargetType.POST) return this.prisma.communityPost.findUnique({ where: { id }, select: { id: true, body: true, author: { select: { id: true, fullName: true } } } });
    if (type === ModerationTargetType.COMMENT) return this.prisma.communityComment.findUnique({ where: { id }, select: { id: true, body: true, user: { select: { id: true, fullName: true } }, postId: true } });
    if (type === ModerationTargetType.STORY) return this.prisma.communityStory.findUnique({ where: { id }, select: { id: true, body: true, author: { select: { id: true, fullName: true } } } });
    // Privacy boundary: only the reported message is returned, never its conversation history.
    return this.prisma.message.findUnique({ where: { id }, select: { id: true, body: true, conversationId: true, sender: { select: { id: true, fullName: true } } } });
  }

  @Patch('reports/:id/decision')
  async decide(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() body: { action?: string; note?: string }) {
    this.staff(user);
    if (!Object.values(ModerationActionType).includes(body.action as ModerationActionType)) throw new BadRequestException('اختر إجراءً صحيحًا');
    if (typeof body.note !== 'undefined' && (typeof body.note !== 'string' || body.note.length > 500)) throw new BadRequestException('الملاحظة طويلة جدًا');
    const action = body.action as ModerationActionType;
    return this.prisma.$transaction(async tx => {
      const report = await tx.moderationReport.findUnique({ where: { id } });
      if (!report || report.status !== ModerationReportStatus.PENDING) throw new BadRequestException('تمت معالجة البلاغ مسبقًا');
      if (action === ModerationActionType.REMOVE) {
        if (report.targetType === ModerationTargetType.POST) await tx.communityPost.deleteMany({ where: { id: report.targetId } });
        if (report.targetType === ModerationTargetType.COMMENT) await tx.communityComment.deleteMany({ where: { id: report.targetId } });
        if (report.targetType === ModerationTargetType.STORY) await tx.communityStory.deleteMany({ where: { id: report.targetId } });
        if (report.targetType === ModerationTargetType.MESSAGE) await tx.message.updateMany({ where: { id: report.targetId, deletedAt: null }, data: { deletedAt: new Date(), body: '' } });
      }
      const updated = await tx.moderationReport.update({ where: { id }, data: { status: action === ModerationActionType.KEEP ? ModerationReportStatus.DISMISSED : ModerationReportStatus.RESOLVED, reviewedById: user.id, reviewedAt: new Date() } });
      await tx.moderationAction.create({ data: { reportId: id, actorId: user.id, action, note: body.note?.trim() || null } });
      return updated;
    });
  }
}

