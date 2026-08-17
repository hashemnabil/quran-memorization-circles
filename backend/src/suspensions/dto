import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { RequestStatus } from '@prisma/client';
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
} from 'class-validator';
import { PaginationDto } from '../../common/dto/pagination.dto';

export class CreateSuspensionDto {
  @ApiProperty()
  @IsUUID('4', { message: 'معرّف الطالب غير صالح' })
  studentId: string;

  @ApiProperty({ example: 'غياب متكرر دون عذر' })
  @IsString()
  @IsNotEmpty({ message: 'سبب الإيقاف مطلوب' })
  @MaxLength(1000)
  reason: string;

  @ApiProperty({ example: 14, minimum: 1, maximum: 365 })
  @Type(() => Number)
  @IsInt({ message: 'مدة الإيقاف غير صالحة' })
  @Min(1, { message: 'مدة الإيقاف يوم واحد على الأقل' })
  @Max(365, { message: 'مدة الإيقاف لا تتجاوز 365 يوماً' })
  durationDays: number;

  @ApiPropertyOptional({ description: 'تاريخ البداية، افتراضياً اليوم' })
  @IsOptional()
  @IsDateString({}, { message: 'تاريخ البداية غير صالح' })
  startDate?: string;
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
