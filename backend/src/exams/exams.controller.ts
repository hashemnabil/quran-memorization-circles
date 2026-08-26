import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { AuthUser, CurrentUser, Roles } from '../common/decorators';
import {
  CreateExamRequestDto,
  CreateSectionDto,
  QueryExamRequestsDto,
  QueryExamsDto,
  RecordResultDto,
  ReviewExamRequestDto,
  ScheduleExamDto,
  UpdateExamDto,
} from './dto/exam.dto';
import { ExamsService } from './exams.service';

@ApiTags('الاختبارات')
@ApiBearerAuth()
@Controller('exams')
export class ExamsController {
  constructor(private readonly service: ExamsService) {}

  // --- reference ----------------------------------------------------------

  @Get('sections')
  @ApiOperation({ summary: 'مقررات الاختبار (الأجزاء) بالترتيب الإلزامي' })
  sections() {
    return this.service.sections();
  }

  @Post('sections')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'إضافة مقرر اختبار' })
  createSection(@CurrentUser() user: AuthUser, @Body() dto: CreateSectionDto) {
    return this.service.createSection(user, dto);
  }

  @Get('examiners')
  @Roles(Role.ADMIN, Role.EXAM_COMMITTEE)
  @ApiOperation({ summary: 'قائمة الممتحنين المتاحين' })
  examiners() {
    return this.service.examiners();
  }

  @Get('stats')
  @ApiOperation({ summary: 'إحصائيات الاختبارات' })
  stats(@CurrentUser() user: AuthUser) {
    return this.service.stats(user);
  }

  @Get('upcoming')
  @ApiOperation({ summary: 'الاختبارات القادمة' })
  upcoming(@CurrentUser() user: AuthUser, @Query('days') days?: string) {
    return this.service.upcoming(user, days ? parseInt(days, 10) : 30);
  }

  @Get('eligibility/:studentId')
  @ApiOperation({ summary: 'أهلية الطالب للاختبار وتسلسل المقررات' })
  eligibility(@CurrentUser() user: AuthUser, @Param('studentId') studentId: string) {
    return this.service.eligibility(user, studentId);
  }

  // --- requests -----------------------------------------------------------

  @Get('requests')
  @ApiOperation({ summary: 'قائمة انتظار طلبات الاختبار' })
  findRequests(@CurrentUser() user: AuthUser, @Query() query: QueryExamRequestsDto) {
    return this.service.findRequests(user, query);
  }

  @Get('requests/:id')
  @ApiOperation({ summary: 'تفاصيل طلب اختبار' })
  findRequest(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.findRequest(user, id);
  }

  @Post('requests')
  @Roles(Role.ADMIN, Role.SUPERVISOR, Role.TEACHER)
  @ApiOperation({ summary: 'تقديم طلب اختبار لطالب' })
  requestExam(@CurrentUser() user: AuthUser, @Body() dto: CreateExamRequestDto) {
    return this.service.requestExam(user, dto);
  }

  @Patch('requests/:id/reject')
  @Roles(Role.ADMIN, Role.EXAM_COMMITTEE)
  @ApiOperation({ summary: 'رفض طلب اختبار' })
  rejectRequest(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: ReviewExamRequestDto) {
    return this.service.rejectRequest(user, id, dto);
  }

  @Patch('requests/:id/cancel')
  @Roles(Role.ADMIN, Role.EXAM_COMMITTEE, Role.TEACHER, Role.SUPERVISOR)
  @ApiOperation({ summary: 'إلغاء طلب اختبار' })
  cancelRequest(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.cancelRequest(user, id);
  }

  @Post('requests/:id/schedule')
  @Roles(Role.ADMIN, Role.EXAM_COMMITTEE)
  @ApiOperation({ summary: 'جدولة اختبار من قائمة الانتظار' })
  schedule(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: ScheduleExamDto) {
    return this.service.scheduleExam(user, id, dto);
  }

  // --- exams --------------------------------------------------------------

  @Get()
  @ApiOperation({ summary: 'قائمة الاختبارات' })
  findExams(@CurrentUser() user: AuthUser, @Query() query: QueryExamsDto) {
    return this.service.findExams(user, query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'تفاصيل اختبار' })
  findExam(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.findExam(user, id);
  }

  @Patch(':id')
  @Roles(Role.ADMIN, Role.EXAM_COMMITTEE)
  @ApiOperation({ summary: 'تعديل موعد أو ممتحن الاختبار' })
  updateExam(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpdateExamDto) {
    return this.service.updateExam(user, id, dto);
  }

  @Patch(':id/result')
  @Roles(Role.ADMIN, Role.EXAM_COMMITTEE)
  @ApiOperation({ summary: 'رصد نتيجة الاختبار' })
  recordResult(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: RecordResultDto) {
    return this.service.recordResult(user, id, dto);
  }

  @Patch(':id/absent')
  @Roles(Role.ADMIN, Role.EXAM_COMMITTEE)
  @ApiOperation({ summary: 'تسجيل غياب الطالب عن الاختبار' })
  markAbsent(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.markAbsent(user, id);
  }
}
