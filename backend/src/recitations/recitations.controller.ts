import { LearningRules } from '../common/learning-rules';
import { BadRequestException, Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { AuthUser, CurrentUser, Roles } from '../common/decorators';
import {
  CreateRecitationDto,
  QueryRecitationsDto,
  UpdateRecitationDto,
} from './dto/recitation.dto';
import { RecitationsService } from './recitations.service';

@ApiTags('التسميع اليومي')
@ApiBearerAuth()
@Controller('recitations')
@Roles(Role.ADMIN, Role.SUPERVISOR, Role.TEACHER, Role.STUDENT)
export class RecitationsController {
  constructor(private readonly service: RecitationsService) {}

  @Get('points-audit') @Roles(Role.ADMIN)
  pointsAudit(@Query() query:QueryRecitationsDto){return this.service.pointsAudit(query);}
  @Get('learning-settings')
  learningSettings(@Query('circleId') circleId?:string) {return this.service.learningSettings(circleId);}
  @Patch('learning-settings') @Roles(Role.ADMIN)
  updateLearningSettings(@CurrentUser() user:AuthUser,@Body() rules:LearningRules,@Query('circleId') circleId?:string){return this.service.updateLearningSettings(user,circleId,rules);}

  @Get('surahs')
  @ApiOperation({ summary: 'قائمة سور القرآن الكريم وعدد آياتها' })
  surahs() {
    return this.service.surahs();
  }

  @Get('grading-settings')
  gradingSettings() { return this.service.gradingSettings(); }

  @Patch('grading-settings')
  @Roles(Role.ADMIN)
  updateGradingSettings(@CurrentUser() user: AuthUser, @Body() values: Record<string, number>) {
    return this.service.updateGradingSettings(user, values);
  }

  @Get('student/:studentId/progress')
  @ApiOperation({ summary: 'تقدم الطالب في التسميع' })
  progress(@CurrentUser() user: AuthUser, @Param('studentId') studentId: string) {
    return this.service.studentProgress(user, studentId);
  }

  @Get('history')
  @ApiOperation({ summary: 'سجل التسميع مرتّباً حسب التاريخ ثم الحلقة' })
  history(@CurrentUser() user: AuthUser, @Query() query: QueryRecitationsDto) {
    return this.service.history(user, query);
  }

  @Get('history/:date/:circleId')
  @ApiOperation({ summary: 'تفاصيل تسميع طلاب حلقة في يوم محدد' })
  historyDetail(
    @CurrentUser() user: AuthUser,
    @Param('date') date: string,
    @Param('circleId') circleId: string,
  ) {
    return this.service.historyDetail(user, date, circleId);
  }

  @Get()
  @ApiOperation({ summary: 'سجل التسميع (قائمة مسطّحة)' })
  findAll(@CurrentUser() user: AuthUser, @Query() query: QueryRecitationsDto) {
    return this.service.findAll(user, query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'تفاصيل سجل تسميع' })
  findOne(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.findOne(user, id);
  }

  @Post()
  @Roles(Role.ADMIN, Role.SUPERVISOR, Role.TEACHER)
  @ApiOperation({ summary: 'تسجيل تسميع يومي' })
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateRecitationDto) {
    return this.service.create(user, dto);
  }

  @Patch(':id/tajweed') @Roles(Role.ADMIN,Role.SUPERVISOR,Role.TEACHER)
  setLegacyTajweed(@CurrentUser() user:AuthUser,@Param('id') id:string,@Body('count') count:number){if(!Number.isInteger(count)||count<0||count>9999)throw new BadRequestException('عدد الأحكام غير صالح');return this.service.update(user,id,{tajweedErrors:count});}
  @Patch(':id')
  @Roles(Role.ADMIN, Role.SUPERVISOR, Role.TEACHER)
  @ApiOperation({ summary: 'تعديل سجل تسميع' })
  update(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpdateRecitationDto) {
    return this.service.update(user, id, dto);
  }

  @Delete(':id')
  @Roles(Role.ADMIN, Role.SUPERVISOR, Role.TEACHER)
  @ApiOperation({ summary: 'حذف سجل تسميع' })
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.remove(user, id);
  }
}
