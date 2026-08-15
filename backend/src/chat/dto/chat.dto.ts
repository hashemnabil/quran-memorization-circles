import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import { PaginationDto } from '../../common/dto/pagination.dto';

export class CreateDirectConversationDto {
  @ApiProperty({ description: 'معرّف المستخدم الآخر' })
  @IsUUID('4', { message: 'معرّف المستخدم غير صالح' })
  userId: string;
}

export class CreateGroupConversationDto {
  @ApiProperty({ example: 'معلمو حلقة الفرقان' })
  @IsString()
  @IsNotEmpty({ message: 'اسم المجموعة مطلوب' })
  @MaxLength(120)
  title: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @ApiProperty({ type: [String] })
  @IsArray()
  @ArrayMinSize(1, { message: 'يجب اختيار عضو واحد على الأقل' })
  @IsUUID('4', { each: true, message: 'أحد معرّفات الأعضاء غير صالح' })
  memberIds: string[];
}

export class SendMessageDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty({ message: 'نص الرسالة مطلوب' })
  @MaxLength(4000)
  body: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  attachmentUrl?: string;
}

export class AddMembersDto {
  @ApiProperty({ type: [String] })
  @IsArray()
  @ArrayMinSize(1)
  @IsUUID('4', { each: true })
  memberIds: string[];
}

export class EditMessageDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty({ message: 'نص الرسالة مطلوب' })
  @MaxLength(4000)
  body: string;
}

export class UpdateConversationDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @IsNotEmpty({ message: 'اسم المجموعة مطلوب' })
  @MaxLength(120)
  title?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @ApiPropertyOptional({ description: 'إغلاق المجموعة: قراءة فقط دون رسائل جديدة' })
  @IsOptional()
  @IsBoolean()
  isClosed?: boolean;

  @ApiPropertyOptional({ description: 'قصر الإرسال على مشرفي المجموعة' })
  @IsOptional()
  @IsBoolean()
  adminOnly?: boolean;
}

export class SetMemberAdminDto {
  @ApiProperty({ description: 'true لترقية العضو مشرفاً، false لإزالة الإشراف' })
  @IsBoolean()
  isAdmin: boolean;
}

export class QueryMessagesDto extends PaginationDto {}
