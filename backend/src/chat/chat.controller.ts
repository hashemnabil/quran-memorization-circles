import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthUser, CurrentUser } from '../common/decorators';
import { ChatService } from './chat.service';
import {
  AddMembersDto,
  CreateDirectConversationDto,
  CreateGroupConversationDto,
  EditMessageDto,
  QueryMessagesDto,
  SendMessageDto,
  SetMemberAdminDto,
  UpdateConversationDto,
} from './dto/chat.dto';

@ApiTags('المحادثات')
@ApiBearerAuth()
@Controller('chat')
export class ChatController {
  constructor(private readonly service: ChatService) {}

  @Get('conversations')
  @ApiOperation({ summary: 'قائمة المحادثات' })
  list(@CurrentUser() user: AuthUser) {
    return this.service.listConversations(user);
  }

  @Get('unread-count')
  @ApiOperation({ summary: 'إجمالي الرسائل غير المقروءة' })
  unread(@CurrentUser() user: AuthUser) {
    return this.service.unreadTotal(user);
  }

  @Get('conversations/:id')
  @ApiOperation({ summary: 'تفاصيل محادثة' })
  findOne(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.findOne(user, id);
  }

  @Get('conversations/:id/messages')
  @ApiOperation({ summary: 'رسائل المحادثة' })
  messages(@CurrentUser() user: AuthUser, @Param('id') id: string, @Query() query: QueryMessagesDto) {
    return this.service.messages(user, id, query);
  }

  @Post('conversations/direct')
  @ApiOperation({ summary: 'بدء محادثة فردية' })
  createDirect(@CurrentUser() user: AuthUser, @Body() dto: CreateDirectConversationDto) {
    return this.service.createDirect(user, dto);
  }

  @Post('conversations/group')
  @ApiOperation({ summary: 'إنشاء محادثة جماعية' })
  createGroup(@CurrentUser() user: AuthUser, @Body() dto: CreateGroupConversationDto) {
    return this.service.createGroup(user, dto);
  }

  @Post('conversations/:id/messages')
  @ApiOperation({ summary: 'إرسال رسالة' })
  send(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: SendMessageDto) {
    return this.service.send(user, id, dto);
  }

  @Patch('conversations/:id/read')
  @ApiOperation({ summary: 'تعليم رسائل المحادثة كمقروءة' })
  markRead(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.markRead(user, id);
  }

  @Patch('conversations/:id')
  @ApiOperation({ summary: 'تعديل إعدادات المجموعة (الاسم، الإغلاق، الإرسال للمشرفين فقط)' })
  updateConversation(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateConversationDto,
  ) {
    return this.service.updateConversation(user, id, dto);
  }

  @Post('conversations/:id/members')
  @ApiOperation({ summary: 'إضافة أعضاء إلى مجموعة' })
  addMembers(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: AddMembersDto) {
    return this.service.addMembers(user, id, dto);
  }

  @Patch('conversations/:id/members/:userId')
  @ApiOperation({ summary: 'ترقية عضو إلى مشرف أو إزالة الإشراف' })
  setMemberAdmin(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Param('userId') userId: string,
    @Body() dto: SetMemberAdminDto,
  ) {
    return this.service.setMemberAdmin(user, id, userId, dto.isAdmin);
  }

  // Must stay ahead of the `:userId` route below, otherwise "me" is captured as an id.
  @Delete('conversations/:id/members/me')
  @ApiOperation({ summary: 'مغادرة المجموعة' })
  leave(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.leave(user, id);
  }

  @Delete('conversations/:id/members/:userId')
  @ApiOperation({ summary: 'إزالة عضو من المجموعة' })
  removeMember(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Param('userId') userId: string,
  ) {
    return this.service.removeMember(user, id, userId);
  }

  @Patch('conversations/:id/messages/:messageId')
  @ApiOperation({ summary: 'تعديل رسالة' })
  editMessage(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Param('messageId') messageId: string,
    @Body() dto: EditMessageDto,
  ) {
    return this.service.editMessage(user, id, messageId, dto.body);
  }

  @Delete('conversations/:id/messages/:messageId')
  @ApiOperation({ summary: 'حذف رسالة' })
  deleteMessage(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Param('messageId') messageId: string,
  ) {
    return this.service.deleteMessage(user, id, messageId);
  }
}
