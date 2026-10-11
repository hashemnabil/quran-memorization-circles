import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Res } from '@nestjs/common';
import { Response } from 'express';
import * as XLSX from 'xlsx';
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

  @Get('accounts/export')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'تصدير بيانات حسابات الطلاب إلى Excel' })
  async exportStudentAccounts(@Res() response: Response) {
    return this.sendAccountsWorkbook(response, {});
  }

  @Post('accounts/export-with-temporary-passwords')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'تصدير الحسابات مع كلمات المرور المؤقتة المتاحة في جلسة الإدارة الحالية' })
  async exportStudentAccountsWithTemporaryPasswords(@Body() body: { temporaryPasswords?: Record<string, string> }, @Res() response: Response) {
    return this.sendAccountsWorkbook(response, body.temporaryPasswords ?? {});
  }

  private async sendAccountsWorkbook(response: Response, temporaryPasswords: Record<string, string>) {
    const rows = await this.service.listAccounts();
    const worksheet = XLSX.utils.json_to_sheet(rows.map((r) => ({
      'اسم الطالب': r.fullName,
      'رقم هوية الطالب': r.nationalId ?? '',
      'رقم هوية الأب': r.fatherNationalId ?? '',
      'اسم ولي الأمر': r.guardianName ?? '',
      'جوال ولي الأمر': r.guardianPhone ?? '',
      'اسم المستخدم': r.username,
      'حالة الحساب': r.isActive ? 'نشط' : 'موقوف',
      'كلمة المرور المؤقتة': r.mustChangePassword ? (temporaryPasswords[r.id] ?? '') : '',
    })));
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'حسابات الطلاب');
    const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
    response.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
      .setHeader('Content-Disposition', 'attachment; filename="student-accounts.xlsx"')
      .setHeader('Cache-Control', 'no-store').send(buffer);
  }

  @Get('accounts')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'حسابات الطلاب المرتبطة بملفاتهم' })
  listAccounts() { return this.service.listAccounts(); }

  @Post(':id/account')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'إنشاء حساب دخول لطالب مسجل مسبقاً' })
  createAccount(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.createAccountForStudent(user, id);
  }

  @Post(':id/account/reset-password')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'إعادة تعيين كلمة مرور حساب الطالب' })
  resetAccountPassword(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.resetStudentAccountPassword(user, id);
  }

  @Patch(':id/account/active')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'تفعيل أو إيقاف حساب الطالب' })
  setAccountActive(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() body: { isActive: boolean }) {
    return this.service.setStudentAccountActive(user, id, body.isActive === true);
  }


  @Get(':id')
  @Roles(Role.ADMIN, Role.SUPERVISOR, Role.TEACHER)
  @ApiOperation({ summary: 'ملف الطالب الموحّد' })
  findOne(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.findOne(user, id);
  }

  @Get('me/history')
  @Roles(Role.STUDENT)
  @ApiOperation({ summary: 'سجل الحضور والتسميع والاختبارات للطالب الحالي' })
  getMyHistory(@CurrentUser() user: AuthUser) {
    return this.service.getMyHistory(user);
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
  @Roles(Role.ADMIN, Role.SUPERVISOR, Role.TEACHER)
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
    const workbook = XLSX.utils.book_new();
    const worksheet = XLSX.utils.json_to_sheet(rows.map((r) => ({
      'اسم الطالب': r.fullName,
      'رقم الطالب': r.code ?? '',
      'اسم المستخدم (رقم الهوية)': r.username,
      'كلمة المرور المؤقتة': r.temporaryPassword,
    })));
    XLSX.utils.book_append_sheet(workbook, worksheet, 'بيانات دخول الطلاب');
    const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
    response
      .setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
      .setHeader('Content-Disposition', 'attachment; filename="student-login-credentials.xlsx"')
      .setHeader('Cache-Control', 'no-store')
      .send(buffer);
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
