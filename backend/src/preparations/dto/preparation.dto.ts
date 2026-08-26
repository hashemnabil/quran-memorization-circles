import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
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

export class CreatePreparationDto {
  @ApiProperty()
  @IsUUID('4', { message: 'معرّف الطالب غير صالح' })
  studentId: string;

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

  @ApiPropertyOptional({ description: 'تعليمات إضافية لولي الأمر والطالب' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;

  @ApiPropertyOptional({ example: '2026-08-25', description: 'موعد التسميع القادم' })
  @IsOptional()
  @IsDateString({}, { message: 'تاريخ التسليم غير صالح' })
  dueDate?: string;
}

export class UpdatePreparationDto extends PartialType(CreatePreparationDto) {}

export class QueryPreparationsDto extends PaginationDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID('4')
  studentId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID('4')
  circleId?: string;

  @ApiPropertyOptional({ description: 'التحضيرات غير المنجزة فقط' })
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  pending?: boolean;
}
