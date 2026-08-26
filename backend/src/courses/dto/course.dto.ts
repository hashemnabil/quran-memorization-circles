import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { AttendanceStatus, CourseType } from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayNotEmpty,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { PaginationDto } from '../../common/dto/pagination.dto';

export class CreateCourseDto {
  @ApiProperty({ example: 'دورة أحكام التجويد للمبتدئين' })
  @IsString()
  @IsNotEmpty({ message: 'اسم الدورة مطلوب' })
  @MaxLength(150)
  name: string;

  @ApiPropertyOptional({ description: 'رمز الدورة، يُولَّد تلقائياً إذا تُرك فارغاً' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  code?: string;

  @ApiProperty({ enum: CourseType, description: 'دورات شرعية أو أحكام التجويد' })
  @IsEnum(CourseType, { message: 'نوع الدورة غير صالح' })
  type: CourseType;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  /** Either a system account or a plain name — many lecturers are guests. */
  @ApiPropertyOptional({ description: 'حساب المحاضر في النظام' })
  @IsOptional()
  @IsUUID('4', { message: 'معرّف المحاضر غير صالح' })
  instructorId?: string;

  @ApiPropertyOptional({ description: 'اسم المحاضر إن لم يكن له حساب' })
  @IsOptional()
  @IsString()
  @MaxLength(150)
  instructorName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(150)
  location?: string;

  @ApiPropertyOptional({ example: '2026-09-01' })
  @IsOptional()
  @IsDateString({}, { message: 'تاريخ البداية غير صالح' })
  startDate?: string;

  @ApiPropertyOptional({ example: '2026-10-01' })
  @IsOptional()
  @IsDateString({}, { message: 'تاريخ النهاية غير صالح' })
  endDate?: string;

  @ApiPropertyOptional({ type: [String], example: ['SUNDAY', 'TUESDAY'] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  scheduleDays?: string[];

  @ApiPropertyOptional({ example: '17:00' })
  @IsOptional()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, { message: 'صيغة وقت البداية غير صالحة (HH:MM)' })
  startTime?: string;

  @ApiPropertyOptional({ example: '18:30' })
  @IsOptional()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, { message: 'صيغة وقت النهاية غير صالحة (HH:MM)' })
  endTime?: string;

  @ApiPropertyOptional({ default: 30 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(500)
  capacity?: number;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateCourseDto extends PartialType(CreateCourseDto) {}

export class QueryCoursesDto extends PaginationDto {
  @ApiPropertyOptional({ enum: CourseType })
  @IsOptional()
  @IsEnum(CourseType)
  type?: CourseType;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({ description: 'الدورات التي يحاضر فيها مستخدم محدد' })
  @IsOptional()
  @IsUUID('4')
  instructorId?: string;

  @ApiPropertyOptional({ description: 'الدورات التي يشارك فيها طالب محدد' })
  @IsOptional()
  @IsUUID('4')
  studentId?: string;
}

export class EnrollStudentsDto {
  @ApiProperty({ type: [String], description: 'معرّفات الطلاب' })
  @IsArray()
  @ArrayNotEmpty({ message: 'لم يتم تحديد أي طالب' })
  @ArrayMaxSize(200)
  @IsUUID('4', { each: true, message: 'أحد معرّفات الطلاب غير صالح' })
  studentIds: string[];
}

export class CourseAttendanceEntryDto {
  @ApiProperty()
  @IsUUID('4', { message: 'معرّف الطالب غير صالح' })
  studentId: string;

  @ApiProperty({ enum: AttendanceStatus })
  @IsEnum(AttendanceStatus, { message: 'حالة الحضور غير صالحة' })
  status: AttendanceStatus;

  @ApiPropertyOptional({ description: 'سبب العذر — يُحفظ مع الغياب بعذر فقط' })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  note?: string;
}

export class RecordCourseAttendanceDto {
  @ApiProperty({ example: '2026-09-05' })
  @IsDateString({}, { message: 'التاريخ غير صالح' })
  date: string;

  @ApiProperty({ type: [CourseAttendanceEntryDto] })
  @IsArray()
  @ArrayMinSize(1, { message: 'يجب إدخال حضور طالب واحد على الأقل' })
  @ValidateNested({ each: true })
  @Type(() => CourseAttendanceEntryDto)
  entries: CourseAttendanceEntryDto[];
}

export class CourseAttendanceQueryDto {
  @ApiProperty({ example: '2026-09-05' })
  @IsDateString({}, { message: 'التاريخ غير صالح' })
  date: string;
}

export class BulkCourseIdsDto {
  @ApiProperty({ type: [String] })
  @IsArray()
  @ArrayNotEmpty({ message: 'لم يتم تحديد أي دورة' })
  @ArrayMaxSize(200)
  @IsString({ each: true })
  @Type(() => String)
  ids: string[];
}
