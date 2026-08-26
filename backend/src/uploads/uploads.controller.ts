import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { memoryStorage } from 'multer';
import { AuthUser, CurrentUser } from '../common/decorators';
import { UploadsService } from './uploads.service';

/**
 * Memory storage, not disk: the buffer either goes straight to Cloudinary or is
 * written once by the service. Staging it on disk first would leave orphans
 * behind whenever the cloud upload succeeds.
 */
const interceptor = () =>
  UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: parseInt(process.env.MAX_UPLOAD_SIZE_MB || '5', 10) * 1024 * 1024 },
    }),
  );

@ApiTags('الملفات')
@ApiBearerAuth()
@Controller('uploads')
export class UploadsController {
  constructor(private readonly service: UploadsService) {}

  @Post('avatar')
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'رفع صورة شخصية' })
  @interceptor()
  async avatar(@CurrentUser() user: AuthUser, @UploadedFile() file: Express.Multer.File) {
    if (!file) throw new BadRequestException('لم يتم اختيار ملف');
    void user;
    return this.service.upload(file, 'avatars');
  }

  @Post('image')
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'رفع صورة عامة' })
  @interceptor()
  async image(@UploadedFile() file: Express.Multer.File) {
    if (!file) throw new BadRequestException('لم يتم اختيار ملف');
    return this.service.upload(file, 'courses');
  }

  /**
   * Removes an image from storage.
   *
   * Replacing an avatar or the school logo already cleans up after itself in
   * the service that owns that field; this is for a screen that uploaded a
   * picture and then dropped it before saving, which would otherwise leave the
   * file behind forever.
   */
  @Delete()
  @ApiOperation({ summary: 'حذف صورة مرفوعة' })
  async remove(@Body('url') url: string) {
    if (!url) throw new BadRequestException('لم يتم تحديد الملف');
    const deleted = await this.service.remove(url);
    return { deleted, message: deleted ? 'تم حذف الصورة' : 'الصورة غير موجودة' };
  }
}
