import { Body, Controller, Delete, Get, Param, Post } from '@nestjs/common';
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
  list() { return this.service.list(); }

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() body: any) {
    return this.service.create(user, body);
  }

  @Delete(':id')
  remove(@Param('id') id: string) { return this.service.remove(id); }
}
