import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { AuthUser, CurrentUser, Roles } from '../common/decorators';
import {
  AddNoteDto,
  CreateStudentDto,
  QueryStudentsDto,
  SetEvaluationDto,
  UpdateStudentDto,
} from './dto/student.dto';
import { StudentsService } from './students.service';

@ApiTags('الطلاب')
@ApiBearerAuth()
@Controller('students')
export class StudentsController {
  constructor(private readonly service: StudentsService) {}

  @Get()
  @ApiOperation({ summary: 'قائمة الطلاب (محدودة بصلاحية المستخدم)' })
  findAll(@CurrentUser() user: AuthUser, @Query() query: QueryStudentsDto) {
    return this.service.findAll(user, query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'ملف الطالب' })
  findOne(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.findOne(user, id);
  }

  @Get(':id/history')
  @ApiOperation({ summary: 'السجل الكامل للطالب' })
  history(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.history(user, id);
  }

  @Get(':id/evaluations')
  @ApiOperation({ summary: 'سجل التقييمات' })
  evaluations(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.evaluationHistory(user, id);
  }

  @Get(':id/notes')
  @ApiOperation({ summary: 'ملاحظات الطالب' })
  notes(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.listNotes(user, id);
  }

  @Post()
  @Roles(Role.ADMIN, Role.SUPERVISOR)
  @ApiOperation({ summary: 'تسجيل طالب جديد' })
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateStudentDto) {
    return this.service.create(user, dto);
  }

  @Patch(':id')
  @Roles(Role.ADMIN, Role.SUPERVISOR, Role.TEACHER)
  @ApiOperation({ summary: 'تعديل بيانات طالب' })
  update(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpdateStudentDto) {
    return this.service.update(user, id, dto);
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
