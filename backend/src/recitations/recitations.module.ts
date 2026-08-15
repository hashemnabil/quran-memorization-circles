import { Module } from '@nestjs/common';
import { RecitationsController } from './recitations.controller';
import { RecitationsService } from './recitations.service';

@Module({
  controllers: [RecitationsController],
  providers: [RecitationsService],
  exports: [RecitationsService],
})
export class RecitationsModule {}
