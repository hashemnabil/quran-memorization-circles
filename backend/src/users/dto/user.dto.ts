import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { Transform } from 'class-transformer';
import {
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

export class CreateUserDto {
  @ApiProperty({ example: 'teacher01@qcircles.local', description: 'البريد الإلكتروني — يُستخدم لتسجيل الدخول' })
  @Transform(({ value }) => (typeof value === 'string' ? value.toLowerCase().trim() : value))
  @IsEmail({}, { message: 'البريد الإلكتروني غير صالح' })
  @MaxLength(160)
  email: string;

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

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateUserDto extends PartialType(CreateUserDto) {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  avatarUrl?: string;
}

export class ResetPasswordDto {
  @ApiProperty({ minLength: 6 })
  @IsString()
  @MinLength(6, { message: 'كلمة المرور يجب أن تكون 6 أحرف على الأقل' })
  @MaxLength(128)
  newPassword: string;

  @ApiPropertyOptional({ description: 'إجبار المستخدم على تغيير كلمة المرور عند أول دخول' })
  @IsOptional()
  @IsBoolean()
  mustChangePassword?: boolean;
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
