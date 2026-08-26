import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ActivityService } from '../common/services/activity.service';
import { AuthUser } from '../common/decorators';
import { paginate } from '../common/dto/pagination.dto';
import {
  CreateAnnouncementDto,
  QueryAnnouncementsDto,
  UpdateAnnouncementDto,
} from './dto/announcement.dto';

const AUTHOR = { select: { id: true, fullName: true } };

/**
 * The announcement bar. Only the administration publishes; everyone else reads
 * the ones addressed to them. An empty `audience` means the whole school, which
 * is the common case and saves the admin from ticking every role.
 */
@Injectable()
export class AnnouncementsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly activity: ActivityService,
  ) {}

  /** What the current user should see in the bar right now. */
  async active(user: AuthUser) {
    const now = new Date();
    return this.prisma.announcement.findMany({
      where: {
        isActive: true,
        publishedAt: { lte: now },
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
        // `isEmpty` covers "everyone"; `has` covers a role-targeted notice.
        AND: [{ OR: [{ audience: { isEmpty: true } }, { audience: { has: user.role } }] }],
      },
      select: {
        id: true,
        title: true,
        body: true,
        link: true,
        publishedAt: true,
        expiresAt: true,
        createdBy: AUTHOR,
      },
      orderBy: { publishedAt: 'desc' },
      take: 10,
    });
  }

  /** Full list, for the administration's management screen. */
  async findAll(query: QueryAnnouncementsDto) {
    const where: Prisma.AnnouncementWhereInput = {
      ...(query.isActive !== undefined ? { isActive: query.isActive } : {}),
      ...(query.search
        ? {
            OR: [
              { title: { contains: query.search, mode: 'insensitive' } },
              { body: { contains: query.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const [data, total] = await this.prisma.$transaction([
      this.prisma.announcement.findMany({
        where,
        include: { createdBy: AUTHOR },
        orderBy: { publishedAt: 'desc' },
        skip: query.skip,
        take: query.take,
      }),
      this.prisma.announcement.count({ where }),
    ]);

    const now = new Date();
    return paginate(
      data.map((a) => ({
        ...a,
        isExpired: a.expiresAt ? a.expiresAt <= now : false,
      })),
      total,
      query.page,
      query.limit,
    );
  }

  async create(actor: AuthUser, dto: CreateAnnouncementDto) {
    const announcement = await this.prisma.announcement.create({
      data: {
        title: dto.title.trim(),
        body: dto.body || null,
        link: dto.link || null,
        audience: dto.audience ?? [],
        isActive: dto.isActive ?? true,
        expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null,
        createdById: actor.id,
      },
      include: { createdBy: AUTHOR },
    });

    await this.activity.log({
      userId: actor.id,
      action: 'ANNOUNCEMENT_CREATE',
      summary: `نشر إعلان: ${announcement.title}`,
      entityType: 'Announcement',
      entityId: announcement.id,
    });

    return announcement;
  }

  async update(actor: AuthUser, id: string, dto: UpdateAnnouncementDto) {
    const current = await this.prisma.announcement.findUnique({ where: { id } });
    if (!current) throw new NotFoundException('الإعلان غير موجود');

    const announcement = await this.prisma.announcement.update({
      where: { id },
      data: {
        title: dto.title?.trim(),
        body: dto.body === '' ? null : dto.body,
        link: dto.link === '' ? null : dto.link,
        audience: dto.audience,
        isActive: dto.isActive,
        ...(dto.expiresAt !== undefined
          ? { expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null }
          : {}),
      },
      include: { createdBy: AUTHOR },
    });

    await this.activity.log({
      userId: actor.id,
      action: 'ANNOUNCEMENT_UPDATE',
      summary: `تعديل إعلان: ${announcement.title}`,
      entityType: 'Announcement',
      entityId: id,
    });

    return announcement;
  }

  async remove(actor: AuthUser, id: string) {
    const announcement = await this.prisma.announcement.findUnique({ where: { id } });
    if (!announcement) throw new NotFoundException('الإعلان غير موجود');

    await this.prisma.announcement.delete({ where: { id } });

    await this.activity.log({
      userId: actor.id,
      action: 'ANNOUNCEMENT_DELETE',
      summary: `حذف إعلان: ${announcement.title}`,
      entityType: 'Announcement',
      entityId: id,
    });

    return { message: 'تم حذف الإعلان' };
  }
}
