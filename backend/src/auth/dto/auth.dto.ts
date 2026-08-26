import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEmail, IsNotEmpty, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { normalizeUsername } from '../../common/validators/username';
import { PhoneField } from '../../common/validators/phone';

export class LoginDto {
  @ApiProperty({ example: 'admin', description: 'اسم المستخدم' })
  @Transform(({ value }) => normalizeUsername(value))
  @IsString()
  @IsNotEmpty({ message: 'اسم المستخدم مطلوب' })
  @MaxLength(32)
  username: string;

  @ApiProperty({ example: 'Pass@1234' })
  @IsString()
  @IsNotEmpty({ message: 'كلمة المرور مطلوبة' })
  @MaxLength(128)
  password: string;
}

export class RefreshDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  refreshToken: string;
}

export class ChangePasswordDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty({ message: 'كلمة المرور الحالية مطلوبة' })
  currentPassword: string;

  @ApiProperty({ minLength: 6 })
  @IsString()
  @MinLength(6, { message: 'كلمة المرور الجديدة يجب أن تكون 6 أحرف على الأقل' })
  @MaxLength(128)
  newPassword: string;
}

export class UpdateProfileDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  fullName?: string;

  @ApiPropertyOptional({ description: 'البريد الإلكتروني (اختياري — ليس وسيلة الدخول)' })
  @IsOptional()
  @Transform(({ value }) =>
    typeof value === 'string' ? value.toLowerCase().trim() || null : value,
  )
  @IsEmail({}, { message: 'البريد الإلكتروني غير صالح' })
  @MaxLength(160)
  email?: string | null;

  @PhoneField()
  phone?: string;

  @ApiPropertyOptional({ description: 'رابط الصورة الشخصية' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  avatarUrl?: string;
}
