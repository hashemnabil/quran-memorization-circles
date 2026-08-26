import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
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
