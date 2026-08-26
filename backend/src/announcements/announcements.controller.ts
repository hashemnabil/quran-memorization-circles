import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { AuthUser, CurrentUser, Roles } from '../common/decorators';
import { AnnouncementsService } from './announcements.service';
import {
  CreateAnnouncementDto,
  QueryAnnouncementsDto,
  UpdateAnnouncementDto,
} from './dto/announcement.dto';

@ApiTags('الإعلانات')
@ApiBearerAuth()
@Controller('announcements')
export class AnnouncementsController {
  constructor(private readonly service: AnnouncementsService) {}

  /** Every signed-in user reads their own bar; only admins manage the list. */
  @Get('active')
  @ApiOperation({ summary: 'الإعلانات المعروضة للمستخدم الحالي' })
  active(@CurrentUser() user: AuthUser) {
    return this.service.active(user);
  }

  @Get()
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'إدارة الإعلانات' })
  findAll(@Query() query: QueryAnnouncementsDto) {
    return this.service.findAll(query);
  }

  @Post()
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'نشر إعلان جديد' })
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateAnnouncementDto) {
    return this.service.create(user, dto);
  }

  @Patch(':id')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'تعديل إعلان' })
  update(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateAnnouncementDto,
  ) {
    return this.service.update(user, id, dto);
  }

  @Delete(':id')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'حذف إعلان' })
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.remove(user, id);
  }
}
