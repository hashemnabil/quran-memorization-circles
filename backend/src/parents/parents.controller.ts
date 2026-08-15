import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { AuthUser, CurrentUser, Roles } from '../common/decorators';
import { CreateParentDto, LinkStudentDto, QueryParentsDto, UpdateParentDto } from './dto/parent.dto';
import { ParentsService } from './parents.service';

@ApiTags('أولياء الأمور')
@ApiBearerAuth()
@Controller('parents')
export class ParentsController {
  constructor(private readonly service: ParentsService) {}

  @Get('my-children')
  @Roles(Role.PARENT)
  @ApiOperation({ summary: 'أبناء ولي الأمر الحالي مع ملخص حالة كل طالب' })
  myChildren(@CurrentUser() user: AuthUser) {
    return this.service.myChildren(user);
  }

  @Get('my-children/:studentId')
  @Roles(Role.PARENT)
  @ApiOperation({ summary: 'الملف التفصيلي لأحد الأبناء (قراءة فقط)' })
  childDetails(@CurrentUser() user: AuthUser, @Param('studentId') studentId: string) {
    return this.service.childDetails(user, studentId);
  }

  @Get('options')
  @Roles(Role.ADMIN, Role.SUPERVISOR)
  @ApiOperation({ summary: 'قائمة مختصرة بأولياء الأمور' })
  options(@Query('search') search?: string) {
    return this.service.options(search);
  }

  @Get()
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'قائمة أولياء الأمور' })
  findAll(@Query() query: QueryParentsDto) {
    return this.service.findAll(query);
  }

  @Get(':id')
  @Roles(Role.ADMIN, Role.SUPERVISOR)
  @ApiOperation({ summary: 'تفاصيل ولي أمر' })
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Post()
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'إضافة ولي أمر مع حساب دخول' })
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateParentDto) {
    return this.service.create(user, dto);
  }

  @Patch(':id')
  @Roles(Role.ADMIN, Role.PARENT)
  @ApiOperation({ summary: 'تعديل بيانات ولي أمر' })
  update(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpdateParentDto) {
    return this.service.update(user, id, dto);
  }

  @Patch(':id/students')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'ربط الأبناء بولي الأمر' })
  linkStudents(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: LinkStudentDto) {
    return this.service.linkStudents(user, id, dto);
  }

  @Delete(':id')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'حذف ولي أمر (حذف ناعم)' })
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.remove(user, id);
  }
}
