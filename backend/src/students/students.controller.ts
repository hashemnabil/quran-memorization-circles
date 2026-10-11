import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Res } from '@nestjs/common';
import { Response } from 'express';
import ExcelJS from 'exceljs';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { AuthUser, CurrentUser, Roles } from '../common/decorators';
import {
  AddNoteDto,
  BulkStudentIdsDto,
  CreateStudentDto,
  QueryStudentsDto,
  SetEvaluationDto,
  SetStudentPhotoDto,
  SurahCompletionDto,
  UpdateStudentDto,
} from './dto/student.dto';
import { StudentsService } from './students.service';

@ApiTags('الطلاب')
@ApiBearerAuth()
@Controller('students')
export class StudentsController {
  constructor(private readonly service: StudentsService) {}

  @Get()
  @Roles(Role.ADMIN, Role.SUPERVISOR, Role.TEACHER)
  @ApiOperation({ summary: 'قائمة الطلاب (السجل الموحّد، محدودة بصلاحية المستخدم)' })
  findAll(@CurrentUser() user: AuthUser, @Query() query: QueryStudentsDto) {
    return this.service.findAll(user, query);
  }

  @Get('me')
  @Roles(Role.STUDENT)
  @ApiOperation({ summary: 'ملف الطالب الحالي وسجلاته الخاصة' })
  getMyProfile(@CurrentUser() user: AuthUser) {
    return this.service.getMyProfile(user);
  }

  @Get(':id')
  @Roles(Role.ADMIN, Role.SUPERVISOR, Role.TEACHER)
  @ApiOperation({ summary: 'ملف الطالب الموحّد' })
  findOne(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.findOne(user, id);
  }

  @Get(':id/history')
  @Roles(Role.ADMIN, Role.SUPERVISOR, Role.TEACHER)
  @ApiOperation({ summary: 'السجل الكامل للطالب' })
  history(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.history(user, id);
  }

  @Get(':id/evaluations')
  @Roles(Role.ADMIN, Role.SUPERVISOR, Role.TEACHER)
  @ApiOperation({ summary: 'سجل التقييمات' })
  evaluations(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.evaluationHistory(user, id);
  }

  @Get(':id/notes')
  @Roles(Role.ADMIN, Role.SUPERVISOR, Role.TEACHER)
  @ApiOperation({ summary: 'ملاحظات الطالب' })
  notes(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.listNotes(user, id);
  }

  @Post('credentials-export')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'تصدير بيانات دخول الطلاب المنشأة للتو إلى Excel' })
  async exportCredentials(
    @Body() body: { credentials?: { fullName: string; code?: string; username: string; temporaryPassword: string }[] },
    @Res() response: Response,
  ) {
    const rows = body?.credentials ?? [];
    if (!rows.length || rows.length > 500 || rows.some((r) => !r.fullName || !r.username || !r.temporaryPassword)) {
      response.status(400).json({ message: 'بيانات التصدير غير مكتملة أو تتجاوز الحد المسموح' });
      return;
    }
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('بيانات دخول الطلاب');
    sheet.columns = [
      { header: 'اسم الطالب', key: 'fullName', width: 30 },
      { header: 'رقم الطالب', key: 'code', width: 18 },
      { header: 'اسم المستخدم (رقم الهوية)', key: 'username', width: 25 },
      { header: 'كلمة المرور المؤقتة', key: 'temporaryPassword', width: 26 },
    ];
    sheet.addRows(rows.map((r) => ({
      fullName: r.fullName,
      code: r.code ?? '',
      username: r.username,
      temporaryPassword: r.temporaryPassword,
    })));
    sheet.getRow(1).font = { bold: true };
    sheet.views = [{ state: 'frozen', ySplit: 1 }];
    const buffer = await workbook.xlsx.writeBuffer();
    response
      .setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
      .setHeader('Content-Disposition', 'attachment; filename="student-login-credentials.xlsx"')
      .setHeader('Cache-Control', 'no-store')
      .send(Buffer.from(buffer));
  }

  // A teacher may register a student straight into their own circle; the
  // service pins the circle so the role cannot be used to reach another one.
  @Post()
  @Roles(Role.ADMIN, Role.SUPERVISOR, Role.TEACHER)
  @ApiOperation({ summary: 'تسجيل طالب جديد' })
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateStudentDto) {
    return this.service.create(user, dto);
  }

  @Post('bulk-delete')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'حذف عدة طلاب دفعة واحدة' })
  removeMany(@CurrentUser() user: AuthUser, @Body() dto: BulkStudentIdsDto) {
    return this.service.removeMany(user, dto);
  }

  @Post(':id/surahs')
  @Roles(Role.ADMIN, Role.SUPERVISOR, Role.TEACHER)
  @ApiOperation({ summary: 'تسجيل إتمام سورة ومنح نقاطها' })
  completeSurah(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: SurahCompletionDto,
  ) {
    return this.service.completeSurah(user, id, dto);
  }

  @Delete(':id/surahs/:completionId')
  @Roles(Role.ADMIN, Role.SUPERVISOR, Role.TEACHER)
  @ApiOperation({ summary: 'حذف سجل إتمام سورة' })
  removeSurah(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Param('completionId') completionId: string,
  ) {
    return this.service.removeSurahCompletion(user, id, completionId);
  }

  @Patch(':id')
  @Roles(Role.ADMIN, Role.SUPERVISOR, Role.TEACHER)
  @ApiOperation({ summary: 'تعديل بيانات طالب' })
  update(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpdateStudentDto) {
    return this.service.update(user, id, dto);
  }

  /**
   * Open to guardians as well as staff: a father uploading his son's photo from
   * the parent portal is the common case, and `setPhoto` scopes it to his own
   * children.
   */
  @Patch(':id/photo')
  @ApiOperation({ summary: 'تعيين أو إزالة صورة الطالب' })
  setPhoto(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: SetStudentPhotoDto,
  ) {
    return this.service.setPhoto(user, id, dto.photoUrl || null);
  }

  @Patch(':id/evaluation')
  @Roles(Role.ADMIN, Role.SUPERVISOR, Role.TEACHER)
  @ApiOperation({ summary: 'تحديد التقييم اليدوي للطالب' })
  setEvaluation(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: SetEvaluationDto) {
    return this.service.setEvaluation(user, id, dto);
  }

  @Post(':id/notes')
  @Roles(Role.ADMIN, Role.SUPERVISOR, Role.TEACHER)
  @ApiOperation({ summary: 'إضافة ملاحظة على الطالب' })
  addNote(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: AddNoteDto) {
    return this.service.addNote(user, id, dto);
  }

  @Delete(':id/notes/:noteId')
  @Roles(Role.ADMIN, Role.SUPERVISOR, Role.TEACHER)
  @ApiOperation({ summary: 'حذف ملاحظة' })
  removeNote(@CurrentUser() user: AuthUser, @Param('id') id: string, @Param('noteId') noteId: string) {
    return this.service.removeNote(user, id, noteId);
  }

  @Delete(':id')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'حذف طالب (حذف ناعم)' })
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.remove(user, id);
  }
}
