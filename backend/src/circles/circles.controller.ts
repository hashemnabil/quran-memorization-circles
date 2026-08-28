import { Body, Controller, Delete, ForbiddenException, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { AuthUser, CurrentUser, Roles } from '../common/decorators';
import { CirclesService } from './circles.service';
import {
  AssignTeacherDto,
  CreateCircleDto,
  QueryCirclesDto,
  SetSupervisorDto,
  UpdateCircleDto,
} from './dto/circle.dto';

@ApiTags('الحلقات')
@ApiBearerAuth()
@Controller('circles')
export class CirclesController {
  constructor(private readonly service: CirclesService) {}

  @Get('options')
  @ApiOperation({ summary: 'قائمة مختصرة بالحلقات المتاحة للمستخدم' })
  options(@CurrentUser() user: AuthUser) {
    return this.service.options(user);
  }

  @Get()
  @Roles(Role.ADMIN, Role.SUPERVISOR, Role.TEACHER)
  @ApiOperation({ summary: 'قائمة الحلقات' })
  findAll(@CurrentUser() user: AuthUser, @Query() query: QueryCirclesDto) {
    return this.service.findAll(user, query);
  }

  @Get(':id')
  @Roles(Role.ADMIN, Role.SUPERVISOR, Role.TEACHER)
  @ApiOperation({ summary: 'تفاصيل حلقة' })
  findOne(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.findOne(user, id);
  }

  @Get(':id/history')
  @Roles(Role.ADMIN, Role.SUPERVISOR, Role.TEACHER)
  @ApiOperation({ summary: 'سجل حركة المعلمين والطلاب في الحلقة' })
  history(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.history(user, id);
  }

  @Post()
  @Roles(Role.ADMIN, Role.SUPERVISOR)
  @ApiOperation({ summary: 'إنشاء حلقة' })
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateCircleDto) {
    if (user.role === Role.SUPERVISOR) {
      if (!user.teacherId) {
        throw new ForbiddenException('حساب المشرف غير مرتبط بملف محفظ');
      }
      // The DB trigger creates the same supervisor as the primary teacher.
      return this.service.create(user, { ...dto, supervisorId: user.id, primaryTeacherId: undefined });
    }
    return this.service.create(user, dto);
  }

  @Patch(':id')
  @Roles(Role.ADMIN, Role.SUPERVISOR)
  @ApiOperation({ summary: 'تعديل حلقة' })
  update(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpdateCircleDto) {
    return this.service.update(user, id, dto);
  }

  @Patch(':id/supervisor')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'تعيين / إزالة مشرف الحلقة' })
  setSupervisor(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: SetSupervisorDto) {
    return this.service.setSupervisor(user, id, dto);
  }

  @Patch(':id/primary-teacher')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'تعيين المعلم الأساسي للحلقة' })
  setPrimary(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: AssignTeacherDto) {
    return this.service.setPrimaryTeacher(user, id, dto);
  }

  @Post(':id/assistants')
  @Roles(Role.ADMIN, Role.SUPERVISOR)
  @ApiOperation({ summary: 'إضافة معلم مساعد' })
  addAssistant(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: AssignTeacherDto) {
    return this.service.addAssistant(user, id, dto);
  }

  @Delete(':id/teachers/:teacherId')
  @Roles(Role.ADMIN, Role.SUPERVISOR)
  @ApiOperation({ summary: 'إزالة معلم من الحلقة' })
  removeTeacher(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Param('teacherId') teacherId: string,
  ) {
    return this.service.removeTeacher(user, id, teacherId);
  }

  @Delete(':id')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'حذف حلقة (حذف ناعم)' })
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.remove(user, id);
  }
}
