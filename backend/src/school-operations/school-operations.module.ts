import { Module, Controller, Get, Post, Patch, Delete, Body, Param } from '@nestjs/common';
import { Role } from '@prisma/client';
import { AuthUser, CurrentUser, Roles } from '../common/decorators';
import { SchoolOperationsService } from './school-operations.service';
@Controller('meetings')
@Roles(Role.ADMIN)
class MeetingsController {
  constructor(private readonly service: SchoolOperationsService) {}
  @Get() list(@CurrentUser() user: AuthUser) { return this.service.meetings(user); }
  @Post() create(@CurrentUser() user: AuthUser, @Body() body: unknown) { return this.service.write(user, 'meetings', body); }
  @Patch(':id') update(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() body: unknown) { return this.service.write(user, 'meetings', body, id); }
  @Delete(':id') remove(@CurrentUser() user: AuthUser, @Param('id') id: string) { return this.service.remove(user, 'meetings', id); }
}
@Controller('examCommittees')
class CommitteesController {
  constructor(private readonly service: SchoolOperationsService) {}
  @Get() @Roles(Role.ADMIN, Role.SUPERVISOR, Role.TEACHER, Role.EXAM_COMMITTEE)
  list(@CurrentUser() user: AuthUser) { return this.service.committees(user); }
  @Post() @Roles(Role.ADMIN)
  create(@CurrentUser() user: AuthUser, @Body() body: unknown) { return this.service.write(user, 'examCommittees', body); }
  @Patch(':id') @Roles(Role.ADMIN)
  update(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() body: unknown) { return this.service.write(user, 'examCommittees', body, id); }
  @Delete(':id') @Roles(Role.ADMIN)
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string) { return this.service.remove(user, 'examCommittees', id); }
}
@Module({ controllers: [MeetingsController, CommitteesController], providers: [SchoolOperationsService] })
export class SchoolOperationsModule {}
