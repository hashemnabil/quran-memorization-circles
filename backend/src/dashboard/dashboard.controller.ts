import {IsOptional,IsIn,IsUUID} from 'class-validator';
import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { AuthUser, CurrentUser, Roles } from '../common/decorators';
import { DashboardService } from './dashboard.service';
import { PaginationDto } from '../common/dto/pagination.dto';

class RankingQueryDto { @IsOptional() @IsUUID('4') circleId?:string; @IsOptional() @IsIn(['all','week','month']) period?:string; }

class ActivityQueryDto extends PaginationDto { limit = 200; }

@ApiTags('لوحة المعلومات')
@ApiBearerAuth()
@Controller('dashboard')
export class DashboardController {
  constructor(private readonly service: DashboardService) {}

  @Get('honor-roll')
  @ApiOperation({ summary: 'أعلى عشرة طلاب بالنقاط من جميع الحلقات' })
  honorRoll(@Query() query: RankingQueryDto) {
    return this.service.honorRoll(query);
  }

  @Get('student-ranking')
  @ApiOperation({ summary: 'ترتيب جميع الطلاب بالنقاط من الأول إلى الأخير' })
  studentRanking(@Query() query: RankingQueryDto) {
    return this.service.studentRanking(query);
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
