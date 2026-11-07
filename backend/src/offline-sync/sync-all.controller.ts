import { BadRequestException, Body, Controller, Get, Post, Query } from '@nestjs/common';
import { CurrentUser, AuthUser } from '../common/decorators';
import { FullSyncService } from './sync-all.service';

@Controller('sync-all')
export class FullSyncController {
  constructor(private readonly service: FullSyncService) {}
  @Get('watermark')
  watermark() { return this.service.watermark(); }
  @Get('delta')
  delta(@CurrentUser() user: AuthUser, @Query('since') since = '0', @Query('communication') communication = '0', @Query('support') support = '0') {
    if (!['0','1'].includes(communication)) throw new BadRequestException('إصدار مزامنة غير صالح');
    if (!['0','1'].includes(support)) throw new BadRequestException('إصدار مزامنة غير صالح');
    return this.service.delta(user, since, communication === '1', support === '1');
  }
  @Get()
  pull(@CurrentUser() user: AuthUser, @Query('table') table: string, @Query('page') page = '1') {
    if (!/^\d+$/.test(page) || !Number.isSafeInteger(Number(page)) || Number(page) < 1) throw new BadRequestException('صفحة غير صالحة');
    return this.service.pull(user, table, Number(page));
  }
  @Post()
  push(@CurrentUser() user: AuthUser, @Body() body: unknown) { return this.service.push(user, body); }
}
