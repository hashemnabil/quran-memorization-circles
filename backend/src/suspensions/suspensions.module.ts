import { Module } from '@nestjs/common';
import { SuspensionsController } from './suspensions.controller';
import { SuspensionsService } from './suspensions.service';

@Module({
  controllers: [SuspensionsController],
  providers: [SuspensionsService],
  exports: [SuspensionsService],
})
export class SuspensionsModule {}
