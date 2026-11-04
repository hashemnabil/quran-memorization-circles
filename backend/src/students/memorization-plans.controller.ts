import { BadRequestException, Body, Controller, ForbiddenException, Get, NotFoundException, Param, Patch, Post } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { Role } from '@prisma/client';
import { AuthUser, CurrentUser } from '../common/decorators';
import { AccessControlService } from '../common/services/access-control.service';
import { PrismaService } from '../prisma/prisma.service';

type Plan = {id: string; studentId: string; title: string; period: string; unit: string; target: number; completed: number; dueAt: Date | null; archived: boolean; createdAt: Date};
const UNITS = ['VERSES', 'PAGES', 'SURAHS', 'JUZ', 'TASKS'];
const PERIODS = ['WEEKLY', 'MONTHLY', 'GOAL'];
function planInput(body: Record<string, unknown>) {
  if (!body || typeof body.title !== 'string' || !body.title.trim() || body.title.length > 160 || !UNITS.includes(String(body.unit)) || !PERIODS.includes(String(body.period)) || typeof body.target !== 'number' || !Number.isFinite(body.target) || body.target <= 0 || body.target > 1_000_000) throw new BadRequestException('أدخل عنوانًا وهدفًا ووحدة ومدة صالحة');
  const dueAt = body.dueAt ? new Date(String(body.dueAt)) : null;
  if (dueAt && !Number.isFinite(dueAt.getTime())) throw new BadRequestException('تاريخ نهاية الخطة غير صالح');
  return {title: body.title.trim(), unit: String(body.unit), period: String(body.period), target: body.target, dueAt};
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
    const logs = await this.prisma.$queryRaw<Array<{id: string; planId: string; amount: number; note: string; createdAt: Date; recorderName: string}>>`SELECT p."id", p."planId", p."amount", p."note", p."createdAt", u."fullName" AS "recorderName" FROM "memorization_progress" p JOIN "memorization_plans" m ON m."id" = p."planId" JOIN "users" u ON u."id" = p."recordedById" WHERE m."studentId" = ${studentId} ORDER BY p."createdAt" DESC LIMIT 500`;
    return plans.map(plan => ({...plan, logs: logs.filter(log => log.planId === plan.id)}));
  }
  @Post()
  async create(@CurrentUser() user: AuthUser, @Param('studentId') studentId: string, @Body() body: Record<string, unknown>) {
    await this.canWrite(user, studentId);
    const input = planInput(body), id = randomUUID();
    const rows = await this.prisma.$queryRaw<Plan[]>`INSERT INTO "memorization_plans" ("id", "studentId", "createdById", "title", "unit", "period", "target", "dueAt") VALUES (${id}, ${studentId}, ${user.id}, ${input.title}, ${input.unit}, ${input.period}, ${input.target}, ${input.dueAt}) RETURNING *`;
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
      const [updated] = await tx.$queryRaw<Plan[]>`UPDATE "memorization_plans" SET "title" = ${input.title}, "unit" = ${input.unit}, "period" = ${input.period}, "target" = ${input.target}, "dueAt" = ${input.dueAt}, "archived" = ${body.archived === undefined ? plan.archived : body.archived as boolean} WHERE "id" = ${id} RETURNING *`;
      return updated;
    });
  }
  @Post(':id/progress')
  async progress(@CurrentUser() user: AuthUser, @Param('studentId') studentId: string, @Param('id') id: string, @Body() body: {amount: number; note?: string; requestId: string}) {
    await this.canWrite(user, studentId);
    if (!body || typeof body.amount !== 'number' || !Number.isFinite(body.amount) || body.amount <= 0 || typeof body.requestId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(body.requestId) || (body.note !== undefined && (typeof body.note !== 'string' || body.note.length > 500))) throw new BadRequestException('بيانات الإنجاز غير صالحة');
    return this.prisma.$transaction(async tx => {
      const [plan] = await tx.$queryRaw<Plan[]>`SELECT * FROM "memorization_plans" WHERE "id" = ${id} AND "studentId" = ${studentId} FOR UPDATE`;
      if (!plan) throw new NotFoundException('الخطة غير موجودة');
      const existing = await tx.$queryRaw<Array<{id: string}>>`SELECT "id" FROM "memorization_progress" WHERE "id" = ${body.requestId} AND "planId" = ${id} AND "recordedById" = ${user.id}`;
      if (existing.length) return plan;
      if (plan.archived || plan.completed + body.amount > plan.target) throw new BadRequestException('الإنجاز يتجاوز المتبقي أو الخطة مؤرشفة');
      await tx.$executeRaw`INSERT INTO "memorization_progress" ("id", "planId", "recordedById", "amount", "note") VALUES (${body.requestId}, ${id}, ${user.id}, ${body.amount}, ${body.note?.trim() || ''})`;
      const [updated] = await tx.$queryRaw<Plan[]>`UPDATE "memorization_plans" SET "completed" = "completed" + ${body.amount} WHERE "id" = ${id} RETURNING *`;
      return updated;
    });
  }
}
