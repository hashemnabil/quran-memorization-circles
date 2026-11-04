import { Module } from '@nestjs/common';
import { StudentsController } from './students.controller';
import { StudentsService } from './students.service';
import { MemorizationPlansController } from './memorization-plans.controller';

@Module({
  controllers: [StudentsController, MemorizationPlansController],
  providers: [StudentsService],
  exports: [StudentsService],
})
export class StudentsModule {}
