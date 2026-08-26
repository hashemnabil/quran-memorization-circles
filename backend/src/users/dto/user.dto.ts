import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayNotEmpty,
  IsArray,
  IsBoolean,
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { PaginationDto } from '../../common/dto/pagination.dto';
import { PhoneField } from '../../common/validators/phone';
import { UsernameField } from '../../common/validators/username';

export class CreateUserDto {
  @UsernameField()
  username: string;

  /**
   * Optional contact address only — accounts are created for mosque staff who
   * often do not have one, so it is never required and never used to sign in.
   */
  @ApiPropertyOptional({ example: 'teacher01@alnoor-quran.sa', description: 'البريد الإلكتروني (اختياري)' })
  @IsOptional()
  @Transform(({ value }) =>
    typeof value === 'string' ? value.toLowerCase().trim() || null : value,
  )
  @IsEmail({}, { message: 'البريد الإلكتروني غير صالح' })
  @MaxLength(160)
  email?: string | null;

  @ApiProperty({ minLength: 6 })
  @IsString()
  @MinLength(6, { message: 'كلمة المرور يجب أن تكون 6 أحرف على الأقل' })
  @MaxLength(128)
  password: string;

  @ApiProperty({ example: 'أحمد محمد' })
  @IsString()
  @IsNotEmpty({ message: 'الاسم الكامل مطلوب' })
  @MaxLength(120)
  fullName: string;

  @ApiProperty({ enum: Role })
  @IsEnum(Role, { message: 'الدور المحدد غير صالح' })
  role: Role;

  @PhoneField()
  phone?: string;

  @ApiPropertyOptional({ description: 'المسمى الوظيفي — يظهر في دليل الكادر' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  jobTitle?: string;

  @ApiPropertyOptional({ description: 'التخصص' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  specialization?: string;

  @ApiPropertyOptional({ description: 'رابط الصورة الشخصية' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  avatarUrl?: string;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateUserDto extends PartialType(CreateUserDto) {}

export class ResetPasswordDto {
  @ApiProperty({ minLength: 6 })
  @IsString()
  @MinLength(6, { message: 'كلمة المرور يجب أن تكون 6 أحرف على الأقل' })
  @MaxLength(128)
  newPassword: string;

}

/**
 * Bulk delete. The client sends explicit ids even when the user ticked
 * "select all" — a filter sent as "delete everything matching this" is one
 * mis-typed query away from emptying the table.
 */
export class BulkIdsDto {
  @ApiProperty({ type: [String], description: 'معرّفات السجلات المحدّدة' })
  @IsArray()
  @ArrayNotEmpty({ message: 'لم يتم تحديد أي سجل' })
  @ArrayMaxSize(500, { message: 'لا يمكن حذف أكثر من 500 سجل في عملية واحدة' })
  @IsString({ each: true })
  @Type(() => String)
  ids: string[];
}

export class QueryUsersDto extends PaginationDto {
  @ApiPropertyOptional({ enum: Role })
  @IsOptional()
  @IsEnum(Role)
  role?: Role;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  isActive?: boolean;
}

/** Unified staff directory: everyone who works at the school, in one list. */
export class QueryStaffDto extends PaginationDto {
  @ApiPropertyOptional({ enum: Role, description: 'تصفية حسب الدور داخل الكادر' })
  @IsOptional()
  @IsEnum(Role)
  role?: Role;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  isActive?: boolean;
}
