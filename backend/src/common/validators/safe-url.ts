import { BadRequestException } from '@nestjs/common';

export function assertSafeHttpUrl(value: string) {
  try {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || /[\u0000-\u0020]/.test(value)) throw new Error('unsafe');
  } catch { throw new BadRequestException('الرابط يجب أن يستخدم HTTP أو HTTPS'); }
}
export function assertSafeFileUrl(value: unknown) {
  if (typeof value !== 'string' || !value.trim()) throw new BadRequestException('رابط الملف غير صالح');
  const url = value.trim();
  if (url.startsWith('data:application/pdf;base64,')) {
    const data = url.slice('data:application/pdf;base64,'.length);
    if (data.length > 11 * 1024 * 1024 || !/^[A-Za-z0-9+/]+={0,2}$/.test(data) || !Buffer.from(data, 'base64').subarray(0, 5).equals(Buffer.from('%PDF-'))) {
      throw new BadRequestException('ملف PDF غير صالح أو يتجاوز الحجم المسموح');
    }
    return;
  }
  if (/^\/uploads\/[A-Za-z0-9_./-]+$/.test(url) && !url.includes('..')) return;
  assertSafeHttpUrl(url);
}
