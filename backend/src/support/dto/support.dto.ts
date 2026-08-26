import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { TicketPriority, TicketStatus } from '@prisma/client';
import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import { PaginationDto } from '../../common/dto/pagination.dto';
import { PhoneField } from '../../common/validators/phone';

/**
 * The "contact technical support" form on the login page.
 *
 * Someone who cannot sign in is exactly the person who most needs support, so
 * this ticket has no author. Contact details are collected instead, because
 * otherwise there would be no way to reply.
 */
export class PublicTicketDto {
  @ApiProperty({ example: 'أحمد محمد' })
  @IsString()
  @IsNotEmpty({ message: 'الاسم مطلوب' })
  @MaxLength(120)
  contactName: string;

  @PhoneField('رقم الجوال للتواصل')
  contactPhone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(({ value }) =>
    typeof value === 'string' ? value.toLowerCase().trim() || null : value,
  )
  @IsEmail({}, { message: 'البريد الإلكتروني غير صالح' })
  @MaxLength(160)
  contactEmail?: string | null;

  @ApiProperty({ example: 'لا أستطيع تسجيل الدخول' })
  @IsString()
  @IsNotEmpty({ message: 'الموضوع مطلوب' })
  @MaxLength(200)
  subject: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty({ message: 'وصف المشكلة مطلوب' })
  @MaxLength(2000)
  description: string;
}

export class CreateTicketDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty({ message: 'عنوان الطلب مطلوب' })
  @MaxLength(200)
  subject: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty({ message: 'وصف المشكلة مطلوب' })
  @MaxLength(4000)
  description: string;

  @ApiPropertyOptional({ example: 'مشكلة تقنية' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  category?: string;

  @ApiPropertyOptional({ enum: TicketPriority })
  @IsOptional()
  @IsEnum(TicketPriority)
  priority?: TicketPriority;
}

export class ReplyTicketDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty({ message: 'نص الرد مطلوب' })
  @MaxLength(4000)
  body: string;

  @ApiPropertyOptional({ description: 'ملاحظة داخلية بين موظفي الدعم فقط' })
  @IsOptional()
  isInternal?: boolean;
}

export class UpdateTicketDto {
  @ApiPropertyOptional({ enum: TicketStatus })
  @IsOptional()
  @IsEnum(TicketStatus)
  status?: TicketStatus;

  @ApiPropertyOptional({ enum: TicketPriority })
  @IsOptional()
  @IsEnum(TicketPriority)
  priority?: TicketPriority;

  @ApiPropertyOptional({ description: 'اتركه فارغاً لإلغاء الإسناد' })
  @IsOptional()
  @IsUUID('4')
  assignedToId?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(80)
  category?: string;
}

export class QueryTicketsDto extends PaginationDto {
  @ApiPropertyOptional({ enum: TicketStatus })
  @IsOptional()
  @IsEnum(TicketStatus)
  status?: TicketStatus;

  @ApiPropertyOptional({ enum: TicketPriority })
  @IsOptional()
  @IsEnum(TicketPriority)
  priority?: TicketPriority;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID('4')
  assignedToId?: string;

  @ApiPropertyOptional({ description: 'تذاكري فقط' })
  @IsOptional()
  @IsString()
  mine?: string;
}
