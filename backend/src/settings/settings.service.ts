import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ActivityService } from '../common/services/activity.service';
import { AuthUser } from '../common/decorators';
import { UploadsService } from '../uploads/uploads.service';
import { UpdateSettingsDto } from './dto/settings.dto';

const SETTINGS_ID = 'default';

@Injectable()
export class SettingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly activity: ActivityService,
    private readonly uploads: UploadsService,
  ) {}

  /** The settings row is a singleton; it is created on first read. */
  async get() {
    const existing = await this.prisma.schoolSettings.findUnique({ where: { id: SETTINGS_ID } });
    const row = existing ?? (await this.prisma.schoolSettings.create({ data: { id: SETTINGS_ID } }));
    return { ...row, logoUrl: this.absoluteLogo(row.logoUrl) };
  }

  /**
   * Older rows stored the logo as `/uploads/x.png`. That path resolves against
   * whatever origin the browser is on — the Vite dev server in development —
   * so the image 404s. Anything relative is rebased onto the API's own origin.
   */
  private absoluteLogo(logoUrl: string | null): string | null {
    if (!logoUrl) return null;
    if (/^https?:\/\//i.test(logoUrl) || logoUrl.startsWith('data:')) return logoUrl;
    return `${this.uploads.publicBaseUrl()}/${logoUrl.replace(/^\/+/, '')}`;
  }

  async update(actor: AuthUser, dto: UpdateSettingsDto) {
    await this.get();

    // `undefined` means "not sent, leave alone"; `null` means "the admin
    // cleared this field". Only the keys actually present are written.
    const data: Record<string, string | null> = {};
    const keys = [
      'name',
      'mosqueName',
      'logoUrl',
      'phone',
      'email',
      'address',
      'about',
      'facebook',
      'twitter',
      'instagram',
      'youtube',
      'telegram',
      'whatsapp',
      'website',
      'academicYear',
    ] as const;
    for (const key of keys) {
      const value = dto[key];
      if (value !== undefined) data[key] = value;
    }

    // The school name backs page titles and the login screen, so it falls back
    // to the default rather than becoming blank.
    if (data.name === null || data.name === '') {
      data.name = 'حلقات تحفيظ القرآن الكريم';
    }

    const updated = await this.prisma.schoolSettings.update({
      where: { id: SETTINGS_ID },
      data,
    });

    await this.activity.log({
      userId: actor.id,
      action: 'SETTINGS_UPDATE',
      summary: 'تحديث إعدادات المدرسة',
      entityType: 'SchoolSettings',
      entityId: SETTINGS_ID,
    });

    return { ...updated, logoUrl: this.absoluteLogo(updated.logoUrl) };
  }

  /** Branding shown on the login screen; safe to expose without authentication. */
  async publicInfo() {
    const settings = await this.get();
    return {
      name: settings.name,
      mosqueName: settings.mosqueName,
      logoUrl: settings.logoUrl,
      address: settings.address,
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
