import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { AuthUser, CurrentUser, Roles } from '../common/decorators';
import {
  CreateRecitationDto,
  QueryRecitationsDto,
  UpdateRecitationDto,
} from './dto/recitation.dto';
import { RecitationsService } from './recitations.service';

@ApiTags('التسميع اليومي')
@ApiBearerAuth()
@Controller('recitations')
export class RecitationsController {
  constructor(private readonly service: RecitationsService) {}

  @Get('surahs')
  @ApiOperation({ summary: 'قائمة سور القرآن الكريم وعدد آياتها' })
  surahs() {
    return this.service.surahs();
  }

  @Get('student/:studentId/progress')
  @ApiOperation({ summary: 'تقدم الطالب في التسميع' })
  progress(@CurrentUser() user: AuthUser, @Param('studentId') studentId: string) {
    return this.service.studentProgress(user, studentId);
  }

  @Get()
  @ApiOperation({ summary: 'سجل التسميع' })
  findAll(@CurrentUser() user: AuthUser, @Query() query: QueryRecitationsDto) {
    return this.service.findAll(user, query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'تفاصيل سجل تسميع' })
  findOne(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.findOne(user, id);
  }

  @Post()
  @Roles(Role.ADMIN, Role.SUPERVISOR, Role.TEACHER)
  @ApiOperation({ summary: 'تسجيل تسميع يومي' })
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateRecitationDto) {
    return this.service.create(user, dto);
  }

  @Patch(':id')
  @Roles(Role.ADMIN, Role.SUPERVISOR, Role.TEACHER)
  @ApiOperation({ summary: 'تعديل سجل تسميع' })
  update(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpdateRecitationDto) {
    return this.service.update(user, id, dto);
  }

  @Delete(':id')
  @Roles(Role.ADMIN, Role.SUPERVISOR, Role.TEACHER)
  @ApiOperation({ summary: 'حذف سجل تسميع' })
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.remove(user, id);
  }
}
