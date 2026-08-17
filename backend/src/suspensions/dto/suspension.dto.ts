import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { RequestStatus } from '@prisma/client';
import {
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import { PaginationDto } from '../../common/dto/pagination.dto';

export class CreateSuspensionDto {
  @ApiProperty()
  @IsUUID('4', { message: 'معرّف الطالب غير صالح' })
  studentId: string;

  @ApiProperty({ example: 'يحتاج إلى الانقطاع عن الحلقة' })
  @IsString()
  @IsNotEmpty({ message: 'سبب الفصل مطلوب' })
  @MaxLength(1000)
  reason: string;
}

export class DecideSuspensionDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  decisionNote?: string;
}

export class ReturnStudentDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;
}

export class QuerySuspensionsDto extends PaginationDto {
  @ApiPropertyOptional({ enum: RequestStatus })
  @IsOptional()
  @IsEnum(RequestStatus)
  status?: RequestStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID('4')
  studentId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID('4')
  circleId?: string;

  @ApiPropertyOptional({ description: 'الإيقافات السارية فقط' })
  @IsOptional()
  @IsString()
  activeOnly?: string;
}
