import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Evaluation, RecitationType } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsDateString,
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

export class CreateRecitationDto {
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

  @ApiProperty({
    enum: Evaluation,
    description: 'التقييم العام للتسميع — لا توجد درجة رقمية في التسميع اليومي',
  })
  @IsEnum(Evaluation, { message: 'التقييم المحدد غير صالح' })
  evaluation: Evaluation;

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
