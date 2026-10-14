import { BadRequestException, Body, Controller, Get, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser, AuthUser } from '../common/decorators';
import { OfflineSyncService } from './offline-sync.service';

@ApiTags('المزامنة العامة')
@ApiBearerAuth()
@Controller('sync')
export class SyncController {
  constructor(private readonly service: OfflineSyncService) {}

  @Get('snapshot')
  @ApiOperation({ summary: 'لقطة أولية ضمن صلاحيات الحساب' })
  snapshot(@CurrentUser() user: AuthUser, @Query('cursor') cursor?: string, @Query('limit') limit?: string) {
    const size = limit === undefined ? 200 : Number(limit);
    if (!Number.isInteger(size) || size < 1 || size > 200) throw new BadRequestException('حجم الصفحة غير صالح');
    return this.service.bootstrap(user, cursor, size);
  }

  @Get('changes')
  @ApiOperation({ summary: 'تغييرات مرتبة بالتسلسل منذ seq' })
  changes(@CurrentUser() user: AuthUser, @Query('since') since = '0', @Query('limit') limit = '200') {
    const size = Number(limit);
    // Avoid precision loss for PostgreSQL BIGINT sequence cursors.
    if (!/^(0|[1-9]\\d*)$/.test(since) || since.length > 19) {
      throw new BadRequestException('مؤشر المزامنة غير صالح');
    }
    const seq = BigInt(since);
    if (seq > 9223372036854775807n) throw new BadRequestException('مؤشر المزامنة غير صالح');
    if (!/^\\d+$/.test(limit) || !Number.isSafeInteger(size) || size < 1 || size > 200) throw new BadRequestException('حجم الصفحة غير صالح');
    return this.service.syncChanges(user, seq, size);
  }

  @Post('push')
  @ApiOperation({ summary: 'استقبال عمليات محلية مع مفتاح idempotency' })
  push(@CurrentUser() user: AuthUser, @Body() body: unknown) {
    return this.service.pushOperations(user, body);
  }
}
