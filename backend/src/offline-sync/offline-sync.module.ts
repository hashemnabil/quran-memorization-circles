import { Module } from '@nestjs/common';
import { OfflineSyncController } from './offline-sync.controller';
import { SyncController } from './sync.controller';
import { OfflineSyncService } from './offline-sync.service';
import { FullSyncController } from './sync-all.controller';
import { FullSyncService } from './sync-all.service';

@Module({
  controllers: [OfflineSyncController, SyncController, FullSyncController],
  providers: [OfflineSyncService, FullSyncService],
})
export class OfflineSyncModule {}
