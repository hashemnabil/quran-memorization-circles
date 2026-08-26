import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Patch,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { memoryStorage } from 'multer';
import { AuthUser, CurrentUser, Public, Roles } from '../common/decorators';
import { UploadsService } from '../uploads/uploads.service';
import { UpdateSettingsDto } from './dto/settings.dto';
import { SettingsService } from './settings.service';

@ApiTags('إعدادات المدرسة')
@Controller('settings')
export class SettingsController {
  constructor(
    private readonly service: SettingsService,
    private readonly uploads: UploadsService,
  ) {}

  @Public()
  @Get('public')
  @ApiOperation({ summary: 'المعلومات العامة (شاشة الدخول)' })
  publicInfo() {
    return this.service.publicInfo();
  }

  @Get()
  @ApiBearerAuth()
  @ApiOperation({ summary: 'إعدادات المدرسة' })
  get() {
    return this.service.get();
  }

  @Patch()
  @ApiBearerAuth()
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'تحديث إعدادات المدرسة' })
  update(@CurrentUser() user: AuthUser, @Body() dto: UpdateSettingsDto) {
    return this.service.update(user, dto);
  }

  /**
   * Memory storage so the buffer can go to Cloudinary when it is configured;
   * `UploadsService` decides where the bytes end up and returns an absolute URL.
   */
  @Post('logo')
  @ApiBearerAuth()
  @Roles(Role.ADMIN)
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'رفع شعار المدرسة' })
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: parseInt(process.env.MAX_UPLOAD_SIZE_MB || '5', 10) * 1024 * 1024 },
    }),
  )
  async uploadLogo(@CurrentUser() user: AuthUser, @UploadedFile() file: Express.Multer.File) {
    if (!file) throw new BadRequestException('لم يتم اختيار ملف');
    const previous = (await this.service.get()).logoUrl;
    const { url, provider } = await this.uploads.upload(file, 'logos');
    await this.service.update(user, { logoUrl: url });
    // The replaced logo is nothing's business any more; drop the file too.
    await this.uploads.removeIfReplaced(previous, url);
    return { logoUrl: url, provider };
  }

  @Delete('logo')
  @ApiBearerAuth()
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'إزالة شعار المدرسة' })
  async removeLogo(@CurrentUser() user: AuthUser) {
    const previous = (await this.service.get()).logoUrl;
    await this.service.update(user, { logoUrl: null });
    await this.uploads.remove(previous);
    return { logoUrl: null };
  }
}
