import { Body, Controller, Get, HttpCode, Patch, Post, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { AuthUser, CurrentUser, Public } from '../common/decorators';
import { AuthService } from './auth.service';
import { ChangePasswordDto, LoginDto, RefreshDto } from './dto/auth.dto';

@ApiTags('المصادقة')
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Post('login')
  @HttpCode(200)
  @ApiOperation({ summary: 'تسجيل الدخول بالبريد الإلكتروني وكلمة المرور' })
  login(@Body() dto: LoginDto, @Req() req: Request) {
    return this.auth.login(dto, req.headers['user-agent']);
  }


  @Public()
  @Post('refresh')
  @HttpCode(200)
  @ApiOperation({ summary: 'تجديد رمز الدخول' })
  refresh(@Body() dto: RefreshDto, @Req() req: Request) {
    return this.auth.refresh(dto.refreshToken, req.headers['user-agent']);
  }

  @Post('logout')
  @HttpCode(200)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'تسجيل الخروج' })
  logout(@Body() dto: Partial<RefreshDto>, @CurrentUser() user: AuthUser) {
    return this.auth.logout(dto?.refreshToken, user.id);
  }

  @Get('me')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'بيانات المستخدم الحالي' })
  me(@CurrentUser() user: AuthUser) {
    return this.auth.me(user);
  }

  @Patch('change-password')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'تغيير كلمة المرور الشخصية' })
  changePassword(@CurrentUser() user: AuthUser, @Body() dto: ChangePasswordDto) {
    return this.auth.changePassword(user, dto);
  }
}
