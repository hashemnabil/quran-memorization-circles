import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { TicketPriority, TicketStatus } from '@prisma/client';
import {
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import { PaginationDto } from '../../common/dto/pagination.dto';

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
