import { Module } from '@nestjs/common';
import { CommunityController } from './community.controller';
import { ChatModule } from '../chat/chat.module';
@Module({imports:[ChatModule],controllers:[CommunityController]})
export class CommunityModule {}
