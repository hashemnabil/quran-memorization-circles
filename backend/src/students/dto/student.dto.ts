import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Evaluation, Gender, StudentStatus } from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
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
  @IsInt()
  @Min(0)
  @Max(30)
  memorizedParts?: number;

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
  @IsString()
  @MaxLength(2000)
  notes?: string;
}

export class UpdateStudentDto extends PartialType(CreateStudentDto) {}

export class QueryStudentsDto extends PaginationDto {
  @ApiPropertyOptional({ enum: StudentStatus })
  @IsOptional()
  @IsEnum(StudentStatus)
  status?: StudentStatus;

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

export class AddNoteDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty({ message: 'نص الملاحظة مطلوب' })
  @MaxLength(2000)
  body: string;

  @ApiPropertyOptional({ description: 'ملاحظة داخلية لا تظهر لولي الأمر' })
  @IsOptional()
  @IsBoolean()
  isPrivate?: boolean;
}
