import { Global, Module } from '@nestjs/common';
import { SmsController } from './sms.controller';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';

@Global()
@Module({
  controllers: [NotificationsController, SmsController],
  providers: [NotificationsService],
  exports: [NotificationsService],
})
export class NotificationsModule {}
