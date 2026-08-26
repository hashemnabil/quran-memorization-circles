import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { AuthUser, CurrentUser, Roles } from '../common/decorators';
import { PreparationsService } from './preparations.service';
import {
  CreatePreparationDto,
  QueryPreparationsDto,
  UpdatePreparationDto,
} from './dto/preparation.dto';

@ApiTags('تكاليف التحضير')
@ApiBearerAuth()
@Controller('preparations')
export class PreparationsController {
  constructor(private readonly service: PreparationsService) {}

  /** Parents read this too — it is how they see what their child owes. */
  @Get()
  @ApiOperation({ summary: 'قائمة تكاليف التحضير' })
  findAll(@CurrentUser() user: AuthUser, @Query() query: QueryPreparationsDto) {
    return this.service.findAll(user, query);
  }

  @Post()
  @Roles(Role.ADMIN, Role.SUPERVISOR, Role.TEACHER)
  @ApiOperation({ summary: 'إنشاء تكليف تحضير' })
  create(@CurrentUser() user: AuthUser, @Body() dto: CreatePreparationDto) {
    return this.service.create(user, dto);
  }

  @Patch(':id')
  @Roles(Role.ADMIN, Role.SUPERVISOR, Role.TEACHER)
  @ApiOperation({ summary: 'تعديل تكليف تحضير' })
  update(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdatePreparationDto,
  ) {
    return this.service.update(user, id, dto);
  }

  @Patch(':id/complete')
  @Roles(Role.ADMIN, Role.SUPERVISOR, Role.TEACHER)
  @ApiOperation({ summary: 'تعليم التحضير كمنجز' })
  complete(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.setCompleted(user, id, true);
  }

  @Patch(':id/reopen')
  @Roles(Role.ADMIN, Role.SUPERVISOR, Role.TEACHER)
  @ApiOperation({ summary: 'إعادة فتح التحضير' })
  reopen(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.setCompleted(user, id, false);
  }

  @Delete(':id')
  @Roles(Role.ADMIN, Role.SUPERVISOR, Role.TEACHER)
  @ApiOperation({ summary: 'حذف تكليف تحضير' })
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.remove(user, id);
  }
}
