import { Global, Module } from '@nestjs/common';
import { SmsController } from './sms.controller';
import { SmsService } from './sms.service';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';

@Global()
@Module({
  controllers: [NotificationsController, SmsController],
  providers: [NotificationsService, SmsService],
  exports: [NotificationsService],
})
export class NotificationsModule {}
