import { Global, Module } from '@nestjs/common';
import { AccessControlService } from './services/access-control.service';
import { ActivityService } from './services/activity.service';

@Global()
@Module({
  providers: [AccessControlService, ActivityService],
  exports: [AccessControlService, ActivityService],
})
export class CommonModule {}
