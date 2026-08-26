import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './prisma/prisma.module';
import { CommonModule } from './common/common.module';
import { RealtimeModule } from './realtime/realtime.module';
import { AuthModule } from './auth/auth.module';
import { NotificationsModule } from './notifications/notifications.module';
import { UsersModule } from './users/users.module';
import { TeachersModule } from './teachers/teachers.module';
import { ParentsModule } from './parents/parents.module';
import { CirclesModule } from './circles/circles.module';
import { StudentsModule } from './students/students.module';
import { AttendanceModule } from './attendance/attendance.module';
import { RecitationsModule } from './recitations/recitations.module';
import { TransfersModule } from './transfers/transfers.module';
import { SuspensionsModule } from './suspensions/suspensions.module';
import { ExamsModule } from './exams/exams.module';
import { SupportModule } from './support/support.module';
import { ChatModule } from './chat/chat.module';
import { SettingsModule } from './settings/settings.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { UploadsModule } from './uploads/uploads.module';
import { CoursesModule } from './courses/courses.module';
import { AnnouncementsModule } from './announcements/announcements.module';
import { StaffAttendanceModule } from './staff-attendance/staff-attendance.module';
import { PreparationsModule } from './preparations/preparations.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: ['.env'] }),

    // Infrastructure (all global).
    PrismaModule,
    CommonModule,
    RealtimeModule,
    UploadsModule,
    AuthModule,
    NotificationsModule,

    // Domain.
    UsersModule,
    TeachersModule,
    ParentsModule,
    CirclesModule,
    StudentsModule,
    AttendanceModule,
    RecitationsModule,
    TransfersModule,
    SuspensionsModule,
    ExamsModule,
    SupportModule,
    ChatModule,
    SettingsModule,
    DashboardModule,
    CoursesModule,
    AnnouncementsModule,
    StaffAttendanceModule,
    PreparationsModule,
  ],
})
export class AppModule {}
