import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { AuthUser, CurrentUser, Roles } from '../common/decorators';
import { DashboardService } from './dashboard.service';
import { PaginationDto } from '../common/dto/pagination.dto';

class ActivityQueryDto extends PaginationDto { limit = 200; }

@ApiTags('لوحة المعلومات')
@ApiBearerAuth()
@Controller('dashboard')
export class DashboardController {
  constructor(private readonly service: DashboardService) {}

  @Get('honor-roll')
  @ApiOperation({ summary: 'أعلى عشرة طلاب بالنقاط من جميع الحلقات' })
  honorRoll() {
    return this.service.honorRoll();
  }

  @Get('honor-roll/circles')
  @ApiOperation({ summary: 'الحلقات المتاحة للوحة الشرف حسب صلاحيات المستخدم' })
  honorCircles(@CurrentUser() user: AuthUser) {
    return this.service.honorCircles(user);
  }

  @Get('honor-roll/circle')
  @ApiOperation({ summary: 'لوحة شرف الحلقة حسب صلاحيات المستخدم' })
  circleHonorRoll(@CurrentUser() user: AuthUser, @Query('circleId') circleId?: string) {
    return this.service.circleHonorRoll(user, circleId);
  }

  @Get('student-ranking')
  @ApiOperation({ summary: 'ترتيب جميع الطلاب بالنقاط من الأول إلى الأخير' })
  studentRanking() {
    return this.service.studentRanking();
  }

  @Get('overview')
  @ApiOperation({ summary: 'ملخص لوحة المعلومات حسب دور المستخدم' })
  overview(@CurrentUser() user: AuthUser) {
    return this.service.overview(user);
  }

  @Get('activity')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'سجل النشاط العام' })
  activity(@Query() query: ActivityQueryDto) {
    return this.service.activity(query);
  }
}
