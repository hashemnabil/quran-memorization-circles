import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { MediaActivityType, Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser } from '../common/decorators';

@Injectable()
export class MediaActivitiesService {
  constructor(private readonly prisma: PrismaService) {}

  list() {
    return this.prisma.mediaActivity.findMany({
      include: { createdBy: { select: { fullName: true } } },
      orderBy: [{ activityDate: 'desc' }, { createdAt: 'desc' }],
      take: 500,
    });
  }

  async create(user: AuthUser, body: { type?: MediaActivityType; title?: string; description?: string; activityDate?: string; workUrl?: string }) {
    if (![Role.ADMIN, Role.SUPERVISOR].includes(user.role as Role)) {
      throw new BadRequestException('لا تملك صلاحية إضافة نشاط إعلامي');
    }
    if (!body.title?.trim() || !body.description?.trim() || !body.activityDate ||
        !Object.values(MediaActivityType).includes(body.type as MediaActivityType)) {
      throw new BadRequestException('نوع النشاط والعنوان والتفاصيل والتاريخ حقول مطلوبة');
    }
    const date = new Date(body.activityDate);
    if (Number.isNaN(date.getTime())) throw new BadRequestException('التاريخ غير صحيح');
    if (body.workUrl?.trim()) {
      try { new URL(body.workUrl); } catch { throw new BadRequestException('رابط العمل غير صحيح'); }
    }
    return this.prisma.mediaActivity.create({
      data: {
        type: body.type!, title: body.title.trim(), description: body.description.trim(),
        activityDate: date, workUrl: body.workUrl?.trim() || null, createdById: user.id,
      },
      include: { createdBy: { select: { fullName: true } } },
    });
  }

  async remove(id: string) {
    const found = await this.prisma.mediaActivity.findUnique({ where: { id }, select: { id: true } });
    if (!found) throw new NotFoundException('النشاط غير موجود');
    return this.prisma.mediaActivity.delete({ where: { id } });
  }
}
