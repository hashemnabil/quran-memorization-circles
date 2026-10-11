import { Controller, Get, Query, Res } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import type { Response } from 'express';
import { AuthUser, CurrentUser, Roles } from '../common/decorators';
import { ReportsService, ReportType } from './reports.service';

@ApiTags('التقارير')
@ApiBearerAuth()
@Controller('reports')
@Roles(Role.ADMIN, Role.SUPERVISOR, Role.TEACHER)
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Get()
  @ApiOperation({ summary: 'بيانات التقارير حسب صلاحية المستخدم والفلاتر' })
  async getReport(@CurrentUser() user: AuthUser, @Query() query: Record<string, string>) {
    return this.reports.getReport(user, query.type as ReportType, query);
  }

  @Get('export')
  @ApiOperation({ summary: 'تصدير تقرير أو الملف الشامل للطالب إلى XLSX' })
  async export(@CurrentUser() user: AuthUser, @Query() query: Record<string, string>, @Res() res: Response) {
    const { buffer, filename } = await this.reports.exportXlsx(user, query.type as ReportType, query);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(buffer);
  }
}
