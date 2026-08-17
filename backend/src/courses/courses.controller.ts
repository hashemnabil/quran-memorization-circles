import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { Roles } from '../common/decorators';
import { CoursesService } from './courses.service';

@ApiTags('الدورات')
@ApiBearerAuth()
@Controller('courses')
export class CoursesController {
  constructor(private readonly service: CoursesService) {}

  @Get()
  @Roles(Role.ADMIN, Role.SUPERVISOR, Role.TEACHER)
  list(@Query('type') type?: 'SHARIA' | 'TAJWEED') { return this.service.list(type); }

  @Post()
  @Roles(Role.ADMIN)
  create(@Body() body: { name: string; type: 'SHARIA' | 'TAJWEED'; description?: string }) {
    return this.service.createCourse(body.name, body.type, body.description);
  }

  @Post('circles')
  @Roles(Role.ADMIN)
  createCircle(@Body() body: { courseId: string; name: string; code: string; capacity?: number }) {
    return this.service.createCircle(body.courseId, body.name, body.code, body.capacity);
  }

  @Post('enrollments')
  @Roles(Role.ADMIN, Role.SUPERVISOR, Role.TEACHER)
  enroll(@Body() body: { courseCircleId: string; studentId: string }) {
    return this.service.enrollStudent(body.courseCircleId, body.studentId);
  }

  @Post('enrollments/:id/complete')
  @Roles(Role.ADMIN, Role.SUPERVISOR, Role.TEACHER)
  @ApiOperation({ summary: 'إنهاء دورة وترحيلها إلى سجل الطالب' })
  complete(@Param('id') id: string, @Body() body: { note?: string }) {
    return this.service.completeEnrollment(id, body.note);
  }

  @Get('students/:id')
  @Roles(Role.ADMIN, Role.SUPERVISOR, Role.TEACHER)
  studentRecord(@Param('id') id: string) { return this.service.studentRecord(id); }

  @Get('teachers/:id')
  @Roles(Role.ADMIN, Role.SUPERVISOR, Role.TEACHER)
  teacherCourses(@Param('id') id: string) { return this.service.teacherCourses(id); }
}
