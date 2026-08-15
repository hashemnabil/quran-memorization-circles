import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ActivityService } from '../common/services/activity.service';
import { AuthUser } from '../common/decorators';
import { UpdateSettingsDto } from './dto/settings.dto';

const SETTINGS_ID = 'default';

@Injectable()
export class SettingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly activity: ActivityService,
  ) {}

  /** The settings row is a singleton; it is created on first read. */
  async get() {
    const existing = await this.prisma.schoolSettings.findUnique({ where: { id: SETTINGS_ID } });
    if (existing) return existing;
    return this.prisma.schoolSettings.create({ data: { id: SETTINGS_ID } });
  }

  async update(actor: AuthUser, dto: UpdateSettingsDto) {
    await this.get();
    const updated = await this.prisma.schoolSettings.update({
      where: { id: SETTINGS_ID },
      data: {
        name: dto.name,
        mosqueName: dto.mosqueName,
        logoUrl: dto.logoUrl,
        phone: dto.phone,
        email: dto.email,
        address: dto.address,
        about: dto.about,
        facebook: dto.facebook,
        twitter: dto.twitter,
        instagram: dto.instagram,
        youtube: dto.youtube,
        telegram: dto.telegram,
        whatsapp: dto.whatsapp,
        website: dto.website,
        academicYear: dto.academicYear,
      },
    });

    await this.activity.log({
      userId: actor.id,
      action: 'SETTINGS_UPDATE',
      summary: 'تحديث إعدادات المدرسة',
      entityType: 'SchoolSettings',
      entityId: SETTINGS_ID,
    });

    return updated;
  }

  /** Branding shown on the login screen; safe to expose without authentication. */
  async publicInfo() {
    const settings = await this.get();
    return {
      name: settings.name,
      mosqueName: settings.mosqueName,
      logoUrl: settings.logoUrl,
      about: settings.about,
      phone: settings.phone,
      email: settings.email,
      facebook: settings.facebook,
      twitter: settings.twitter,
      instagram: settings.instagram,
      youtube: settings.youtube,
      telegram: settings.telegram,
      whatsapp: settings.whatsapp,
      website: settings.website,
    };
  }
}
