import { Module } from '@nestjs/common';
import { SuspensionsModule } from '../suspensions/suspensions.module';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';

@Module({
  imports: [SuspensionsModule],
  controllers: [DashboardController],
  providers: [DashboardService],
})
export class DashboardModule {}
