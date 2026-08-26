import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsArray,
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { PaginationDto } from '../../common/dto/pagination.dto';
import { PhoneField } from '../../common/validators/phone';
import { UsernameField } from '../../common/validators/username';

export class CreateParentDto {
  @UsernameField('اسم المستخدم لولي الأمر — يُستخدم لتسجيل الدخول')
  username: string;

  @ApiPropertyOptional({ example: 'parent01@alnoor-quran.sa', description: 'البريد الإلكتروني (اختياري)' })
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
  password: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty({ message: 'اسم ولي الأمر مطلوب' })
  @MaxLength(150)
  fullName: string;

  @PhoneField()
  phone?: string;

  @PhoneField('رقم جوال بديل')
  altPhone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(30)
  nationalId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(250)
  address?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  occupation?: string;

  @ApiPropertyOptional({ type: [String], description: 'ربط أبناء موجودين' })
  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  studentIds?: string[];
}

export class UpdateParentDto extends PartialType(CreateParentDto) {}

export class LinkStudentDto {
  @ApiProperty({ type: [String] })
  @IsArray()
  @IsUUID('4', { each: true, message: 'أحد معرّفات الطلاب غير صالح' })
  studentIds: string[];
}

export class QueryParentsDto extends PaginationDto {}
