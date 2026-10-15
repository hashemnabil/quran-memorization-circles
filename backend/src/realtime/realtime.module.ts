import { Global, Module } from '@nestjs/common';
import { RealtimeGateway } from './realtime.gateway';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { DataChangeInterceptor } from './data-change.interceptor';
import { SnapshotDeltaInterceptor } from './snapshot-delta.interceptor';

@Global()
@Module({
  providers: [RealtimeGateway, { provide: APP_INTERCEPTOR, useClass: DataChangeInterceptor }, { provide: APP_INTERCEPTOR, useClass: SnapshotDeltaInterceptor }],
  exports: [RealtimeGateway],
})
export class RealtimeModule {}
