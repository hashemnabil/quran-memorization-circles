import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { RequestStatus, TransferKind } from '@prisma/client';
import {
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import { PaginationDto } from '../../common/dto/pagination.dto';

/**
 * A student transfer request carries a reason and nothing else.
 *
 * Choosing the destination circle is a placement decision — it depends on
 * capacity, level and which teacher suits the student — so it belongs to the
 * administration at approval time, not to whoever noticed the problem.
 */
export class CreateStudentTransferDto {
  @ApiProperty()
  @IsUUID('4', { message: 'معرّف الطالب غير صالح' })
  studentId: string;

  @ApiProperty({ example: 'مستوى الطالب أعلى من مستوى الحلقة' })
  @IsString()
  @IsNotEmpty({ message: 'سبب النقل مطلوب' })
  @MaxLength(1000)
  reason: string;
}

/**
 * The administration's approval: this is where the destination is chosen.
 *
 * Optional at the DTO level because the same endpoint approves teacher
 * transfers and swaps, which already carry their target. The service requires
 * it for a student transfer, where it is the whole point of the decision.
 */
export class ApproveStudentTransferDto {
  @ApiPropertyOptional({
    description: 'الحلقة التي سيُنقل إليها الطالب — مطلوبة عند الموافقة على نقل طالب',
  })
  @IsOptional()
  @IsUUID('4', { message: 'معرّف الحلقة غير صالح' })
  toCircleId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  decisionNote?: string;
}

export class CreateTeacherTransferDto {
  @ApiProperty({ description: 'معرّف ملف المعلم' })
  @IsUUID('4', { message: 'معرّف المعلم غير صالح' })
  teacherId: string;

  @ApiProperty({ description: 'الحلقة المطلوب النقل إليها' })
  @IsUUID('4', { message: 'معرّف الحلقة غير صالح' })
  toCircleId: string;

  @ApiPropertyOptional({ description: 'الحلقة الحالية، تُستنتج تلقائياً إذا لم تُحدد' })
  @IsOptional()
  @IsUUID('4')
  fromCircleId?: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty({ message: 'سبب النقل مطلوب' })
  @MaxLength(1000)
  reason: string;
}

export class CreateTeacherSwapDto {
  @ApiProperty({ description: 'المعلم الأول' })
  @IsUUID('4', { message: 'معرّف المعلم الأول غير صالح' })
  teacherAId: string;

  @ApiProperty({ description: 'المعلم الثاني' })
  @IsUUID('4', { message: 'معرّف المعلم الثاني غير صالح' })
  teacherBId: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty({ message: 'سبب التبادل مطلوب' })
  @MaxLength(1000)
  reason: string;
}

export class DecideTransferDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  decisionNote?: string;
}

export class QueryTransfersDto extends PaginationDto {
  @ApiPropertyOptional({ enum: RequestStatus })
  @IsOptional()
  @IsEnum(RequestStatus)
  status?: RequestStatus;

  @ApiPropertyOptional({ enum: TransferKind })
  @IsOptional()
  @IsEnum(TransferKind)
  kind?: TransferKind;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID('4')
  studentId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID('4')
  circleId?: string;
}
