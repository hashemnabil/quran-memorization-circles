import { Global, Module } from '@nestjs/common';
import { RealtimeGateway } from './realtime.gateway';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { DataChangeInterceptor } from './data-change.interceptor';
import { SnapshotDeltaInterceptor } from './snapshot-delta.interceptor';
import { ActivityController, ActivityService } from './activity.service';

@Global()
@Module({
  controllers: [ActivityController],
  providers: [ActivityService, RealtimeGateway, { provide: APP_INTERCEPTOR, useClass: DataChangeInterceptor }, { provide: APP_INTERCEPTOR, useClass: SnapshotDeltaInterceptor }],
  exports: [RealtimeGateway, ActivityService],
})
export class RealtimeModule {}
