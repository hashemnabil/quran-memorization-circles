import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEmail, IsOptional, IsString, MaxLength, ValidateIf } from 'class-validator';

/**
 * School information is entirely optional: a small mosque should be able to
 * save the settings page with nothing but a name, and clearing a field it
 * previously filled in must actually clear it. Empty strings are therefore
 * normalised to null rather than rejected.
 */
const blankToNull = ({ value }: { value: unknown }) =>
  typeof value === 'string' && value.trim() === '' ? null : value;

/** Skips the format check when the field was cleared. */
const filled = (o: Record<string, unknown>, key: string) =>
  o[key] !== null && o[key] !== undefined && o[key] !== '';

export class UpdateSettingsDto {
  @ApiPropertyOptional({ example: 'حلقات تحفيظ القرآن الكريم' })
  @IsOptional()
  @Transform(blankToNull)
  @IsString()
  @MaxLength(150)
  name?: string | null;

  @ApiPropertyOptional({ example: 'جامع النور' })
  @IsOptional()
  @Transform(blankToNull)
  @IsString()
  @MaxLength(150)
  mosqueName?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(blankToNull)
  @IsString()
  @MaxLength(500)
  logoUrl?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(blankToNull)
  @IsString()
  @MaxLength(30)
  phone?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(blankToNull)
  @ValidateIf((o) => filled(o, 'email'))
  @IsEmail({}, { message: 'البريد الإلكتروني غير صالح' })
  email?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(blankToNull)
  @IsString()
  @MaxLength(300)
  address?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(blankToNull)
  @IsString()
  @MaxLength(2000)
  about?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(blankToNull)
  @IsString()
  @MaxLength(300)
  facebook?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(blankToNull)
  @IsString()
  @MaxLength(300)
  twitter?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(blankToNull)
  @IsString()
  @MaxLength(300)
  instagram?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(blankToNull)
  @IsString()
  @MaxLength(300)
  youtube?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(blankToNull)
  @IsString()
  @MaxLength(300)
  telegram?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(blankToNull)
  @IsString()
  @MaxLength(30)
  whatsapp?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(blankToNull)
  @IsString()
  @MaxLength(300)
  website?: string | null;

  @ApiPropertyOptional({ example: '1447 هـ' })
  @IsOptional()
  @Transform(blankToNull)
  @IsString()
  @MaxLength(40)
  academicYear?: string | null;
}
