import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { AuthUser, CurrentUser, Roles } from '../common/decorators';
import { AttendanceService } from './attendance.service';
import {
  AttendanceSheetQueryDto,
  QueryAttendanceDto,
  RecordAttendanceDto,
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
}
