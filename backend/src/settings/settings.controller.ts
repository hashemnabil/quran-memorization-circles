import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Patch,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { diskStorage } from 'multer';
import { existsSync, mkdirSync } from 'fs';
import { extname, join } from 'path';
import { AuthUser, CurrentUser, Public, Roles } from '../common/decorators';
import { UpdateSettingsDto } from './dto/settings.dto';
import { SettingsService } from './settings.service';

const UPLOAD_DIR = join(process.cwd(), process.env.UPLOAD_DIR || 'uploads');
const ALLOWED = ['.png', '.jpg', '.jpeg', '.webp', '.svg'];

if (!existsSync(UPLOAD_DIR)) mkdirSync(UPLOAD_DIR, { recursive: true });

@ApiTags('إعدادات المدرسة')
@Controller('settings')
export class SettingsController {
  constructor(private readonly service: SettingsService) {}

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

  @Post('logo')
  @ApiBearerAuth()
  @Roles(Role.ADMIN)
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'رفع شعار المدرسة' })
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: UPLOAD_DIR,
        filename: (_req, file, cb) => {
          const ext = extname(file.originalname).toLowerCase();
          cb(null, `logo-${Date.now()}${ext}`);
        },
      }),
      limits: { fileSize: (parseInt(process.env.MAX_UPLOAD_SIZE_MB || '5', 10)) * 1024 * 1024 },
      fileFilter: (_req, file, cb) => {
        const ext = extname(file.originalname).toLowerCase();
        if (!ALLOWED.includes(ext)) {
          return cb(new BadRequestException('صيغة الملف غير مدعومة (png, jpg, webp, svg)'), false);
        }
        cb(null, true);
      },
    }),
  )
  async uploadLogo(@CurrentUser() user: AuthUser, @UploadedFile() file: Express.Multer.File) {
    if (!file) throw new BadRequestException('لم يتم اختيار ملف');
    const logoUrl = `/uploads/${file.filename}`;
    await this.service.update(user, { logoUrl });
    return { logoUrl };
  }
}
