import { Module } from '@nestjs/common';
import { OfflineSyncController } from './offline-sync.controller';
import { OfflineSyncService } from './offline-sync.service';

@Module({
  controllers: [OfflineSyncController],
  providers: [OfflineSyncService],
})
export class OfflineSyncModule {}
