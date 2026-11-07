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
