import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ExamRequestStatus, ExamStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
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

export class CreateExamRequestDto {
  @ApiProperty()
  @IsUUID('4', { message: 'معرّف الطالب غير صالح' })
  studentId: string;

  @ApiProperty({ type: [String], description: 'معرّفات الأجزاء المطلوبة في طلب واحد' })
  @IsArray()
  @ArrayMinSize(1, { message: 'يجب اختيار جزء واحد على الأقل' })
  @ArrayMaxSize(30)
  @IsUUID('4', { each: true, message: 'أحد معرّفات الأجزاء غير صالح' })
  sectionIds: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;
}

export class ReviewExamRequestDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  reviewNote?: string;
}

export class ScheduleExamDto {
  @ApiProperty({ example: '2026-09-01T10:00:00.000Z' })
  @IsDateString({}, { message: 'موعد الاختبار غير صالح' })
  scheduledAt: string;

  @ApiPropertyOptional({ description: 'معرّف مستخدم الممتحن' })
  @IsOptional()
  @IsUUID('4', { message: 'معرّف الممتحن غير صالح' })
  examinerId?: string;

  @ApiPropertyOptional({ example: 'قاعة الاختبارات' })
  @IsOptional()
  @IsString()
  @MaxLength(150)
  location?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;
}

export class RecordResultDto {
  @ApiProperty({ minimum: 0, maximum: 100, description: 'الدرجة من 100 — وهي ما يحدد النجاح' })
  @Type(() => Number)
  @IsInt({ message: 'الدرجة غير صالحة' })
  @Min(0)
  @Max(100)
  score: number;

  @ApiPropertyOptional({ minimum: 0, description: 'عدد الأخطاء — اختياري' })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'عدد الأخطاء غير صالح' })
  @Min(0)
  @Max(500)
  mistakes?: number;

  @ApiPropertyOptional({ description: 'ملاحظات عامة للممتحن' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;
}

export class UpdateExamDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  scheduledAt?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID('4')
  examinerId?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(150)
  location?: string;
  @ApiPropertyOptional({ enum: ExamStatus })
  @IsOptional()
  @IsEnum(ExamStatus)
  status?: ExamStatus;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;
}

export class QueryExamRequestsDto extends PaginationDto {
  @ApiPropertyOptional({ enum: ExamRequestStatus })
  @IsOptional()
  @IsEnum(ExamRequestStatus)
  status?: ExamRequestStatus;
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID('4')
  studentId?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID('4')
  sectionId?: string;
}

export class QueryExamsDto extends PaginationDto {
  @ApiPropertyOptional({ enum: ExamStatus })
  @IsOptional()
  @IsEnum(ExamStatus)
  status?: ExamStatus;
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID('4')
  studentId?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID('4')
  sectionId?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID('4')
  examinerId?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  from?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  to?: string;
}

export class CreateSectionDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty({ message: 'اسم المقرر مطلوب' })
  @MaxLength(120)
  name: string;
  @ApiProperty()
  @IsString()
  @IsNotEmpty({ message: 'رمز المقرر مطلوب' })
  @MaxLength(40)
  code: string;
  @ApiProperty({ description: 'ترتيب المقرر في التسلسل الإلزامي' })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  order: number;
  @ApiPropertyOptional({ default: 60 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  minScore?: number;
  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  pagesCount?: number;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;
}
