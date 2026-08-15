import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { AuthUser, CurrentUser, Roles } from '../common/decorators';
import { CreateUserDto, QueryUsersDto, ResetPasswordDto, UpdateUserDto } from './dto/user.dto';
import { UsersService } from './users.service';

@ApiTags('المستخدمون')
@ApiBearerAuth()
@Controller('users')
export class UsersController {
  constructor(private readonly service: UsersService) {}

  @Get('directory')
  @ApiOperation({ summary: 'دليل المستخدمين (لبدء محادثة)' })
  directory(@CurrentUser() user: AuthUser, @Query('search') search?: string) {
    return this.service.directory(user, search);
  }

  @Get('stats')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'إحصائيات المستخدمين' })
  stats() {
    return this.service.stats();
  }

  @Get()
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'قائمة المستخدمين' })
  findAll(@Query() query: QueryUsersDto) {
    return this.service.findAll(query);
  }

  @Get(':id')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'تفاصيل مستخدم' })
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Post()
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'إنشاء مستخدم' })
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateUserDto) {
    return this.service.create(user, dto);
  }

  @Patch(':id')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'تعديل مستخدم' })
  update(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpdateUserDto) {
    return this.service.update(user, id, dto);
  }

  @Patch(':id/reset-password')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'إعادة تعيين كلمة مرور مستخدم (بواسطة الإدارة)' })
  resetPassword(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: ResetPasswordDto) {
    return this.service.resetPassword(user, id, dto);
  }

  @Patch(':id/activate')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'تفعيل حساب' })
  activate(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.setActive(user, id, true);
  }

  @Patch(':id/deactivate')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'إيقاف حساب' })
  deactivate(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.setActive(user, id, false);
  }

  @Delete(':id')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'حذف مستخدم (حذف ناعم)' })
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.remove(user, id);
  }
}
