import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser, AuthUser } from '../common/decorators';
import { OfflineSyncService } from './offline-sync.service';

@ApiTags('المزامنة دون إنترنت')
@ApiBearerAuth()
@Controller('offline-sync')
export class OfflineSyncController {
  constructor(private readonly service: OfflineSyncService) {}

  @Get('bootstrap')
  @ApiOperation({ summary: 'حزمة أولية مجزأة ومحدودة بصلاحيات الحساب الحالي' })
  bootstrap(
    @CurrentUser() user: AuthUser,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string,
  ) {
    return this.service.bootstrap(user, cursor, limit === undefined ? 200 : Number(limit));
  }
}
