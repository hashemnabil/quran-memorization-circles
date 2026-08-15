import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEmail, IsNotEmpty, IsString, MaxLength, MinLength } from 'class-validator';

/** Shared normalisation so `Admin@X.com ` and `admin@x.com` are the same account. */
const normalizeEmail = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.toLowerCase().trim() : value;

export class LoginDto {
  @ApiProperty({ example: 'admin@qcircles.local' })
  @Transform(normalizeEmail)
  @IsEmail({}, { message: 'البريد الإلكتروني غير صالح' })
  @MaxLength(160)
  email: string;

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
  @ApiProperty({ required: false })
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  fullName?: string;
}
