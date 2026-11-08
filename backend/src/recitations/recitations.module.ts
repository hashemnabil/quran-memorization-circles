import { Module } from '@nestjs/common';
import { StudentsModule } from '../students/students.module';
import { RecitationsController } from './recitations.controller';
import { RecitationsService } from './recitations.service';

// StudentsService owns the running points balance, so recording a recitation
// goes through it rather than writing `students.totalPoints` from here.
@Module({
  imports: [StudentsModule],
  controllers: [RecitationsController],
  providers: [RecitationsService],
  exports: [RecitationsService],
})
export class RecitationsModule {}
