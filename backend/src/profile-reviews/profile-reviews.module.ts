import { BadRequestException, Body, Controller, Get, Module, Param, Patch, Post, Query } from '@nestjs/common';
import { Role } from '@prisma/client';
import { AuthUser, CurrentUser, Roles } from '../common/decorators';
import { ProfileReviewsService } from './profile-reviews.service';

@Controller('profile-reviews')
class ProfileReviewsController {
  constructor(private readonly service: ProfileReviewsService) {}
  @Get('me') @Roles(Role.STUDENT, Role.TEACHER)
  mine(@CurrentUser() user: AuthUser) { return this.service.mine(user); }
  @Get() @Roles(Role.ADMIN, Role.STUDENT, Role.TEACHER)
  list(@CurrentUser() user: AuthUser, @Query('kind') kind?: string, @Query('page') page = '1') {
    if (!/^\d+$/.test(page) || Number(page) < 1 || Number(page) > 100000) throw new BadRequestException('الصفحة غير صالحة');
    return this.service.list(user, kind, Number(page));
  }
  @Post() @Roles(Role.STUDENT, Role.TEACHER)
  submit(@CurrentUser() user: AuthUser, @Body() body: { patch: Record<string, unknown> }) { return this.service.submit(user, body.patch); }
  @Patch(':id/decision') @Roles(Role.ADMIN)
  decide(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() body: { status: string; reason?: string }) { return this.service.decide(user, id, body.status, body.reason); }
}
@Module({ controllers: [ProfileReviewsController], providers: [ProfileReviewsService] })
export class ProfileReviewsModule {}
