import { UploadsModule } from '../uploads/uploads.module';
import { Module } from '@nestjs/common';
import { CommunityController } from './community.controller';
import { ChatModule } from '../chat/chat.module';
@Module({imports:[ChatModule,UploadsModule],controllers:[CommunityController]})
export class CommunityModule {}
