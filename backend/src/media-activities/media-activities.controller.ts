import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { AuthUser, CurrentUser, Roles } from '../common/decorators';
import { MediaActivitiesService } from './media-activities.service';

@ApiTags('سجل الإعلام')
@ApiBearerAuth()
@Controller('media-activities')
@Roles(Role.ADMIN, Role.SUPERVISOR)
export class MediaActivitiesController {
  constructor(private readonly service: MediaActivitiesService) {}

  @Get()
  list(@Query('from') from?: string, @Query('to') to?: string) {
    return this.service.list(from, to);
  }

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() body: any) {
    return this.service.create(user, body);
  }

  @Delete(':id')
  remove(@Param('id') id: string) { return this.service.remove(id); }

  @Patch(':id')
  update(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() body: any) {
    return this.service.update(user, id, body);
  }
}
