import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { AuthUser, CurrentUser, Roles } from '../common/decorators';
import {
  CreateStudentTransferDto,
  CreateTeacherSwapDto,
  CreateTeacherTransferDto,
  DecideTransferDto,
  QueryTransfersDto,
} from './dto/transfer.dto';
import { TransfersService } from './transfers.service';

@ApiTags('طلبات النقل والتبادل')
@ApiBearerAuth()
@Controller('transfers')
export class TransfersController {
  constructor(private readonly service: TransfersService) {}

  @Get()
  @Roles(Role.ADMIN, Role.SUPERVISOR, Role.TEACHER)
  @ApiOperation({ summary: 'قائمة طلبات النقل' })
  findAll(@CurrentUser() user: AuthUser, @Query() query: QueryTransfersDto) {
    return this.service.findAll(user, query);
  }

  @Get(':id')
  @Roles(Role.ADMIN, Role.SUPERVISOR, Role.TEACHER)
  @ApiOperation({ summary: 'تفاصيل طلب نقل' })
  findOne(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.findOne(user, id);
  }

  @Post('students')
  @Roles(Role.ADMIN, Role.SUPERVISOR, Role.TEACHER)
  @ApiOperation({ summary: 'طلب نقل طالب إلى حلقة أخرى' })
  requestStudent(@CurrentUser() user: AuthUser, @Body() dto: CreateStudentTransferDto) {
    return this.service.requestStudentTransfer(user, dto);
  }

  @Post('teachers')
  @Roles(Role.ADMIN, Role.SUPERVISOR, Role.TEACHER)
  @ApiOperation({ summary: 'طلب نقل معلم إلى حلقة أخرى' })
  requestTeacher(@CurrentUser() user: AuthUser, @Body() dto: CreateTeacherTransferDto) {
    return this.service.requestTeacherTransfer(user, dto);
  }

  @Post('teachers/swap')
  @Roles(Role.ADMIN, Role.SUPERVISOR)
  @ApiOperation({ summary: 'طلب تبادل معلمين بين حلقتين' })
  requestSwap(@CurrentUser() user: AuthUser, @Body() dto: CreateTeacherSwapDto) {
    return this.service.requestTeacherSwap(user, dto);
  }

  @Patch(':id/approve')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'الموافقة على طلب نقل وتنفيذه' })
  approve(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: DecideTransferDto) {
    return this.service.approve(user, id, dto);
  }

  @Patch(':id/reject')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'رفض طلب نقل' })
  reject(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: DecideTransferDto) {
    return this.service.reject(user, id, dto);
  }

  @Patch(':id/cancel')
  @Roles(Role.ADMIN, Role.SUPERVISOR, Role.TEACHER)
  @ApiOperation({ summary: 'إلغاء طلب نقل معلق' })
  cancel(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.cancel(user, id);
  }
}
