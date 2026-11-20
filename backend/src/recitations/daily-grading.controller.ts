import { BadRequestException, Body, Controller, Get, Param, Patch } from '@nestjs/common';
import { Role } from '@prisma/client';
import { AuthUser, CurrentUser, Roles } from '../common/decorators';
import { AccessControlService } from '../common/services/access-control.service';
import { PrismaService } from '../prisma/prisma.service';

@Controller('recitations')
export class DailyRecitationGradingController {
  constructor(private readonly prisma: PrismaService, private readonly acl: AccessControlService) {}

  @Get('grading-settings')
  @Roles(Role.ADMIN, Role.SUPERVISOR, Role.TEACHER)
  async settings() {
    const rows = await this.prisma.$queryRaw<Array<{ mistakePenalty: number; warningPenalty: number; tajweedPenalty: number }>>`
      SELECT "mistakePenalty", "warningPenalty", "tajweedPenalty"
      FROM "daily_recitation_grading_settings" WHERE "id" = 'default'
    `;
    return rows[0] ?? { mistakePenalty: 1, warningPenalty: 0.25, tajweedPenalty: 1 };
  }

  @Patch('grading-settings')
  @Roles(Role.ADMIN)
  async updateSettings(@Body() body: { mistakePenalty: number; warningPenalty: number; tajweedPenalty: number }) {
    const values = [body?.mistakePenalty, body?.warningPenalty, body?.tajweedPenalty];
    if (values.some(value => typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 100)) {
      throw new BadRequestException('يجب أن يكون الخصم لكل خطأ أو تنبيه أو حكم بين 0 و100');
    }
    const rows = await this.prisma.$queryRaw<Array<{ mistakePenalty: number; warningPenalty: number; tajweedPenalty: number }>>`
      INSERT INTO "daily_recitation_grading_settings" ("id", "mistakePenalty", "warningPenalty", "tajweedPenalty", "updatedAt")
      VALUES ('default', ${body.mistakePenalty}, ${body.warningPenalty}, ${body.tajweedPenalty}, NOW())
      ON CONFLICT ("id") DO UPDATE SET
        "mistakePenalty" = EXCLUDED."mistakePenalty",
        "warningPenalty" = EXCLUDED."warningPenalty",
        "tajweedPenalty" = EXCLUDED."tajweedPenalty",
        "updatedAt" = NOW()
      RETURNING "mistakePenalty", "warningPenalty", "tajweedPenalty"
    `;
    return rows[0];
  }

  @Patch(':id/tajweed')
  @Roles(Role.ADMIN, Role.SUPERVISOR, Role.TEACHER)
  async setTajweed(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body('count') count: number) {
    if (!Number.isInteger(count) || count < 0 || count > 9999) throw new BadRequestException('عدد الأحكام غير صالح');
    const row = await this.prisma.recitation.findFirst({ where: { id, deletedAt: null }, select: { studentId: true, teacherId: true } });
    if (!row) throw new BadRequestException('سجل التسميع غير موجود');
    await this.acl.assertStudentWriteAccess(user, row.studentId);
    if (user.role === Role.TEACHER && row.teacherId !== user.teacherId) throw new BadRequestException('يمكن تعديل أحكام تسميعك المسجل فقط');
    await this.prisma.$executeRaw`UPDATE "recitations" SET "tajweed" = ${count} WHERE "id" = ${id}`;
    const updated = await this.prisma.$queryRaw<Array<{ id: string; tajweed: number; points: number; evaluation: string }>>`
      SELECT "id", "tajweed", "points", "evaluation"::text AS "evaluation"
      FROM "recitations" WHERE "id" = ${id}
    `;
    return updated[0];
  }
}
