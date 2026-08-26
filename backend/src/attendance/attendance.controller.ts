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
export class AttendanceController {
  constructor(private readonly service: AttendanceService) {}

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
