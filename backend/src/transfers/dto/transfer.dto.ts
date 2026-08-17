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

export class CreateStudentTransferDto {
  @ApiProperty()
  @IsUUID('4', { message: 'معرّف الطالب غير صالح' })
  studentId: string;

  @ApiPropertyOptional({ description: 'لا يحددها المعلم؛ الإدارة تحدد الحلقة عند الموافقة' })
  @IsOptional()
  @IsUUID('4', { message: 'معرّف الحلقة غير صالح' })
  toCircleId?: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty({ message: 'سبب النقل مطلوب' })
  @MaxLength(1000)
  reason: string;
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
  @ApiPropertyOptional({ description: 'ملاحظة القرار' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  decisionNote?: string;

  @ApiPropertyOptional({ description: 'الحلقة التي تعينها الإدارة عند قبول نقل الطالب' })
  @IsOptional()
  @IsUUID('4', { message: 'معرّف الحلقة غير صالح' })
  toCircleId?: string;
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
