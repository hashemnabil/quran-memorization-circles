import { Body, Controller, Delete, Get, Module, Post } from '@nestjs/common';
import { AuthUser, CurrentUser } from '../common/decorators';
import { PushService } from './push.service';
@Controller('push')
class PushController {
  constructor(private readonly service: PushService) {}
  @Get('config') config() { return this.service.config(); }
  @Post('devices') register(@CurrentUser() user: AuthUser, @Body() body: { installationId: string; platform: string; token: string; notificationChannelId?: string }) { return this.service.register(user, body); }
  @Delete('devices') unregister(@CurrentUser() user: AuthUser, @Body() body: { installationId: string }) { return this.service.unregister(user, body.installationId); }
}
@Module({ controllers: [PushController], providers: [PushService] })
export class PushModule {}
