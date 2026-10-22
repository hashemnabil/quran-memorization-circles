import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ExamMilestoneStatus, ExamRequestStatus, ExamSectionKind, ExamStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayNotEmpty,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsNumber,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  ValidateNested,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { PaginationDto } from '../../common/dto/pagination.dto';

/**
 * One exam may cover several parts of the Quran — a juz', a hizb, or a few of
 * either. `sectionIds` is the full set; the service keeps the lowest-ordered
 * one as the request's primary section so the progression rules and every
 * existing query keep working unchanged.
 */
export class CreateExamRequestDto {
  @IsOptional() @IsString() @MaxLength(100)
  combinedStage?: string;
  @ApiProperty()
  @IsUUID('4', { message: 'معرّف الطالب غير صالح' })
  studentId: string;

  @ApiPropertyOptional({ type: [String], description: 'للتوافق مع الطلبات القديمة' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(30)
  @IsUUID('4', { each: true, message: 'أحد معرّفات المقررات غير صالح' })
  sectionIds?: string[];

  @ApiPropertyOptional({ description: 'رقم الحزب المطلوب، اختياري' })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'رقم الحزب غير صالح' })
  @Min(1)
  @Max(60)
  requestedHizb?: number;

  @ApiPropertyOptional({ description: 'رقم الجزء المطلوب، اختياري' })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'رقم الجزء غير صالح' })
  @Min(1)
  @Max(30)
  requestedJuz?: number;

  @ApiPropertyOptional({ description: 'رقم المجتمعة، اختياري' })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'رقم المجتمعة غير صالح' })
  @Min(1)
  @Max(60)
  requestedCombined?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;
}

export class UpdateExamMilestoneDto {
  @ApiProperty({ enum: ExamMilestoneStatus })
  @IsEnum(ExamMilestoneStatus)
  status: ExamMilestoneStatus;

  @ApiPropertyOptional({ minimum: 0, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100)
  score?: number | null;

  @ApiPropertyOptional({ description: 'تاريخ طلب الاختبار' })
  @IsOptional()
  @IsDateString()
  requestedAt?: string | null;

  @ApiPropertyOptional({ description: 'تاريخ إجراء الاختبار' })
  @IsOptional()
  @IsDateString()
  examDate?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  examinerName?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string | null;
}

export class ReviewExamRequestDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  reviewNote?: string;
}

export class ScheduleExamDto {
  @ApiProperty({ description: 'اللجنة التي ستتولى الاختبار' })
  @IsUUID('4')
  committeeId: string;
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

export class RecordSectionScoreDto {
  @ApiProperty()
  @IsUUID('4')
  sectionId: string;

  @ApiProperty({ minimum: 0, maximum: 100 })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100)
  score: number;
}

export class RecordResultDto {
  @IsOptional() @IsNumber() @Min(0) @Max(10)
  tajweed?: number;
  @IsOptional() @IsInt() @Min(0) @Max(500)
  alerts?: number;
  @IsOptional() @IsNumber() @Min(0) @Max(90)
  mistakePenalty?: number;
  @IsOptional() @IsNumber() @Min(0) @Max(90)
  alertPenalty?: number;
  @ApiProperty({ minimum: 0, maximum: 100, description: 'الدرجة من 100 — وهي ما يحدد النجاح' })
  @Type(() => Number)
  @IsNumber({}, { message: 'الدرجة غير صالحة' })
  @Min(0)
  @Max(100)
  score: number;

  @ApiPropertyOptional({
    minimum: 0,
    description: 'عدد الأخطاء — اختياري، يمكن للممتحن الاكتفاء بالدرجة والملاحظات',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'عدد الأخطاء غير صالح' })
  @Min(0)
  @Max(500)
  mistakes?: number;

  @ApiPropertyOptional({ type: [RecordSectionScoreDto], description: 'علامة مستقلة لكل حزب/جزء في الاختبار الجماعي' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(30)
  @ValidateNested({ each: true })
  @Type(() => RecordSectionScoreDto)
  sectionScores?: RecordSectionScoreDto[];

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

export class HistoricalExamDto extends RecordResultDto {
  @IsUUID('4') studentId: string;
  @IsUUID('4') sectionId: string;
  @IsUUID('4') committeeId: string;
  @IsOptional() @IsString() @MaxLength(100) combinedStage?: string;
}

export class QueryExamRequestsDto extends PaginationDto {
  @ApiPropertyOptional({ enum: ExamSectionKind, description: 'تصفية حسب نوع المقرر' })
  @IsOptional()
  @IsEnum(ExamSectionKind)
  kind?: ExamSectionKind;

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
  @IsOptional() @IsUUID('4')
  committeeId?: string;
  @ApiPropertyOptional({ description: 'بحث باسم الطالب أو رقمه أو اسم المقرر' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;

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

  @ApiPropertyOptional({ enum: ExamSectionKind, default: ExamSectionKind.HIZB })
  @IsOptional()
  @IsEnum(ExamSectionKind, { message: 'نوع المقرر غير صالح' })
  kind?: ExamSectionKind;

  @ApiPropertyOptional({
    default: true,
    description: 'المقررات الإلزامية تُشكّل التسلسل؛ الأحزاب اختيارية',
  })
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  isRequired?: boolean;

  @ApiPropertyOptional({ default: 80 })
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
