import { BadRequestException, Body, Controller, ForbiddenException, Get, NotFoundException, Param, Patch, Post } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { Prisma, Role } from '@prisma/client';
import { AuthUser, CurrentUser } from '../common/decorators';
import { AccessControlService } from '../common/services/access-control.service';
import { PrismaService } from '../prisma/prisma.service';
import { SURAHS } from '../common/quran';

type Plan = {id: string; studentId: string; title: string; period: string; unit: string; target: number; completed: number; dueAt: Date | null; archived: boolean; createdAt: Date; scope: unknown};
const UNITS = ['VERSES', 'PAGES', 'SURAHS', 'JUZ', 'TASKS'];
const PERIODS = ['WEEKLY', 'MONTHLY', 'GOAL'];
function planInput(body: Record<string, unknown>) {
  if (!body || typeof body.title !== 'string' || !body.title.trim() || body.title.length > 160 || !UNITS.includes(String(body.unit)) || !PERIODS.includes(String(body.period))) throw new BadRequestException('أدخل عنوانًا ووحدة ومدة صالحة');
  const dueAt = body.dueAt ? new Date(String(body.dueAt)) : null;
  if (dueAt && !Number.isFinite(dueAt.getTime())) throw new BadRequestException('تاريخ نهاية الخطة غير صالح');
  const unit = String(body.unit);
  let scope: {items?: number[]; surah?: number; from?: number; to?: number} | null = null;
  if (body.scope != null) {
    if (typeof body.scope !== 'object' || Array.isArray(body.scope)) throw new BadRequestException('نطاق الخطة غير صالح');
    const raw = body.scope as Record<string, unknown>;
    if (unit === 'VERSES') {
      const surah = Number(raw.surah), from = Number(raw.from), to = Number(raw.to);
      if (![surah, from, to].every(Number.isInteger) || !SURAHS[surah - 1] || from < 1 || to < from || to > SURAHS[surah - 1].ayahs) throw new BadRequestException('حدد سورة وآيات صحيحة');
      scope = {surah, from, to};
    } else if (unit !== 'TASKS') {
      const max = unit === 'JUZ' ? 30 : unit === 'SURAHS' ? 114 : 604;
      const items = raw.items;
      if (!Array.isArray(items) || !items.length || items.length > max || items.some(value => !Number.isInteger(value) || value < 1 || value > max) || new Set(items).size !== items.length) throw new BadRequestException('حدد الأجزاء أو السور أو الصفحات دون تكرار');
      scope = {items: [...items].sort((a, b) => a - b)};
    } else throw new BadRequestException('المهام لا تقبل نطاق قرآن');
  }
  const target = scope ? unit === 'VERSES' ? scope.to! - scope.from! + 1 : scope.items!.length : body.target;
  if (typeof target !== 'number' || !Number.isFinite(target) || target <= 0 || target > 1_000_000) throw new BadRequestException('هدف الخطة غير صالح');
  return {title: body.title.trim(), unit, period: String(body.period), target, dueAt, scope};
}

@Controller('students/:studentId/plans')
export class MemorizationPlansController {
  constructor(private readonly prisma: PrismaService, private readonly acl: AccessControlService) {}
  private async canWrite(user: AuthUser, studentId: string) {
    if (![Role.ADMIN, Role.SUPERVISOR, Role.TEACHER].includes(user.role as any)) throw new ForbiddenException('إدارة الخطة للمسؤول عن الطالب فقط');
    await this.acl.assertStudentWriteAccess(user, studentId);
  }
  @Get()
  async list(@CurrentUser() user: AuthUser, @Param('studentId') studentId: string) {
    await this.acl.assertStudentAccess(user, studentId);
    const plans = await this.prisma.$queryRaw<Plan[]>`SELECT * FROM "memorization_plans" WHERE "studentId" = ${studentId} ORDER BY "archived", "createdAt" DESC LIMIT 200`;
    const logs = await this.prisma.$queryRaw<Array<{id: string; planId: string; amount: number; itemIds: number[]; versesCount: number; note: string; createdAt: Date; recorderName: string}>>`SELECT p."id", p."planId", p."amount", p."itemIds", p."versesCount", p."note", p."createdAt", u."fullName" AS "recorderName" FROM "memorization_progress" p JOIN "memorization_plans" m ON m."id" = p."planId" JOIN "users" u ON u."id" = p."recordedById" WHERE m."studentId" = ${studentId} ORDER BY p."createdAt" DESC LIMIT 500`;
    return plans.map(plan => ({...plan, logs: logs.filter(log => log.planId === plan.id)}));
  }
  @Post()
  async create(@CurrentUser() user: AuthUser, @Param('studentId') studentId: string, @Body() body: Record<string, unknown>) {
    await this.canWrite(user, studentId);
    const input = planInput(body), id = randomUUID();
    const rows = await this.prisma.$queryRaw<Plan[]>`INSERT INTO "memorization_plans" ("id", "studentId", "createdById", "title", "unit", "period", "target", "dueAt", "scope") VALUES (${id}, ${studentId}, ${user.id}, ${input.title}, ${input.unit}, ${input.period}, ${input.target}, ${input.dueAt}, ${input.scope ? JSON.stringify(input.scope) : null}::jsonb) RETURNING *`;
    return rows[0];
  }
  @Patch(':id')
  async update(@CurrentUser() user: AuthUser, @Param('studentId') studentId: string, @Param('id') id: string, @Body() body: Record<string, unknown>) {
    await this.canWrite(user, studentId);
    const input = planInput(body);
    if (body.archived !== undefined && typeof body.archived !== 'boolean') throw new BadRequestException('حالة الأرشفة غير صالحة');
    return this.prisma.$transaction(async tx => {
      const [plan] = await tx.$queryRaw<Plan[]>`SELECT * FROM "memorization_plans" WHERE "id" = ${id} AND "studentId" = ${studentId} FOR UPDATE`;
      if (!plan) throw new NotFoundException('الخطة غير موجودة');
      if (input.target < plan.completed) throw new BadRequestException('الهدف أقل من الإنجاز المسجل');
      if (plan.completed > 0 && input.unit !== plan.unit) throw new BadRequestException('لا يمكن تغيير وحدة القياس بعد تسجيل الإنجاز');
      if (plan.completed > 0 && JSON.stringify(input.scope) !== JSON.stringify(plan.scope)) throw new BadRequestException('لا يمكن تغيير النطاق بعد تسجيل الإنجاز');
      const [updated] = await tx.$queryRaw<Plan[]>`UPDATE "memorization_plans" SET "title" = ${input.title}, "unit" = ${input.unit}, "period" = ${input.period}, "target" = ${input.target}, "dueAt" = ${input.dueAt}, "scope" = ${input.scope ? JSON.stringify(input.scope) : null}::jsonb, "archived" = ${body.archived === undefined ? plan.archived : body.archived as boolean} WHERE "id" = ${id} RETURNING *`;
      return updated;
    });
  }
  @Post(':id/progress')
  async progress(@CurrentUser() user: AuthUser, @Param('studentId') studentId: string, @Param('id') id: string, @Body() body: {amount?: number; itemIds?: number[]; versesCount?: number; note?: string; requestId: string}) {
    await this.canWrite(user, studentId);
    if (!body || typeof body.requestId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(body.requestId) || (body.note !== undefined && (typeof body.note !== 'string' || body.note.length > 500)) || body.versesCount !== undefined && (!Number.isInteger(body.versesCount) || body.versesCount < 0 || body.versesCount > 6236)) throw new BadRequestException('بيانات الإنجاز غير صالحة');
    return this.prisma.$transaction(async tx => {
      const [plan] = await tx.$queryRaw<Plan[]>`SELECT * FROM "memorization_plans" WHERE "id" = ${id} AND "studentId" = ${studentId} FOR UPDATE`;
      if (!plan) throw new NotFoundException('الخطة غير موجودة');
      const existing = await tx.$queryRaw<Array<{id: string}>>`SELECT "id" FROM "memorization_progress" WHERE "id" = ${body.requestId} AND "planId" = ${id} AND "recordedById" = ${user.id}`;
      if (existing.length) return plan;
      const scope = plan.scope as {items?: number[]; surah?: number; from?: number; to?: number} | null;
      const items = body.itemIds ?? [];
      let amount = body.amount;
      if (scope?.items) {
        if (!Array.isArray(items) || !items.length || new Set(items).size !== items.length || items.some(item => !Number.isInteger(item) || !scope.items!.includes(item))) throw new BadRequestException('اختر عناصر من نطاق الخطة فقط');
        const used = await tx.$queryRaw<Array<{itemIds: number[]}>>`SELECT "itemIds" FROM "memorization_progress" WHERE "planId" = ${id}`;
        if (items.some(item => used.some(log => log.itemIds.includes(item)))) throw new BadRequestException('هذا الجزء أو السورة أو الصفحة مسجّل سابقاً');
        amount = items.length;
      }
      if (typeof amount !== 'number' || !Number.isFinite(amount) || amount <= 0 || amount > 1_000_000 || (scope?.surah && !Number.isInteger(amount))) throw new BadRequestException('الكمية المنجزة غير صالحة');
      if (plan.archived || plan.completed + amount > plan.target) throw new BadRequestException('الإنجاز يتجاوز المتبقي أو الخطة مؤرشفة');
      await tx.$executeRaw`INSERT INTO "memorization_progress" ("id", "planId", "recordedById", "amount", "itemIds", "versesCount", "note") VALUES (${body.requestId}, ${id}, ${user.id}, ${amount}, ${items}, ${body.versesCount ?? (plan.unit === 'VERSES' ? amount : 0)}, ${body.note?.trim() || ''})`;
      const [updated] = await tx.$queryRaw<Plan[]>`UPDATE "memorization_plans" SET "completed" = "completed" + ${amount} WHERE "id" = ${id} RETURNING *`;
      return updated;
    });
  }
}
