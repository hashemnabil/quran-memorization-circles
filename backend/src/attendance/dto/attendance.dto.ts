import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { AttendanceStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { PaginationDto } from '../../common/dto/pagination.dto';

export class AttendanceEntryDto {
  @ApiProperty()
  @IsUUID('4', { message: 'معرّف الطالب غير صالح' })
  studentId: string;

  @ApiProperty({ enum: AttendanceStatus, description: 'حاضر / غياب بعذر / غياب بدون عذر' })
  @IsEnum(AttendanceStatus, { message: 'حالة الحضور غير صالحة' })
  status: AttendanceStatus;

  @ApiPropertyOptional({ description: 'سبب العذر — يُحفظ مع الغياب بعذر فقط' })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  note?: string;
}

export class RecordAttendanceDto {
  @ApiProperty({ description: 'معرّف الحلقة' })
  @IsUUID('4', { message: 'معرّف الحلقة غير صالح' })
  circleId: string;

  @ApiProperty({ example: '2026-08-14' })
  @IsDateString({}, { message: 'التاريخ غير صالح' })
  date: string;

  @ApiProperty({ type: [AttendanceEntryDto] })
  @IsArray()
  @ArrayMinSize(1, { message: 'يجب إدخال حضور طالب واحد على الأقل' })
  @ValidateNested({ each: true })
  @Type(() => AttendanceEntryDto)
  entries: AttendanceEntryDto[];
}

export class QueryAttendanceDto extends PaginationDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID('4')
  circleId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID('4')
  studentId?: string;

  @ApiPropertyOptional({ enum: AttendanceStatus })
  @IsOptional()
  @IsEnum(AttendanceStatus)
  status?: AttendanceStatus;

  @ApiPropertyOptional({ example: '2026-08-01' })
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional({ example: '2026-08-31' })
  @IsOptional()
  @IsDateString()
  to?: string;
}

export class AttendanceSheetQueryDto {
  @ApiProperty()
  @IsUUID('4', { message: 'معرّف الحلقة غير صالح' })
  circleId: string;

  @ApiProperty({ example: '2026-08-14' })
  @IsDateString({}, { message: 'التاريخ غير صالح' })
  date: string;
}
