import { Body, Controller, Get, Param, Patch, Post, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Role } from '@prisma/client';
import { AuthUser, CurrentUser, Roles } from '../common/decorators';
import { SmsService } from './sms.service';
@Controller('sms')
@Roles(Role.ADMIN)
export class SmsController {
  constructor(private readonly service: SmsService) {}
  @Get('templates') templates() { return this.service.templates(); }
  @Patch('templates/:kind') template(@Param('kind') kind: string, @Body() body: any) { return this.service.saveTemplate(kind, body?.text); }
  @Post('import')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 5 * 1024 * 1024, files: 1 } }))
  import(@UploadedFile() file: Express.Multer.File) { return this.service.import(file); }
  @Get('recipients') recipients() { return this.service.recipients(); }
  @Post('preview') preview(@Body() body: any) { return this.service.preview(body); }
  @Post('communications') communicate(@CurrentUser() user: AuthUser, @Body() body: any) { return this.service.communicate(user, body); }
  @Post('send') send(@CurrentUser() user: AuthUser, @Body() body: any) { return this.service.enqueue(user, body); }
  @Get('campaigns') history() { return this.service.history(); }
  @Get('campaigns/:id') status(@Param('id') id: string) { return this.service.status(id); }
  @Post('campaigns/:id/retry') retry(@Param('id') id: string) { return this.service.retry(id); }
}
