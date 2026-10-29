import { Controller, Get, Module } from '@nestjs/common';
import { Role } from '@prisma/client';
import { Roles } from '../common/decorators';
import { PrismaService } from '../prisma/prisma.service';
import { FounderAssetsController } from './assets.controller';
import { PopupsController } from './popups.controller';

@Controller('founder')
@Roles(Role.FOUNDER)
export class FounderController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('overview')
  async overview() {
    const [users, students, teachers, supervisors, circles, courses] = await Promise.all([
      this.prisma.user.count({ where: { deletedAt: null } }),
      this.prisma.student.count({ where: { deletedAt: null } }),
      this.prisma.user.count({ where: { deletedAt: null, role: Role.TEACHER } }),
      this.prisma.user.count({ where: { deletedAt: null, role: Role.SUPERVISOR } }),
      this.prisma.circle.count({ where: { deletedAt: null } }),
      this.prisma.course.count({ where: { deletedAt: null } }),
    ]);
    return { users, students, teachers, supervisors, circles, courses, checkedAt: new Date().toISOString() };
  }

  @Get('audit')
  audit() {
    // Read only. Do not expose metadata, message content, tokens or passwords.
    return this.prisma.activityLog.findMany({
      take: 100, orderBy: { createdAt: 'desc' },
      select: { id: true, userId: true, action: true, summary: true, entityType: true, entityId: true, createdAt: true },
    });
  }

  @Get('school')
  async school() {
    const [circles, courses, attendance, exams, certificates] = await Promise.all([
      this.prisma.circle.findMany({ where: { deletedAt: null }, select: { id: true, name: true, code: true, isActive: true }, take: 200, orderBy: { name: 'asc' } }),
      this.prisma.course.findMany({ where: { deletedAt: null }, select: { id: true, name: true, code: true }, take: 200, orderBy: { name: 'asc' } }),
      this.prisma.attendance.groupBy({ by: ['status'], _count: true }),
      this.prisma.exam.count(), this.prisma.certificateRecord.count(),
    ]);
    return { circles, courses, attendance, exams, certificates, checkedAt: new Date().toISOString(), listLimit: 200 };
  }

  @Get('system')
  async system() {
    const [latestChange, latestOperation] = await Promise.all([
      this.prisma.syncChange.findFirst({ orderBy: { seq: 'desc' }, select: { seq: true, changedAt: true } }),
      this.prisma.activityLog.findFirst({ orderBy: { createdAt: 'desc' }, select: { createdAt: true } }),
    ]);
    return { database: 'reachable', latestChange: latestChange ? { revision: String(latestChange.seq), changedAt: latestChange.changedAt } : null, latestActivityAt: latestOperation?.createdAt || null, backupStatus: 'not_integrated', clientsSyncStatus: 'not_available', checkedAt: new Date().toISOString() };
  }
}

@Module({ controllers: [FounderController, FounderAssetsController, PopupsController] })
export class FounderModule {}
