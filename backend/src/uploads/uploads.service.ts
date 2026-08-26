import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, randomBytes } from 'crypto';
import { existsSync, mkdirSync } from 'fs';
import { unlink, writeFile } from 'fs/promises';
import { extname, join, resolve } from 'path';

export type UploadFolder = 'avatars' | 'logos' | 'courses';

export interface UploadResult {
  url: string;
  provider: 'cloudinary' | 'local';
  publicId?: string;
}

const ALLOWED_EXT = ['.png', '.jpg', '.jpeg', '.webp', '.svg', '.gif'];
const ALLOWED_MIME = [
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/svg+xml',
  'image/gif',
];

/**
 * Image storage with two backends.
 *
 * Cloudinary is used when credentials are present; otherwise files land in the
 * local `uploads/` directory. The fallback is deliberate — a mosque that has not
 * signed up for Cloudinary should still be able to set a logo, and the developer
 * running this locally should not need an account to see the feature work.
 *
 * The Cloudinary REST API is called directly rather than through their SDK: a
 * signed upload is one POST and a SHA-1, and this keeps the dependency list
 * (and the install footprint) unchanged.
 */
@Injectable()
export class UploadsService {
  private readonly logger = new Logger(UploadsService.name);

  constructor(private readonly config: ConfigService) {}

  private get cloudName() {
    return this.config.get<string>('CLOUDINARY_CLOUD_NAME');
  }
  private get apiKey() {
    return this.config.get<string>('CLOUDINARY_API_KEY');
  }
  private get apiSecret() {
    return this.config.get<string>('CLOUDINARY_API_SECRET');
  }

  isCloudinaryConfigured() {
    return Boolean(this.cloudName && this.apiKey && this.apiSecret);
  }

  /**
   * Absolute base URL of this API, used to turn a stored `/uploads/x.png` into
   * something a browser on another origin (the Vite dev server, a phone on the
   * LAN) can actually fetch.
   */
  publicBaseUrl(): string {
    const configured = this.config.get<string>('PUBLIC_URL');
    if (configured) return configured.replace(/\/+$/, '');
    const port = this.config.get<string>('PORT') || '4000';
    return `http://localhost:${port}`;
  }

  private assertAcceptable(file: Express.Multer.File) {
    if (!file) throw new BadRequestException('لم يتم اختيار ملف');
    const ext = extname(file.originalname || '').toLowerCase();
    if (!ALLOWED_EXT.includes(ext) || !ALLOWED_MIME.includes(file.mimetype)) {
      throw new BadRequestException('صيغة الملف غير مدعومة (png, jpg, webp, gif, svg)');
    }
    const maxMb = parseInt(this.config.get('MAX_UPLOAD_SIZE_MB') || '5', 10);
    if (file.size > maxMb * 1024 * 1024) {
      throw new BadRequestException(`حجم الملف يتجاوز الحد المسموح (${maxMb} ميجابايت)`);
    }
    return ext;
  }

  async upload(file: Express.Multer.File, folder: UploadFolder): Promise<UploadResult> {
    const ext = this.assertAcceptable(file);
    if (this.isCloudinaryConfigured()) {
      try {
        return await this.uploadToCloudinary(file, folder);
      } catch (error) {
        // A cloud outage must not stop an administrator setting a logo, so we
        // fall back to local storage and say so in the log rather than failing.
        this.logger.error(`تعذر الرفع إلى Cloudinary، سيتم الحفظ محلياً: ${String(error)}`);
      }
    }
    return this.uploadLocally(file, folder, ext);
  }

  // --- Cloudinary ----------------------------------------------------------

  /**
   * Signed upload. Cloudinary signs the alphabetically-sorted `key=value` pairs
   * of every parameter except `file`, `api_key` and `resource_type`, with the
   * API secret appended, hashed as SHA-1.
   */
  private async uploadToCloudinary(
    file: Express.Multer.File,
    folder: UploadFolder,
  ): Promise<UploadResult> {
    const timestamp = Math.floor(Date.now() / 1000);
    const params: Record<string, string> = {
      folder: `quran-circles/${folder}`,
      timestamp: String(timestamp),
    };

    const toSign = Object.keys(params)
      .sort()
      .map((k) => `${k}=${params[k]}`)
      .join('&');
    const signature = createHash('sha1').update(`${toSign}${this.apiSecret}`).digest('hex');

    const form = new FormData();
    form.append(
      'file',
      `data:${file.mimetype};base64,${file.buffer.toString('base64')}`,
    );
    form.append('api_key', this.apiKey!);
    for (const [k, v] of Object.entries(params)) form.append(k, v);
    form.append('signature', signature);

    const response = await fetch(
      `https://api.cloudinary.com/v1_1/${this.cloudName}/image/upload`,
      { method: 'POST', body: form },
    );

    if (!response.ok) {
      const detail = await response.text();
      throw new Error(`Cloudinary ${response.status}: ${detail.slice(0, 200)}`);
    }

    const body = (await response.json()) as { secure_url?: string; public_id?: string };
    if (!body.secure_url) throw new Error('Cloudinary did not return a URL');

    return { url: body.secure_url, provider: 'cloudinary', publicId: body.public_id };
  }

  // --- local ---------------------------------------------------------------

  private async uploadLocally(
    file: Express.Multer.File,
    folder: UploadFolder,
    ext: string,
  ): Promise<UploadResult> {
    const root = join(process.cwd(), this.config.get<string>('UPLOAD_DIR') || 'uploads');
    const dir = join(root, folder);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

    const name = `${folder.slice(0, -1)}-${Date.now()}-${randomBytes(4).toString('hex')}${ext}`;
    await writeFile(join(dir, name), file.buffer);

    // Absolute, not `/uploads/...`: the frontend is served from a different
    // origin in development, where a root-relative path would resolve against
    // the Vite dev server and 404. This was the school-logo bug.
    return { url: `${this.publicBaseUrl()}/uploads/${folder}/${name}`, provider: 'local' };
  }

  // --- deletion ------------------------------------------------------------

  /**
   * Deletes a previously uploaded image, wherever it lives.
   *
   * Called whenever a picture is replaced or cleared — a new avatar, a new
   * school logo, a deleted account — so the storage does not fill up with files
   * nothing references any more. Deliberately best-effort: an image that has
   * already vanished, or a cloud call that fails, must never block the update
   * that triggered it, so every failure is logged and swallowed.
   */
  async remove(url?: string | null): Promise<boolean> {
    if (!url) return false;
    try {
      if (/res\.cloudinary\.com/i.test(url)) return await this.removeFromCloudinary(url);
      return await this.removeLocally(url);
    } catch (error) {
      this.logger.warn(`تعذر حذف الملف ${url}: ${String(error)}`);
      return false;
    }
  }

  /** Deletes `previous` only when the picture actually changed. */
  async removeIfReplaced(previous?: string | null, next?: string | null) {
    if (!previous || previous === next) return false;
    return this.remove(previous);
  }

  /**
   * `https://res.cloudinary.com/<cloud>/image/upload/v1712/quran-circles/avatars/x.png`
   * carries the public id — `quran-circles/avatars/x` — between the version
   * segment and the extension.
   */
  private publicIdFromUrl(url: string): string | null {
    const match = /\/upload\/(?:[^/]+\/)*?(?:v\d+\/)?(.+)$/.exec(new URL(url).pathname);
    if (!match) return null;
    return match[1].replace(/\.[a-z0-9]+$/i, '');
  }

  private async removeFromCloudinary(url: string): Promise<boolean> {
    if (!this.isCloudinaryConfigured()) return false;
    const publicId = this.publicIdFromUrl(url);
    if (!publicId) return false;

    const timestamp = Math.floor(Date.now() / 1000);
    const toSign = `public_id=${publicId}&timestamp=${timestamp}`;
    const signature = createHash('sha1').update(`${toSign}${this.apiSecret}`).digest('hex');

    const form = new FormData();
    form.append('public_id', publicId);
    form.append('timestamp', String(timestamp));
    form.append('api_key', this.apiKey!);
    form.append('signature', signature);

    const response = await fetch(
      `https://api.cloudinary.com/v1_1/${this.cloudName}/image/destroy`,
      { method: 'POST', body: form },
    );
    if (!response.ok) throw new Error(`Cloudinary ${response.status}`);
    return true;
  }

  private async removeLocally(url: string): Promise<boolean> {
    // Accepts both the absolute URL we hand out and the legacy `/uploads/...`
    // form still sitting in older rows.
    const path = /^https?:\/\//i.test(url) ? new URL(url).pathname : url;
    const match = /\/uploads\/([^/]+)\/([^/?#]+)$/.exec(path);
    if (!match) return false;

    const [, folder, name] = match;
    const root = resolve(process.cwd(), this.config.get<string>('UPLOAD_DIR') || 'uploads');
    const target = resolve(root, folder, decodeURIComponent(name));
    // Never follow a crafted path out of the uploads directory.
    if (!target.startsWith(root)) return false;
    if (!existsSync(target)) return false;

    await unlink(target);
    return true;
  }
}
