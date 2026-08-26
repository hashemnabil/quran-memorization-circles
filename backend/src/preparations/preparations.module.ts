import { Module } from '@nestjs/common';
import { PreparationsController } from './preparations.controller';
import { PreparationsService } from './preparations.service';

@Module({
  controllers: [PreparationsController],
  providers: [PreparationsService],
  exports: [PreparationsService],
})
export class PreparationsModule {}
