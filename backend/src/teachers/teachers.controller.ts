import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { AuthUser, CurrentUser, Roles } from '../common/decorators';
import { CreateTeacherDto, QueryTeachersDto, UpdateTeacherDto } from './dto/teacher.dto';
import { TeachersService } from './teachers.service';

@ApiTags('المعلمون')
@ApiBearerAuth()
@Controller('teachers')
export class TeachersController {
  constructor(private readonly service: TeachersService) {}

  @Get('my-overview')
  @Roles(Role.TEACHER)
  @ApiOperation({ summary: 'ملخص لوحة المعلم' })
  myOverview(@CurrentUser() user: AuthUser) {
    return this.service.myOverview(user);
  }

  @Get()
  @Roles(Role.ADMIN, Role.SUPERVISOR, Role.EXAM_COMMITTEE)
  @ApiOperation({ summary: 'قائمة المعلمين' })
  findAll(@CurrentUser() user: AuthUser, @Query() query: QueryTeachersDto) {
    return this.service.findAll(user, query);
  }

  @Get(':id')
  @Roles(Role.ADMIN, Role.SUPERVISOR, Role.TEACHER, Role.EXAM_COMMITTEE)
  @ApiOperation({ summary: 'تفاصيل معلم' })
  findOne(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.findOne(user, id);
  }

  @Post()
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'إضافة معلم (مع إنشاء حساب الدخول)' })
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateTeacherDto) {
    return this.service.create(user, dto);
  }

  @Patch(':id')
  @Roles(Role.ADMIN, Role.TEACHER)
  @ApiOperation({ summary: 'تعديل بيانات معلم' })
  update(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpdateTeacherDto) {
    return this.service.update(user, id, dto);
  }

  @Delete(':id')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'حذف معلم (حذف ناعم)' })
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.remove(user, id);
  }
}
