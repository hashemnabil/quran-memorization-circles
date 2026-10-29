import { BadRequestException, Body, Controller, Get, NotFoundException, Param, Patch, Post, Put, Res, UnauthorizedException, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { Response } from 'express';
import { Role } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { AuthUser, CurrentUser, Public, Roles } from '../common/decorators';
import { PrismaService } from '../prisma/prisma.service';
import { ASSET_KINDS, assetMime } from './asset-policy';
import { popupVisible } from './popup-policy';

@Controller('founder-assets')
export class FounderAssetsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('choices')
  choices(@CurrentUser() user: AuthUser) {
    return this.prisma.presentationChoice.findMany({ where: { userId: user.id }, select: { kind: true, assetId: true, updatedAt: true } });
  }

  @Put('choices/:kind')
  async choose(@CurrentUser() user: AuthUser, @Param('kind') kind: string, @Body() body: { assetId?: string | null }) {
    if (!ASSET_KINDS.includes(kind as any) || body.assetId != null && typeof body.assetId !== 'string') throw new BadRequestException('اختيار غير صالح');
    const assetId = body.assetId || null;
    if (assetId && !await this.prisma.founderAsset.findFirst({ where: { id: assetId, kind, isActive: true }, select: { id: true } })) throw new BadRequestException('اختر مورداً متاحاً من مكتبة المؤسس');
    return this.prisma.presentationChoice.upsert({ where: { userId_kind: { userId: user.id, kind } }, create: { userId: user.id, kind, assetId }, update: { assetId }, select: { kind: true, assetId: true, updatedAt: true } });
  }

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.prisma.founderAsset.findMany({ where: { isActive: true, ...(user.role !== Role.FOUNDER ? { kind: { notIn: ['ANNOUNCEMENT_IMAGE', 'ANNOUNCEMENT_VIDEO'] } } : {}) }, select: { id: true, title: true, kind: true, mime: true, size: true }, orderBy: { createdAt: 'desc' }, take: 50 });
  }

  private async readable(id: string, role?: string) {
    if (role === Role.FOUNDER) return true;
    const notices = await this.prisma.announcement.findMany({ where: { isPopup: true, isActive: true, AND: [
      { OR: [{ popup: { path: ['imageAssetId'], equals: id } }, { popup: { path: ['videoAssetId'], equals: id } }] },
      { OR: role ? [{ audience: { isEmpty: true } }, { audience: { has: role as Role } }] : [{ audience: { isEmpty: true } }] },
    ] }, select: { isActive: true, popup: true, audience: true, publishedAt: true, expiresAt: true } });
    return notices.some(notice => popupVisible(notice, role));
  }

  @Get(':id/private-content')
  async privateContent(@CurrentUser() user: AuthUser, @Param('id') id: string, @Res() response: Response) {
    const asset = await this.prisma.founderAsset.findFirst({ where: { id, isActive: true } });
    if (!asset || !await this.readable(id, user.role)) throw new NotFoundException('المرفق غير متاح');
    response.set({ 'Content-Type': asset.mime, 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'private, no-store' });
    response.send(asset.content);
  }

  @Public()
  @Get(':id/content')
  async content(@Param('id') id: string, @Res() response: Response) {
    const asset = await this.prisma.founderAsset.findFirst({ where: { id, isActive: true } });
    if (!asset) throw new NotFoundException('التصميم غير متاح');
    if (asset.kind.startsWith('ANNOUNCEMENT_') && !await this.readable(id)) throw new NotFoundException('المرفق غير متاح');
    response.set({ 'Content-Type': asset.mime, 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'public, max-age=300' });
    response.send(asset.content);
  }

  private async verify(user: AuthUser, password: unknown) {
    if (typeof password !== 'string' || password.length > 128) throw new UnauthorizedException('أعد إدخال كلمة المرور');
    const account = await this.prisma.user.findFirst({ where: { id: user.id, role: Role.FOUNDER, isActive: true, deletedAt: null }, select: { passwordHash: true } });
    if (!account || !await bcrypt.compare(password, account.passwordHash)) throw new UnauthorizedException('تعذر التحقق من الهوية');
  }

  @Post()
  @Roles(Role.FOUNDER)
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage(), limits: { fileSize: 5 * 1024 * 1024, fields: 3, files: 1 } }))
  async upload(@CurrentUser() user: AuthUser, @UploadedFile() file: Express.Multer.File, @Body() body: { title?: string; kind?: string; password?: string }) {
    await this.verify(user, body.password);
    const mime = file?.buffer && assetMime(body.kind || '', file.buffer);
    if (!mime || typeof body.title !== 'string' || !body.title.trim() || body.title.trim().length > 100) throw new BadRequestException('اختر ملفاً صالحاً وعنواناً حتى 100 حرف؛ الحد 5 ميغابايت');
    return this.prisma.$transaction(async tx => {
      // Serialize uploads so concurrent requests cannot bypass the storage quota.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(6291001)`;
      const total = await tx.founderAsset.aggregate({ _sum: { size: true }, _count: true });
      if (total._count >= 50 || (total._sum.size || 0) + file.buffer.length > 50 * 1024 * 1024) throw new BadRequestException('مكتبة الملفات ممتلئة: الحد 50 ملفاً و50 ميغابايت');
      const asset = await tx.founderAsset.create({ data: { title: body.title!.trim(), kind: body.kind!, mime, content: file.buffer, size: file.buffer.length, createdById: user.id }, select: { id: true, title: true, kind: true } });
      await tx.activityLog.create({ data: { userId: user.id, action: 'FOUNDER_ASSET_CREATE', summary: `إضافة مورد: ${asset.title}`, entityType: 'FounderAsset', entityId: asset.id } });
      return asset;
    });
  }

  @Patch(':id/disable')
  @Roles(Role.FOUNDER)
  async disable(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() body: { password?: string }) {
    await this.verify(user, body.password);
    return this.prisma.$transaction(async tx => {
      const result = await tx.founderAsset.update({ where: { id }, data: { isActive: false }, select: { id: true } });
      await tx.activityLog.create({ data: { userId: user.id, action: 'FOUNDER_ASSET_DISABLE', summary: 'إيقاف مورد من المكتبة', entityType: 'FounderAsset', entityId: id } });
      return result;
    });
  }
}
