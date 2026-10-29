import { assertSafeHttpUrl } from '../common/validators/safe-url';
import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
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
      assertSafeHttpUrl(body.workUrl.trim());
    }
    return this.prisma.mediaActivity.create({
      data: {
        type: body.type!, title: body.title.trim(), description: body.description.trim(),
        activityDate: date, workUrl: body.workUrl?.trim() || null, createdById: user.id,
      },
      include: { createdBy: { select: { fullName: true } } },
    });
  }

  private revision(previous: any) {
    if (!previous || !Object.values(MediaActivityType).includes(previous.type) || typeof previous.title !== 'string' || typeof previous.description !== 'string'
      || typeof previous.activityDate !== 'string' || !Number.isFinite(Date.parse(previous.activityDate)) || !(previous.workUrl == null || typeof previous.workUrl === 'string'))
      throw new BadRequestException('نسخة النشاط الأصلية غير صالحة');
    return { type: previous.type as MediaActivityType, title: previous.title, description: previous.description, activityDate: new Date(previous.activityDate), workUrl: previous.workUrl || null };
  }

  async update(user: AuthUser, id: string, body: any) {
    if (![Role.ADMIN, Role.SUPERVISOR].includes(user.role as any)) throw new BadRequestException('لا تملك صلاحية تعديل النشاط');
    const previous = this.revision(body?.previous);
    if (typeof body?.title !== 'string' || !body.title.trim() || typeof body.description !== 'string' || !body.description.trim()
      || !Object.values(MediaActivityType).includes(body.type) || typeof body.activityDate !== 'string' || !Number.isFinite(Date.parse(body.activityDate))
      || !(body.workUrl == null || typeof body.workUrl === 'string')) throw new BadRequestException('بيانات النشاط غير مكتملة');
    if (body.workUrl?.trim()) assertSafeHttpUrl(body.workUrl.trim());
    const result = await this.prisma.mediaActivity.updateMany({ where: { id, ...previous }, data: { type: body.type, title: body.title.trim(), description: body.description.trim(), activityDate: new Date(body.activityDate), workUrl: body.workUrl?.trim() || null } });
    if (!result.count) throw new ConflictException('تغيّر النشاط أو حُذف من جهاز آخر؛ راجع النسخة الحديثة قبل التعديل');
    return this.prisma.mediaActivity.findUnique({ where: { id }, include: { createdBy: { select: { fullName: true } } } });
  }

  async remove(id: string, previous?: any) {
    if (previous) {
      const result = await this.prisma.mediaActivity.deleteMany({ where: { id, ...this.revision(previous) } });
      if (!result.count) throw new ConflictException('تغيّر النشاط أو حُذف من جهاز آخر؛ راجع النسخة الحديثة قبل الحذف');
      return { id };
    }
    const found = await this.prisma.mediaActivity.findUnique({ where: { id }, select: { id: true } });
    if (!found) throw new NotFoundException('النشاط غير موجود');
    return this.prisma.mediaActivity.delete({ where: { id } });
  }
}
