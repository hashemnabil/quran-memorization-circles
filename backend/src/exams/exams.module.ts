import { Module } from '@nestjs/common';
import { ExamsController } from './exams.controller';
import { ExamsService } from './exams.service';
import { ExamRemindersService } from './exam-reminders.service';

@Module({
  controllers: [ExamsController],
  providers: [ExamsService, ExamRemindersService],
  exports: [ExamsService],
})
export class ExamsModule {}
