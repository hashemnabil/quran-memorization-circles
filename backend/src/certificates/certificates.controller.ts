import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { AuthUser, CurrentUser, Roles } from '../common/decorators';
import { CertificatesService } from './certificates.service';

@ApiTags('الشهادات وملفاتي')
@ApiBearerAuth()
@Controller('certificates')
export class CertificatesController {
  constructor(private readonly service: CertificatesService) {}

  @Get('templates')
  @Roles(Role.ADMIN)
  templates() { return this.service.listTemplates(); }

  @Post('templates')
  @Roles(Role.ADMIN)
  createTemplate(@CurrentUser() user: AuthUser, @Body() body: any) { return this.service.createTemplate(user, body); }

  @Patch('templates/:id/deactivate')
  @Roles(Role.ADMIN)
  deactivateTemplate(@Param('id') id: string) { return this.service.deactivateTemplate(id); }

  @Post('requests')
  @Roles(Role.STUDENT)
  createRequest(@CurrentUser() user: AuthUser, @Body() body: any) { return this.service.createRequest(user, body); }

  @Get('requests/mine')
  @Roles(Role.STUDENT)
  myRequests(@CurrentUser() user: AuthUser) { return this.service.myRequests(user); }

  @Get('mine')
  @Roles(Role.STUDENT)
  myCertificates(@CurrentUser() user: AuthUser) { return this.service.myCertificates(user); }

  @Get('requests')
  @Roles(Role.ADMIN)
  requests() { return this.service.listRequests(); }

  @Patch('requests/:id/decision')
  @Roles(Role.ADMIN)
  decide(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() body: any) { return this.service.decideRequest(user, id, body); }

  @Post('issue')
  @Roles(Role.ADMIN)
  issue(@CurrentUser() user: AuthUser, @Body() body: any) { return this.service.issueRecord(user, body); }
}
