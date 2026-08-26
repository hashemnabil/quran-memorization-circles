import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { AuthUser, CurrentUser, Roles } from '../common/decorators';
import { CoursesService } from './courses.service';
import {
  BulkCourseIdsDto,
  CourseAttendanceQueryDto,
  CreateCourseDto,
  EnrollStudentsDto,
  QueryCoursesDto,
  RecordCourseAttendanceDto,
  UpdateCourseDto,
} from './dto/course.dto';

@ApiTags('الدورات التعليمية')
@ApiBearerAuth()
@Controller('courses')
export class CoursesController {
  constructor(private readonly service: CoursesService) {}

  @Get('stats')
  @Roles(Role.ADMIN, Role.SUPERVISOR)
  @ApiOperation({ summary: 'إحصائيات الدورات' })
  stats() {
    return this.service.stats();
  }

  @Get()
  @Roles(Role.ADMIN, Role.SUPERVISOR, Role.TEACHER)
  @ApiOperation({ summary: 'قائمة الدورات' })
  findAll(@Query() query: QueryCoursesDto) {
    return this.service.findAll(query);
  }

  @Get(':id')
  @Roles(Role.ADMIN, Role.SUPERVISOR, Role.TEACHER)
  @ApiOperation({ summary: 'تفاصيل دورة' })
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Post()
  @Roles(Role.ADMIN, Role.SUPERVISOR)
  @ApiOperation({ summary: 'إنشاء دورة' })
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateCourseDto) {
    return this.service.create(user, dto);
  }

  @Post('bulk-delete')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'حذف عدة دورات دفعة واحدة' })
  removeMany(@CurrentUser() user: AuthUser, @Body() dto: BulkCourseIdsDto) {
    return this.service.removeMany(user, dto);
  }

  @Patch(':id')
  @Roles(Role.ADMIN, Role.SUPERVISOR)
  @ApiOperation({ summary: 'تعديل دورة' })
  update(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpdateCourseDto) {
    return this.service.update(user, id, dto);
  }

  @Delete(':id')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'حذف دورة' })
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.remove(user, id);
  }

  // --- enrolment -----------------------------------------------------------

  @Post(':id/students')
  @Roles(Role.ADMIN, Role.SUPERVISOR)
  @ApiOperation({ summary: 'تسجيل طلاب في الدورة' })
  enroll(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: EnrollStudentsDto) {
    return this.service.enroll(user, id, dto);
  }

  @Delete(':id/students/:studentId')
  @Roles(Role.ADMIN, Role.SUPERVISOR)
  @ApiOperation({ summary: 'إنهاء تسجيل طالب في الدورة' })
  unenroll(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Param('studentId') studentId: string,
  ) {
    return this.service.unenroll(user, id, studentId);
  }

  // --- attendance ----------------------------------------------------------

  @Get(':id/attendance/sheet')
  @Roles(Role.ADMIN, Role.SUPERVISOR, Role.TEACHER)
  @ApiOperation({ summary: 'كشف حضور الدورة في تاريخ محدد' })
  attendanceSheet(@Param('id') id: string, @Query() query: CourseAttendanceQueryDto) {
    return this.service.attendanceSheet(id, query);
  }

  @Get(':id/attendance/history')
  @Roles(Role.ADMIN, Role.SUPERVISOR, Role.TEACHER)
  @ApiOperation({ summary: 'سجل حضور الدورة مرتّباً حسب التاريخ' })
  attendanceHistory(@Param('id') id: string) {
    return this.service.attendanceHistory(id);
  }

  @Get(':id/attendance/:date')
  @Roles(Role.ADMIN, Role.SUPERVISOR, Role.TEACHER)
  @ApiOperation({ summary: 'تفاصيل حضور الدورة في يوم محدد' })
  attendanceDetail(@Param('id') id: string, @Param('date') date: string) {
    return this.service.attendanceDetail(id, date);
  }

  @Post(':id/attendance')
  @Roles(Role.ADMIN, Role.SUPERVISOR, Role.TEACHER)
  @ApiOperation({ summary: 'تسجيل حضور الدورة' })
  recordAttendance(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: RecordCourseAttendanceDto,
  ) {
    return this.service.recordAttendance(user, id, dto);
  }
}
