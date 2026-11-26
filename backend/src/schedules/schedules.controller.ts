import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { AuthUser, CurrentUser, Roles } from '../common/decorators';
import { SchedulesService } from './schedules.service';

@ApiTags('الجداول الإدارية')
@ApiBearerAuth()
@Controller('schedules')
export class SchedulesController {
  constructor(private readonly schedules: SchedulesService) {}

  @Get('media')
  @Roles(Role.ADMIN)
  media() { return this.schedules.media(); }

  @Post('media')
  @Roles(Role.ADMIN)
  createMedia(@CurrentUser() user: AuthUser, @Body() body: unknown) {
    return this.schedules.createMedia(user, body);
  }

  @Patch('media/:id')
  @Roles(Role.ADMIN)
  updateMedia(@Param('id') id: string, @Body() body: unknown) {
    return this.schedules.updateMedia(id, body);
  }

  @Delete('media/:id')
  @Roles(Role.ADMIN)
  deleteMedia(@Param('id') id: string) { return this.schedules.deleteMedia(id); }

  @Get('duties')
  @Roles(Role.ADMIN, Role.SUPERVISOR, Role.TEACHER)
  duties(@CurrentUser() user: AuthUser) { return this.schedules.duties(user); }

  @Post('duties')
  @Roles(Role.ADMIN)
  createDuty(@CurrentUser() user: AuthUser, @Body() body: unknown) {
    return this.schedules.createDuty(user, body);
  }

  @Patch('duties/:id')
  @Roles(Role.ADMIN)
  updateDuty(@Param('id') id: string, @Body() body: unknown) {
    return this.schedules.updateDuty(id, body);
  }

  @Delete('duties/:id')
  @Roles(Role.ADMIN)
  deleteDuty(@Param('id') id: string) { return this.schedules.deleteDuty(id); }

  @Get('teachers')
  @Roles(Role.ADMIN)
  teachers() { return this.schedules.teachers(); }
}
