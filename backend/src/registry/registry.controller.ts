import { Body, Controller, Delete, Get, Headers, Param, Patch, Post, Query, UploadedFile, UseInterceptors, BadRequestException, Res } from '@nestjs/common';
import { ApiBearerAuth, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { Role } from '@prisma/client';
import { Response } from 'express';
import * as XLSX from 'xlsx';
import { Public, Roles } from '../common/decorators';
import { RegistryService } from './registry.service';
import { QueryRegistryUsersDto, RegistryAccessDto, UpdateRegistryUserDto } from './dto/registry.dto';

@ApiTags('سجل البيانات')
@Controller('registry')
export class RegistryController {
  constructor(private readonly service: RegistryService) {}

  @Post('access')
  @Public()
  @ApiOperation({ summary: 'التحقق من رقم الهوية وإنشاء جلسة مستخدم' })
  access(@Body() dto: RegistryAccessDto) { return this.service.access(dto.nationalId); }

  @Get('me')
  @Public()
  me(@Headers('x-registry-token') token?: string) {
    if (!token) throw new BadRequestException('جلسة المستخدم مطلوبة.');
    return this.service.me(token);
  }

  @Patch('me')
  @Public()
  update(@Headers('x-registry-token') token: string | undefined, @Body() dto: UpdateRegistryUserDto) {
    if (!token) throw new BadRequestException('جلسة المستخدم مطلوبة.');
    return this.service.update(token, dto);
  }

  @Get('admin/stats')
  @Roles(Role.ADMIN)
  @ApiBearerAuth()
  stats() { return this.service.stats(); }

  @Get('admin/users')
  @Roles(Role.ADMIN)
  @ApiBearerAuth()
  users(@Query() query: QueryRegistryUsersDto) { return this.service.list(query); }

  @Patch('admin/users/:id/active')
  @Roles(Role.ADMIN)
  @ApiBearerAuth()
  active(@Param('id') id: string, @Body() body: { isActive: boolean }) { return this.service.setActive(id, Boolean(body.isActive)); }

  @Delete('admin/users/:id')
  @Roles(Role.ADMIN)
  @ApiBearerAuth()
  remove(@Param('id') id: string) { return this.service.remove(id); }

  @Post('admin/import')
  @Roles(Role.ADMIN)
  @ApiBearerAuth()
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 10 * 1024 * 1024 } }))
  import(@UploadedFile() file?: Express.Multer.File) {
    if (!file) throw new BadRequestException('اختر ملف Excel أولاً.');
    const name = file.originalname.toLowerCase();
    if (!name.endsWith('.xlsx') && !name.endsWith('.xls')) throw new BadRequestException('الملف يجب أن يكون xlsx أو xls.');
    return this.service.importExcel(file.buffer);
  }

  @Get('admin/export')
  @Roles(Role.ADMIN)
  @ApiBearerAuth()
  async export(@Query('completed') completed: string | undefined, @Res() res: Response) {
    const buffer = await this.service.exportExcel(completed);
    res.set({ 'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'Content-Disposition': 'attachment; filename="registry-users.xlsx"', 'Content-Length': buffer.length });
    res.send(buffer);
  }

  @Get('admin/template')
  @Roles(Role.ADMIN)
  @ApiBearerAuth()
  async template(@Res() res: Response) {
    const buffer = this.service.templateExcel();
    res.set({ 'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'Content-Disposition': 'attachment; filename="national-id-template.xlsx"', 'Content-Length': buffer.length });
    res.send(buffer);
  }
}
