import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class PaginationDto {
  @ApiPropertyOptional({ default: 1, description: 'رقم الصفحة' })
  @IsOptional()
  @Transform(({ value }) => parseInt(value, 10))
  @IsInt()
  @Min(1)
  page? = 1;

  @ApiPropertyOptional({ default: 20, maximum: 200, description: 'عدد العناصر في الصفحة' })
  @IsOptional()
  @Transform(({ value }) => parseInt(value, 10))
  @IsInt()
  @Min(1)
  @Max(200)
  limit? = 20;

  @ApiPropertyOptional({ description: 'كلمة البحث' })
  @IsOptional()
  @IsString()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  search?: string;

  @ApiPropertyOptional({ description: 'حقل الترتيب' })
  @IsOptional()
  @IsString()
  sortBy?: string;

  @ApiPropertyOptional({ enum: ['asc', 'desc'], default: 'desc' })
  @IsOptional()
  @IsIn(['asc', 'desc'])
  sortOrder?: 'asc' | 'desc' = 'desc';

  get skip(): number {
    return ((this.page || 1) - 1) * (this.limit || 20);
  }

  get take(): number {
    return this.limit || 20;
  }
}

export interface PaginatedResult<T> {
  data: T[];
  meta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPreviousPage: boolean;
  };
}

export function paginate<T>(data: T[], total: number, page = 1, limit = 20): PaginatedResult<T> {
  const totalPages = Math.max(1, Math.ceil(total / limit));
  return {
    data,
    meta: {
      total,
      page,
      limit,
      totalPages,
      hasNextPage: page < totalPages,
      hasPreviousPage: page > 1,
    },
  };
}

/**
 * Builds a Prisma `orderBy` object from user input while only allowing
 * a whitelist of sortable columns.
 */
export function buildOrderBy(
  sortBy: string | undefined,
  sortOrder: 'asc' | 'desc' = 'desc',
  allowed: string[],
  fallback: Record<string, any> = { createdAt: 'desc' },
): Record<string, any> {
  if (sortBy && allowed.includes(sortBy)) {
    return { [sortBy]: sortOrder };
  }
  return fallback;
}
