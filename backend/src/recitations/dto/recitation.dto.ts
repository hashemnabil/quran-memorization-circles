import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Evaluation, RecitationType } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsDateString, IsArray, ArrayMaxSize, ValidateNested, Matches,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { PaginationDto } from '../../common/dto/pagination.dto';

export class WordErrorDto {
 @IsUUID('4') id:string;
 @IsString() @Matches(/^\d{1,3}:\d{1,3}:\d{1,3}$/) wordId:string;
 @IsString() @Matches(/^[-a-zA-Z0-9_]{1,60}$/) typeId:string;
 @IsOptional() @IsString() @MaxLength(500) note?:string;
}
export class TypeCounterDto { @IsString() @Matches(/^[-a-zA-Z0-9_]{1,60}$/) typeId:string; @IsInt() @Min(0) @Max(9999) count:number; }
export class CreateRecitationDto {
 @IsOptional() @IsDateString() baseUpdatedAt?:string;
 @IsOptional() @IsArray() @ArrayMaxSize(60) @ValidateNested({each:true}) @Type(()=>TypeCounterDto) typeCounters?:TypeCounterDto[];
 @IsOptional() @IsString() @MaxLength(60) rulesRevision?:string;
 @IsOptional() @IsArray() @ArrayMaxSize(2000) @ValidateNested({each:true}) @Type(()=>WordErrorDto) wordErrors?:WordErrorDto[];
  @ApiProperty()
  @IsUUID('4', { message: 'معرّف الطالب غير صالح' })
  studentId: string;

  @ApiProperty({ example: '2026-08-14' })
  @IsDateString({}, { message: 'التاريخ غير صالح' })
  date: string;

  @ApiPropertyOptional({ enum: RecitationType, default: RecitationType.MEMORIZATION })
  @IsOptional()
  @IsEnum(RecitationType)
  type?: RecitationType;

  @ApiProperty({ example: 'البقرة' })
  @IsString()
  @IsNotEmpty({ message: 'سورة البداية مطلوبة' })
  @MaxLength(60)
  fromSurah: string;

  @ApiProperty({ example: 1 })
  @Type(() => Number)
  @IsInt({ message: 'رقم آية البداية غير صالح' })
  @Min(1)
  @Max(286)
  fromAyah: number;

  @ApiProperty({ example: 'البقرة' })
  @IsString()
  @IsNotEmpty({ message: 'سورة النهاية مطلوبة' })
  @MaxLength(60)
  toSurah: string;

  @ApiProperty({ example: 20 })
  @Type(() => Number)
  @IsInt({ message: 'رقم آية النهاية غير صالح' })
  @Min(1)
  @Max(286)
  toAyah: number;

  @ApiPropertyOptional({ example: 1.5 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(604)
  pagesCount?: number;

  /**
   * Scoring. The teacher counts what actually happened in the session — the
   * mistakes and the warnings — and the points follow from the rules; there is
   * no mark to argue about. `versesCount` is derived from the range unless the
   * teacher overrides it (a partial or repeated passage).
   */
  @ApiPropertyOptional({ description: 'عدد الأخطاء — يُخصم عن كل خطأ نقطة واحدة' })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'عدد الأخطاء غير صالح' })
  @Min(0)
  @Max(9999)
  mistakes?: number;

  @ApiPropertyOptional({ description: 'عدد التنبيهات — يُخصم عن كل تنبيه ربع نقطة' })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'عدد التنبيهات غير صالح' })
  @Min(0)
  @Max(9999)
  warnings?: number;

  @ApiPropertyOptional({ description: 'عدد أخطاء أحكام التجويد' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(9999)
  tajweedErrors?: number;

  @ApiPropertyOptional({ description: 'عدد الآيات — يُحتسب تلقائياً من النطاق إذا تُرك فارغاً' })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'عدد الآيات غير صالح' })
  @Min(0)
  @Max(6236)
  versesCount?: number;

  @ApiPropertyOptional({
    enum: Evaluation,
    description: 'حقل قديم؛ يحسب الخادم التقييم تلقائياً وفق إعدادات المدرسة',
  })
  @IsOptional()
  @IsEnum(Evaluation, { message: 'التقييم المحدد غير صالح' })
  evaluation?: Evaluation;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;
}

export class UpdateRecitationDto extends PartialType(CreateRecitationDto) {}

export class QueryRecitationsDto extends PaginationDto {
  @ApiPropertyOptional({ enum: Evaluation })
  @IsOptional()
  @IsEnum(Evaluation)
  evaluation?: Evaluation;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID('4')
  studentId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID('4')
  circleId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID('4')
  teacherId?: string;

  @ApiPropertyOptional({ enum: RecitationType })
  @IsOptional()
  @IsEnum(RecitationType)
  type?: RecitationType;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  to?: string;
}
