import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { AuthUser, CurrentUser, Roles } from '../common/decorators';
import { AttendanceService } from './attendance.service';
import {
  AttendanceSheetQueryDto,
  QueryAttendanceDto,
  RecordAttendanceDto,
  UpdateAttendanceEntryDto,
} from './dto/attendance.dto';

@ApiTags('الحضور والغياب')
@ApiBearerAuth()
@Controller('attendance')
@Roles(Role.ADMIN, Role.SUPERVISOR, Role.TEACHER, Role.STUDENT, Role.PARENT)
export class AttendanceController {
  constructor(private readonly service: AttendanceService) {}

  @Get('offline-bundle')
  @Roles(Role.ADMIN, Role.SUPERVISOR, Role.TEACHER)
  @ApiOperation({ summary: 'حزمة أولية محدودة الصلاحيات للاستخدام دون إنترنت في الحضور' })
  offlineBundle(
    @CurrentUser() user: AuthUser,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string,
  ) {
    return this.service.offlineBundle(user, cursor, limit === undefined ? 500 : Number(limit));
  }

  @Get('sheet')
  @Roles(Role.ADMIN, Role.SUPERVISOR, Role.TEACHER)
  @ApiOperation({ summary: 'كشف حضور حلقة في تاريخ محدد' })
  sheet(@CurrentUser() user: AuthUser, @Query() query: AttendanceSheetQueryDto) {
    return this.service.sheet(user, query);
  }

  @Get('history')
  @Roles(Role.ADMIN, Role.SUPERVISOR, Role.TEACHER)
  @ApiOperation({ summary: 'سجل الحضور مرتّباً حسب التاريخ ثم الحلقة' })
  history(@CurrentUser() user: AuthUser, @Query() query: QueryAttendanceDto) {
    return this.service.history(user, query);
  }

  @Get('history/:date/:circleId')
  @Roles(Role.ADMIN, Role.SUPERVISOR, Role.TEACHER)
  @ApiOperation({ summary: 'تفاصيل حضور طلاب حلقة في يوم محدد' })
  historyDetail(
    @CurrentUser() user: AuthUser,
    @Param('date') date: string,
    @Param('circleId') circleId: string,
  ) {
    return this.service.historyDetail(user, date, circleId);
  }

  @Get('stats')
  @ApiOperation({ summary: 'إحصائيات الحضور' })
  stats(@CurrentUser() user: AuthUser, @Query() query: QueryAttendanceDto) {
    return this.service.stats(user, query);
  }

  @Get('circle/:circleId/summary')
  @Roles(Role.ADMIN, Role.SUPERVISOR, Role.TEACHER)
  @ApiOperation({ summary: 'ملخص حضور طلاب حلقة' })
  circleSummary(
    @CurrentUser() user: AuthUser,
    @Param('circleId') circleId: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.service.circleSummary(user, circleId, from, to);
  }

  @Get()
  @ApiOperation({ summary: 'سجل الحضور' })
  findAll(@CurrentUser() user: AuthUser, @Query() query: QueryAttendanceDto) {
    return this.service.findAll(user, query);
  }

  @Post()
  @Roles(Role.ADMIN, Role.SUPERVISOR, Role.TEACHER)
  @ApiOperation({ summary: 'تسجيل حضور حلقة (إنشاء أو تحديث)' })
  record(@CurrentUser() user: AuthUser, @Body() dto: RecordAttendanceDto) {
    return this.service.record(user, dto);
  }

  @Get('absence-permissions')
  @Roles(Role.ADMIN, Role.SUPERVISOR, Role.TEACHER, Role.STUDENT)
  absencePermissions(@CurrentUser() user: AuthUser) { return this.service.absencePermissions(user); }

  @Post('absence-permissions')
  @Roles(Role.SUPERVISOR, Role.TEACHER, Role.STUDENT)
  createAbsencePermission(@CurrentUser() user: AuthUser, @Body() body: { studentId: string; date: string; reason: string }) {
    return this.service.createAbsencePermission(user, body);
  }

  @Patch('absence-permissions/:id/approve')
  @Roles(Role.ADMIN)
  approveAbsencePermission(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() body: { decisionNote?: string }) {
    return this.service.decideAbsencePermission(user, id, true, body?.decisionNote);
  }

  @Patch('absence-permissions/:id/reject')
  @Roles(Role.ADMIN)
  rejectAbsencePermission(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() body: { decisionNote?: string }) {
    return this.service.decideAbsencePermission(user, id, false, body?.decisionNote);
  }

  @Get('summons')
  @Roles(Role.ADMIN)
  summons() { return this.service.listSummons(); }

  @Post('summons')
  @Roles(Role.ADMIN)
  createSummons(@CurrentUser() user: AuthUser, @Body() body: { studentId: string; title: string; body: string }) {
    return this.service.createSummons(user, body);
  }

  @Patch(':id')
  @Roles(Role.ADMIN, Role.SUPERVISOR, Role.TEACHER)
  @ApiOperation({ summary: 'تعديل حضور طالب واحد من سجل الحضور' })
  updateRecord(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateAttendanceEntryDto,
  ) {
    return this.service.updateRecord(user, id, dto);
  }
}
