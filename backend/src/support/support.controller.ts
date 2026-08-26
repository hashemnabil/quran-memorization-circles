import { Body, Controller, Get, HttpCode, Param, Patch, Post, Query, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { Request } from 'express';
import { AuthUser, CurrentUser, Public, Roles } from '../common/decorators';
import {
  CreateTicketDto,
  PublicTicketDto,
  QueryTicketsDto,
  ReplyTicketDto,
  UpdateTicketDto,
} from './dto/support.dto';
import { SupportService } from './support.service';

@ApiTags('الدعم الفني')
@ApiBearerAuth()
@Controller('support')
export class SupportController {
  constructor(private readonly service: SupportService) {}

  /**
   * Reachable without a token: it is linked from the login page for people who
   * cannot get in. Rate-limited in the service.
   */
  @Public()
  @Post('public')
  @HttpCode(201)
  @ApiOperation({ summary: 'طلب دعم فني من صفحة الدخول (بدون تسجيل دخول)' })
  createPublic(@Body() dto: PublicTicketDto, @Req() req: Request) {
    const clientKey = (req.ip || req.socket?.remoteAddress || 'unknown').toString();
    return this.service.createPublic(dto, clientKey);
  }

  @Get('stats')
  @ApiOperation({ summary: 'إحصائيات طلبات الدعم' })
  stats(@CurrentUser() user: AuthUser) {
    return this.service.stats(user);
  }

  @Get('staff')
  @Roles(Role.ADMIN, Role.SUPPORT)
  @ApiOperation({ summary: 'أعضاء فريق الدعم' })
  staff() {
    return this.service.staff();
  }

  @Get()
  @ApiOperation({ summary: 'قائمة طلبات الدعم' })
  findAll(@CurrentUser() user: AuthUser, @Query() query: QueryTicketsDto) {
    return this.service.findAll(user, query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'تفاصيل طلب دعم مع المحادثة' })
  findOne(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.findOne(user, id);
  }

  @Post()
  @ApiOperation({ summary: 'إنشاء طلب دعم فني' })
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateTicketDto) {
    return this.service.create(user, dto);
  }

  @Post(':id/reply')
  @ApiOperation({ summary: 'إضافة رد على طلب الدعم' })
  reply(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: ReplyTicketDto) {
    return this.service.reply(user, id, dto);
  }

  @Patch(':id')
  @Roles(Role.ADMIN, Role.SUPPORT)
  @ApiOperation({ summary: 'تحديث الحالة / الأولوية / الإسناد' })
  update(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpdateTicketDto) {
    return this.service.update(user, id, dto);
  }
}
