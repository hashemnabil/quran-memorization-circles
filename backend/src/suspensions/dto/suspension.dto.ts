import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { RequestStatus, SuspensionAction } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';
import { PaginationDto } from '../../common/dto/pagination.dto';

/**
 * The requester states the problem and nothing else — no duration, no outcome.
 * Deciding what to do about it is the administration's job, and asking a
 * teacher to pick a penalty before anyone has reviewed the case was the part
 * that made this workflow awkward.
 */
export class CreateSuspensionDto {
  @ApiProperty()
  @IsUUID('4', { message: 'معرّف الطالب غير صالح' })
  studentId: string;

  @ApiProperty({ example: 'غياب متكرر دون عذر', description: 'سبب الطلب — وهو كل ما يقدّمه مُقدّم الطلب' })
  @IsString()
  @IsNotEmpty({ message: 'سبب الطلب مطلوب' })
  @MaxLength(1000)
  reason: string;
}

/**
 * The decision. `SUSPEND` needs a duration; `ACTIVITY_PROGRAM` does not, because
 * moving a student to the activity programme is not time-boxed — they stay
 * there until they are ready to join a circle.
 */
export class ApproveSuspensionDto {
  @ApiProperty({
    enum: SuspensionAction,
    description: 'نقل إلى برنامج النشاط أو إيقاف مؤقت بمدة محددة',
  })
  @IsEnum(SuspensionAction, { message: 'الإجراء المحدد غير صالح' })
  action: SuspensionAction;

  @ApiPropertyOptional({ example: 14, minimum: 1, maximum: 365, description: 'مطلوبة عند الإيقاف' })
  @ValidateIf((o) => o.action === SuspensionAction.SUSPEND)
  @Type(() => Number)
  @IsInt({ message: 'مدة الإيقاف غير صالحة' })
  @Min(1, { message: 'مدة الإيقاف يوم واحد على الأقل' })
  @Max(365, { message: 'مدة الإيقاف لا تتجاوز 365 يوماً' })
  durationDays?: number;

  @ApiPropertyOptional({ description: 'تاريخ البداية، افتراضياً اليوم' })
  @IsOptional()
  @IsDateString({}, { message: 'تاريخ البداية غير صالح' })
  startDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  decisionNote?: string;
}

export class DecideSuspensionDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  decisionNote?: string;
}

export class ReturnStudentDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;

  /**
   * Required when bringing a student back from the activity programme: they
   * were removed from their circle on the way in, so somebody has to say which
   * circle they are joining on the way out.
   */
  @ApiPropertyOptional({ description: 'الحلقة التي يعود إليها الطالب (مطلوبة للعائد من برنامج النشاط)' })
  @IsOptional()
  @IsUUID('4', { message: 'معرّف الحلقة غير صالح' })
  circleId?: string;
}

export class QuerySuspensionsDto extends PaginationDto {
  @ApiPropertyOptional({ enum: RequestStatus })
  @IsOptional()
  @IsEnum(RequestStatus)
  status?: RequestStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID('4')
  studentId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID('4')
  circleId?: string;

  @ApiPropertyOptional({ description: 'الإيقافات السارية فقط' })
  @IsOptional()
  @IsString()
  activeOnly?: string;
}
