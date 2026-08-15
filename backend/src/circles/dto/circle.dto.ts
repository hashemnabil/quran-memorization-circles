import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { PaginationDto } from '../../common/dto/pagination.dto';

export const WEEK_DAYS = [
  'SATURDAY',
  'SUNDAY',
  'MONDAY',
  'TUESDAY',
  'WEDNESDAY',
  'THURSDAY',
  'FRIDAY',
] as const;

export class CreateCircleDto {
  @ApiProperty({ example: 'حلقة الفرقان' })
  @IsString()
  @IsNotEmpty({ message: 'اسم الحلقة مطلوب' })
  @MaxLength(120)
  name: string;

  @ApiPropertyOptional({ description: 'رمز الحلقة، يُولَّد تلقائياً إذا تُرك فارغاً' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  code?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @ApiPropertyOptional({ example: 'القاعة الشرقية' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  location?: string;

  @ApiPropertyOptional({ example: 'متقدم' })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  level?: string;

  @ApiPropertyOptional({ default: 25 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  capacity?: number;

  @ApiPropertyOptional({ enum: WEEK_DAYS, isArray: true })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(7)
  @IsString({ each: true })
  scheduleDays?: string[];

  @ApiPropertyOptional({ example: '16:30' })
  @IsOptional()
  @Matches(/^([01]\d|2[0-3]):([0-5]\d)$/, { message: 'صيغة وقت البداية غير صحيحة (HH:mm)' })
  startTime?: string;

  @ApiPropertyOptional({ example: '18:00' })
  @IsOptional()
  @Matches(/^([01]\d|2[0-3]):([0-5]\d)$/, { message: 'صيغة وقت النهاية غير صحيحة (HH:mm)' })
  endTime?: string;

  @ApiPropertyOptional({ description: 'معرّف المستخدم المشرف' })
  @IsOptional()
  @IsUUID('4', { message: 'معرّف المشرف غير صالح' })
  supervisorId?: string;

  @ApiPropertyOptional({ description: 'معرّف ملف المعلم الأساسي' })
  @IsOptional()
  @IsUUID('4', { message: 'معرّف المعلم غير صالح' })
  primaryTeacherId?: string;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateCircleDto extends PartialType(CreateCircleDto) {}

export class QueryCirclesDto extends PaginationDto {
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID('4')
  supervisorId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID('4')
  teacherId?: string;
}

export class AssignTeacherDto {
  @ApiProperty({ description: 'معرّف ملف المعلم' })
  @IsUUID('4', { message: 'معرّف المعلم غير صالح' })
  teacherId: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(250)
  note?: string;
}

export class SetSupervisorDto {
  @ApiPropertyOptional({ description: 'اتركه فارغاً لإزالة المشرف' })
  @IsOptional()
  @IsUUID('4', { message: 'معرّف المشرف غير صالح' })
  supervisorId?: string | null;
}
