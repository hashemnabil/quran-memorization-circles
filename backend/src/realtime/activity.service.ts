import { BadRequestException, Body, Controller, Get, Injectable, Patch } from '@nestjs/common';
import { AuthUser, CurrentUser } from '../common/decorators';
import { PrismaService } from '../prisma/prisma.service';

type Activity = { userId: string; hidden: boolean; lastActiveAt: Date | null };

@Injectable()
export class ActivityService {
  private readonly recorded = new Map<string, number>();
  constructor(private readonly prisma: PrismaService) {}

  async read(userIds: string[]): Promise<Map<string, Activity>> {
    if (!userIds.length) return new Map();
    try {
      const rows = await this.prisma.$queryRaw<Activity[]>`SELECT "userId", "hidden", "lastActiveAt" FROM "user_activity" WHERE "userId" = ANY(${userIds}::text[])`;
      const indexed = new Map(rows.map(row => [row.userId, row]));
      return new Map(userIds.map(id => [id, indexed.get(id) ?? {userId: id, hidden: false, lastActiveAt: null}]));
    } catch {
      // During a rolling migration or database outage, never reveal presence.
      return new Map(userIds.map(id => [id, {userId: id, hidden: true, lastActiveAt: null}]));
    }
  }

  async touch(userId: string) {
    const now = Date.now();
    if (now - (this.recorded.get(userId) ?? 0) < 30_000) return;
    await this.prisma.$executeRaw`INSERT INTO "user_activity" ("userId", "lastActiveAt") VALUES (${userId}, NOW()) ON CONFLICT ("userId") DO UPDATE SET "lastActiveAt" = NOW()`;
    this.recorded.set(userId, now);
    if (this.recorded.size > 10_000) for (const [id, at] of this.recorded) if (now - at > 120_000) this.recorded.delete(id);
  }

  async setHidden(userId: string, hidden: boolean) {
    if (typeof hidden !== 'boolean') throw new BadRequestException('خيار الخصوصية غير صالح');
    await this.prisma.$executeRaw`INSERT INTO "user_activity" ("userId", "hidden") VALUES (${userId}, ${hidden}) ON CONFLICT ("userId") DO UPDATE SET "hidden" = ${hidden}`;
    return {hidden};
  }
}

@Controller('activity')
export class ActivityController {
  constructor(private readonly activity: ActivityService) {}
  @Get('privacy')
  async privacy(@CurrentUser() user: AuthUser) {
    return {hidden: (await this.activity.read([user.id])).get(user.id)?.hidden ?? true};
  }
  @Patch('privacy')
  update(@CurrentUser() user: AuthUser, @Body('hidden') hidden: boolean) {
    return this.activity.setHidden(user.id, hidden);
  }
}
