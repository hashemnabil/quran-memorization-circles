import { NotificationType } from '@prisma/client';
import { Transform } from 'class-transformer';
import { IsBoolean, IsEnum, IsOptional } from 'class-validator';
import { PaginationDto } from '../common/dto/pagination.dto';

export class QueryNotificationsDto extends PaginationDto {
  @IsOptional()
  @Transform(({value}) => value === 'true' ? true : value === 'false' ? false : value)
  @IsBoolean()
  unreadOnly?: boolean;

  @IsOptional()
  @IsEnum(NotificationType)
  type?: NotificationType;
}
