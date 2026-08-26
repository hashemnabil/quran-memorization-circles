import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { AttendanceStatus, Role } from '@prisma/client';
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

export class StaffAttendanceEntryDto {
  @ApiProperty({ description: 'معرّف حساب الموظف' })
  @IsUUID('4', { message: 'معرّف الموظف غير صالح' })
  userId: string;

  @ApiProperty({ enum: AttendanceStatus, description: 'حاضر / غياب بعذر / غياب بدون عذر' })
  @IsEnum(AttendanceStatus, { message: 'حالة الحضور غير صالحة' })
  status: AttendanceStatus;

  @ApiPropertyOptional({ description: 'سبب العذر — يُحفظ مع الغياب بعذر فقط' })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  note?: string;
}

export class RecordStaffAttendanceDto {
  @ApiProperty({ example: '2026-08-21' })
  @IsDateString({}, { message: 'التاريخ غير صالح' })
  date: string;

  @ApiProperty({ type: [StaffAttendanceEntryDto] })
  @IsArray()
  @ArrayMinSize(1, { message: 'يجب إدخال حضور موظف واحد على الأقل' })
  @ValidateNested({ each: true })
  @Type(() => StaffAttendanceEntryDto)
  entries: StaffAttendanceEntryDto[];
}

export class StaffSheetQueryDto {
  @ApiProperty({ example: '2026-08-21' })
  @IsDateString({}, { message: 'التاريخ غير صالح' })
  date: string;

  @ApiPropertyOptional({ enum: Role, description: 'تصفية الكشف حسب الدور' })
  @IsOptional()
  @IsEnum(Role)
  role?: Role;
}

export class QueryStaffAttendanceDto extends PaginationDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID('4')
  userId?: string;

  @ApiPropertyOptional({ enum: AttendanceStatus })
  @IsOptional()
  @IsEnum(AttendanceStatus)
  status?: AttendanceStatus;

  @ApiPropertyOptional({ enum: Role })
  @IsOptional()
  @IsEnum(Role)
  role?: Role;

  @ApiPropertyOptional({ example: '2026-08-01' })
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional({ example: '2026-08-31' })
  @IsOptional()
  @IsDateString()
  to?: string;
}
