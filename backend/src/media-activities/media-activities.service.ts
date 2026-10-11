import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { MediaActivityType, Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser } from '../common/decorators';

@Injectable()
export class MediaActivitiesService {
  constructor(private readonly prisma: PrismaService) {}

  list(from?: string, to?: string) {
    const where: { activityDate?: { gte?: Date; lte?: Date } } = {};
    if (from || to) {
      where.activityDate = {};
      if (from) {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || Number.isNaN(Date.parse(`${from}T00:00:00.000Z`))) {
          throw new BadRequestException('تاريخ البداية غير صحيح');
        }
        where.activityDate.gte = new Date(`${from}T00:00:00.000Z`);
      }
      if (to) {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(to) || Number.isNaN(Date.parse(`${to}T00:00:00.000Z`))) {
          throw new BadRequestException('تاريخ النهاية غير صحيح');
        }
        where.activityDate.lte = new Date(`${to}T00:00:00.000Z`);
      }
      if (from && to && from > to) {
        throw new BadRequestException('تاريخ البداية يجب أن يكون قبل تاريخ النهاية');
      }
    }

    return this.prisma.mediaActivity.findMany({
      where,
      include: { createdBy: { select: { fullName: true } } },
      orderBy: [{ activityDate: 'desc' }, { createdAt: 'desc' }],
      ...(!from && !to ? { take: 500 } : {}),
    });
  }

  async create(user: AuthUser, body: { type?: MediaActivityType; title?: string; description?: string; activityDate?: string; workUrl?: string }) {
    if (user.role !== Role.ADMIN && user.role !== Role.SUPERVISOR) {
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
