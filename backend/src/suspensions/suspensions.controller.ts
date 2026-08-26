import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { AuthUser, CurrentUser, Roles } from '../common/decorators';
import {
  ApproveSuspensionDto,
  CreateSuspensionDto,
  DecideSuspensionDto,
  QuerySuspensionsDto,
  ReturnStudentDto,
} from './dto/suspension.dto';
import { SuspensionsService } from './suspensions.service';

@ApiTags('إيقاف الطلاب')
@ApiBearerAuth()
@Controller('suspensions')
export class SuspensionsController {
  constructor(private readonly service: SuspensionsService) {}

  @Get('active')
  @ApiOperation({ summary: 'قائمة الطلاب الموقوفين حالياً مع المدة المتبقية' })
  active(@CurrentUser() user: AuthUser) {
    return this.service.activeList(user);
  }

  @Get()
  @ApiOperation({ summary: 'قائمة طلبات الإيقاف' })
  findAll(@CurrentUser() user: AuthUser, @Query() query: QuerySuspensionsDto) {
    return this.service.findAll(user, query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'تفاصيل طلب إيقاف' })
  findOne(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.findOne(user, id);
  }

  /**
   * Keyed on the student, for the unified record: the administration knows the
   * child, not the id of the request that suspended them.
   */
  @Post('students/:studentId/return')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'إعادة طالب من برنامج النشاط أو الإيقاف إلى حلقة' })
  returnStudentToCircle(
    @CurrentUser() user: AuthUser,
    @Param('studentId') studentId: string,
    @Body() dto: ReturnStudentDto,
  ) {
    return this.service.returnStudentToCircle(user, studentId, dto);
  }

  @Post()
  @Roles(Role.ADMIN, Role.SUPERVISOR, Role.TEACHER)
  @ApiOperation({ summary: 'طلب إيقاف طالب' })
  request(@CurrentUser() user: AuthUser, @Body() dto: CreateSuspensionDto) {
    return this.service.request(user, dto);
  }

  @Patch(':id/approve')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'الموافقة على طلب الإيقاف' })
  approve(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: ApproveSuspensionDto) {
    return this.service.approve(user, id, dto);
  }

  @Patch(':id/reject')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'رفض طلب الإيقاف' })
  reject(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: DecideSuspensionDto) {
    return this.service.reject(user, id, dto);
  }

  @Patch(':id/return')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'إرجاع الطالب من الإيقاف' })
  returnStudent(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: ReturnStudentDto) {
    return this.service.returnStudent(user, id, dto);
  }

  @Patch(':id/cancel')
  @Roles(Role.ADMIN, Role.SUPERVISOR, Role.TEACHER)
  @ApiOperation({ summary: 'إلغاء طلب إيقاف معلق' })
  cancel(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.cancel(user, id);
  }
}
