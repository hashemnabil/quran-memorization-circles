import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { Transform } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';
import { PaginationDto } from '../../common/dto/pagination.dto';

export class CreateAnnouncementDto {
  @ApiProperty({ example: 'افتتاح دورة أحكام التجويد' })
  @IsString()
  @IsNotEmpty({ message: 'عنوان الإعلان مطلوب' })
  @MaxLength(200)
  title: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  body?: string;

  /**
   * Either a path inside the app (`/courses`) or an outside address
   * (`https://...`), which the bar opens in a new tab.
   *
   * The pattern is the security boundary, not decoration: an announcement is a
   * link the whole school clicks, so `javascript:`, `data:` and protocol-
   * relative `//host` forms are all refused. Only administrators publish, but
   * that is a reason to keep the check, not to drop it.
   */
  @ApiPropertyOptional({
    example: 'https://example.org/news',
    description: 'مسار داخلي يبدأ بـ / أو رابط خارجي يبدأ بـ http(s)://',
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  @Matches(/^(\/(?!\/)[A-Za-z0-9\-_/?=&.%#]*|https?:\/\/[^\s]+)$/i, {
    message: 'الرابط يجب أن يكون مساراً داخلياً يبدأ بـ / أو رابطاً خارجياً يبدأ بـ http:// أو https://',
  })
  link?: string;

  @ApiPropertyOptional({
    enum: Role,
    isArray: true,
    description: 'الفئات المستهدفة — اتركها فارغة ليظهر الإعلان للجميع',
  })
  @IsOptional()
  @IsArray()
  @IsEnum(Role, { each: true, message: 'إحدى الفئات المحددة غير صالحة' })
  audience?: Role[];

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({ description: 'تاريخ انتهاء عرض الإعلان' })
  @IsOptional()
  @IsDateString({}, { message: 'تاريخ الانتهاء غير صالح' })
  expiresAt?: string;
}

export class UpdateAnnouncementDto extends PartialType(CreateAnnouncementDto) {}

export class QueryAnnouncementsDto extends PaginationDto {
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  isActive?: boolean;
}
