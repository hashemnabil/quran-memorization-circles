import { Controller, Delete, Get, Param, Patch, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthUser, CurrentUser } from '../common/decorators';
import { PaginationDto } from '../common/dto/pagination.dto';
import { NotificationsService } from './notifications.service';

@ApiTags('الإشعارات')
@ApiBearerAuth()
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly service: NotificationsService) {}

  @Get()
  @ApiOperation({ summary: 'قائمة إشعارات المستخدم الحالي' })
  list(@CurrentUser() user: AuthUser, @Query() query: PaginationDto & { unreadOnly?: boolean }) {
    return this.service.list(user, query);
  }

  @Get('unread-count')
  @ApiOperation({ summary: 'عدد الإشعارات غير المقروءة' })
  unread(@CurrentUser() user: AuthUser) {
    return this.service.unreadCount(user);
  }

  @Patch('read-all')
  @ApiOperation({ summary: 'تعليم كل الإشعارات كمقروءة' })
  readAll(@CurrentUser() user: AuthUser) {
    return this.service.markAllRead(user);
  }

  @Patch(':id/read')
  @ApiOperation({ summary: 'تعليم إشعار كمقروء' })
  read(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.markRead(user, id);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'حذف إشعار' })
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.remove(user, id);
  }
}
