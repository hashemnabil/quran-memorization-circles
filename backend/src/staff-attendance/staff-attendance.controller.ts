import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { AuthUser, CurrentUser, Roles } from '../common/decorators';
import { StaffAttendanceService } from './staff-attendance.service';
import {
  QueryStaffAttendanceDto,
  RecordStaffAttendanceDto,
  StaffSheetQueryDto,
} from './dto/staff-attendance.dto';

@ApiTags('حضور الكادر')
@ApiBearerAuth()
@Controller('staff-attendance')
@Roles(Role.ADMIN, Role.SUPERVISOR)
export class StaffAttendanceController {
  constructor(private readonly service: StaffAttendanceService) {}

  @Get('sheet')
  @ApiOperation({ summary: 'كشف حضور الكادر في تاريخ محدد' })
  sheet(@Query() query: StaffSheetQueryDto) {
    return this.service.sheet(query);
  }

  @Get('history')
  @ApiOperation({ summary: 'سجل حضور الكادر مرتّباً حسب التاريخ' })
  history(@Query() query: QueryStaffAttendanceDto) {
    return this.service.history(query);
  }

  @Get('summary')
  @ApiOperation({ summary: 'ملخص حضور كل موظف' })
  summary(
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('role') role?: Role,
  ) {
    return this.service.summary(from, to, role);
  }

  @Get('history/:date')
  @ApiOperation({ summary: 'تفاصيل حضور الكادر في يوم محدد' })
  detail(@Param('date') date: string) {
    return this.service.detail(date);
  }

  @Get()
  @ApiOperation({ summary: 'سجلات حضور الكادر' })
  findAll(@Query() query: QueryStaffAttendanceDto) {
    return this.service.findAll(query);
  }

  @Post()
  @ApiOperation({ summary: 'تسجيل حضور الكادر' })
  record(@CurrentUser() user: AuthUser, @Body() dto: RecordStaffAttendanceDto) {
    return this.service.record(user, dto);
  }
}
