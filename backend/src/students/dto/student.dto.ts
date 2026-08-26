import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Evaluation, Gender, StudentStatus } from '@prisma/client';
import { Transform, Type } from 'class-transformer';
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
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { PaginationDto } from '../../common/dto/pagination.dto';
import { PhoneField } from '../../common/validators/phone';

export class CreateStudentDto {
  @ApiProperty({ example: 'عبدالله محمد أحمد' })
  @IsString()
  @IsNotEmpty({ message: 'اسم الطالب مطلوب' })
  @MaxLength(150)
  fullName: string;

  @ApiPropertyOptional({ description: 'رمز الطالب، يُولَّد تلقائياً إذا تُرك فارغاً' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  code?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString({}, { message: 'تاريخ الميلاد غير صالح' })
  birthDate?: string;

  @ApiPropertyOptional({ enum: Gender })
  @IsOptional()
  @IsEnum(Gender)
  gender?: Gender;

  @ApiPropertyOptional({ description: 'رقم هوية الطالب' })
  @IsOptional()
  @IsString()
  @MaxLength(30)
  nationalId?: string;

  @ApiPropertyOptional({ description: 'رقم هوية الأب' })
  @IsOptional()
  @IsString()
  @MaxLength(30)
  fatherNationalId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(250)
  address?: string;

  @PhoneField('جوال الطالب')
  phone?: string;

  @ApiPropertyOptional({ description: 'ربط الطالب بحساب ولي أمر موجود' })
  @IsOptional()
  @IsUUID('4', { message: 'معرّف ولي الأمر غير صالح' })
  parentId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(150)
  guardianName?: string;

  @PhoneField('جوال ولي الأمر')
  guardianPhone?: string;

  @ApiPropertyOptional({ example: 'الأب' })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  guardianRelation?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID('4', { message: 'معرّف الحلقة غير صالح' })
  circleId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  enrollmentDate?: string;

  @ApiPropertyOptional({ enum: StudentStatus })
  @IsOptional()
  @IsEnum(StudentStatus)
  status?: StudentStatus;

  @ApiPropertyOptional({ minimum: 0, maximum: 30 })
  @IsOptional()
  @Type(() => Number)
  // Halves are real: an exam may cover an odd number of ahzab, and the total is
  // ahzab / 2.
  @IsNumber({ maxDecimalPlaces: 2 }, { message: 'الأجزاء المحفوظة غير صالحة' })
  @Min(0)
  @Max(30)
  memorizedParts?: number;

  @ApiPropertyOptional({ description: 'رابط صورة الطالب' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  photoUrl?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(80)
  currentSurah?: string;

  @ApiPropertyOptional({ minimum: 1, maximum: 604 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(604)
  currentPage?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString({ message: 'الملاحظات يجب أن تكون نصاً' })
  @MaxLength(2000, { message: 'الملاحظات يجب ألا تتجاوز 2000 حرف' })
  notes?: string;
}

export class UpdateStudentDto extends PartialType(CreateStudentDto) {}

/**
 * Which part of the school a student belongs to. The unified profile lists all
 * of them together; this narrows the same list without needing a second page.
 */
export enum StudentTrack {
  /// مسجّل في حلقة تحفيظ
  CIRCLE = 'CIRCLE',
  /// مسجّل في دورة تعليمية
  COURSE = 'COURSE',
  /// برنامج النشاط — خارج الحلقات
  ACTIVITY = 'ACTIVITY',
  /// موقوف مؤقتاً
  SUSPENDED = 'SUSPENDED',
}

export class QueryStudentsDto extends PaginationDto {
  @ApiPropertyOptional({ enum: StudentStatus })
  @IsOptional()
  @IsEnum(StudentStatus)
  status?: StudentStatus;

  @ApiPropertyOptional({ enum: StudentTrack, description: 'تصفية السجل الموحّد حسب المسار' })
  @IsOptional()
  @IsEnum(StudentTrack)
  track?: StudentTrack;

  @ApiPropertyOptional({ description: 'الطلاب المسجلون في دورة محددة' })
  @IsOptional()
  @IsUUID('4')
  courseId?: string;

  @ApiPropertyOptional({ enum: Evaluation })
  @IsOptional()
  @IsEnum(Evaluation)
  evaluation?: Evaluation;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID('4')
  circleId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID('4')
  parentId?: string;

  @ApiPropertyOptional({ description: 'الطلاب غير المسجلين في أي حلقة' })
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  unassigned?: boolean;
}

export class SetEvaluationDto {
  @ApiProperty({ enum: Evaluation })
  @IsEnum(Evaluation, { message: 'التقييم المحدد غير صالح' })
  evaluation: Evaluation;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

export class BulkStudentIdsDto {
  @ApiProperty({ type: [String] })
  @IsArray()
  @ArrayNotEmpty({ message: 'لم يتم تحديد أي طالب' })
  @ArrayMaxSize(500, { message: 'لا يمكن حذف أكثر من 500 سجل في عملية واحدة' })
  @IsString({ each: true })
  @Type(() => String)
  ids: string[];
}

/** Awards the bonus points for finishing a surah. */
export class SurahCompletionDto {
  @ApiProperty({ example: 'البقرة' })
  @IsString()
  @IsNotEmpty({ message: 'اسم السورة مطلوب' })
  @MaxLength(80)
  surah: string;

  @ApiPropertyOptional({ description: 'النقاط الممنوحة — تُستخدم القيمة الافتراضية إذا تُركت فارغة' })
  @IsOptional()
  @Type(() => Number)
  @Min(0)
  @Max(1000)
  points?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(300)
  note?: string;
}

export class AddNoteDto {
  @ApiProperty()
  @IsString({ message: 'نص الملاحظة يجب أن يكون نصاً' })
  @IsNotEmpty({ message: 'نص الملاحظة مطلوب' })
  @MaxLength(2000, { message: 'نص الملاحظة يجب ألا يتجاوز 2000 حرف' })
  body: string;

  @ApiPropertyOptional({ description: 'ملاحظة داخلية لا تظهر لولي الأمر' })
  @IsOptional()
  @IsBoolean()
  isPrivate?: boolean;
}

/** Body of `PATCH /students/:id/photo`. An empty string removes the picture. */
export class SetStudentPhotoDto {
  @ApiPropertyOptional({ description: 'رابط الصورة — اتركه فارغاً لإزالتها' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  photoUrl?: string;
}
