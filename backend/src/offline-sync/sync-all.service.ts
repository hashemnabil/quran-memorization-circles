import { ProfileReviewsService } from '../profile-reviews/profile-reviews.service';
import { SchoolOperationsService } from '../school-operations/school-operations.service';
import { TransfersService } from '../transfers/transfers.service';
import { SuspensionsService } from '../suspensions/suspensions.service';
import { CreateStudentTransferDto, ApproveStudentTransferDto, DecideTransferDto, QueryTransfersDto } from '../transfers/dto/transfer.dto';
import { CreateSuspensionDto, ApproveSuspensionDto, DecideSuspensionDto, ReturnStudentDto, QuerySuspensionsDto } from '../suspensions/dto/suspension.dto';
import { BroadcastDto } from '../notifications/broadcast.dto';
import { BadRequestException, ForbiddenException, HttpException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma, Role } from '@prisma/client';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { createHash, createHmac } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser } from '../common/decorators';
import { AccessControlService } from '../common/services/access-control.service';
import { ActivityService } from '../common/services/activity.service';
import { NotificationsService } from '../notifications/notifications.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { UploadsService } from '../uploads/uploads.service';
import { StudentsService } from '../students/students.service';
import { CreateStudentDto, UpdateStudentDto, QueryStudentsDto, AddNoteDto, StudentQuestionnaireDto } from '../students/dto/student.dto';
import { CirclesService } from '../circles/circles.service';
import { CreateCircleDto, UpdateCircleDto, QueryCirclesDto } from '../circles/dto/circle.dto';
import { TeachersService } from '../teachers/teachers.service';
import { CreateTeacherDto, UpdateTeacherDto, QueryTeachersDto } from '../teachers/dto/teacher.dto';
import { RecitationsService } from '../recitations/recitations.service';
import { CreateRecitationDto, UpdateRecitationDto, QueryRecitationsDto } from '../recitations/dto/recitation.dto';
import { AttendanceService } from '../attendance/attendance.service';
import { RecordAttendanceDto, UpdateAttendanceEntryDto, QueryAttendanceDto } from '../attendance/dto/attendance.dto';
import { ExamsService } from '../exams/exams.service';
import { CreateExamRequestDto, QueryExamRequestsDto, QueryExamsDto, RecordResultDto, UpdateExamDto, ScheduleExamDto, ReviewExamRequestDto } from '../exams/dto/exam.dto';
import { HistoricalExamDto } from '../exams/dto/exam.dto';
import { CoursesService } from '../courses/courses.service';
import { QueryCoursesDto, CreateCourseDto, UpdateCourseDto, RecordCourseAttendanceDto } from '../courses/dto/course.dto';
import { SchedulesService } from '../schedules/schedules.service';
import { UsersService } from '../users/users.service';
import { CreateUserDto, UpdateUserDto, QueryUsersDto, ResetPasswordDto } from '../users/dto/user.dto';
import { PreparationsService } from '../preparations/preparations.service';
import { CreatePreparationDto, UpdatePreparationDto, QueryPreparationsDto } from '../preparations/dto/preparation.dto';
import { SetEvaluationDto, SurahCompletionDto } from '../students/dto/student.dto';
import { AnnouncementsService } from '../announcements/announcements.service';
import { CreateAnnouncementDto, UpdateAnnouncementDto, QueryAnnouncementsDto } from '../announcements/dto/announcement.dto';
import { MediaActivitiesService } from '../media-activities/media-activities.service';
import { CertificatesService } from '../certificates/certificates.service';
import { StaffAttendanceService } from '../staff-attendance/staff-attendance.service';
import { RecordStaffAttendanceDto } from '../staff-attendance/dto/staff-attendance.dto';
import { SettingsService } from '../settings/settings.service';
import { UpdateSettingsDto } from '../settings/dto/settings.dto';

type Operation = { opId: string; accountId?: string; table: string; action: string; entityId: string; data: Record<string, any> };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function canonical(value: any): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
}
@Injectable()
export class FullSyncService {
  constructor(private readonly prisma: PrismaService, private readonly config: ConfigService) {}
  private services(prisma: PrismaService) {
    const acl = new AccessControlService(prisma); const activity = new ActivityService(prisma);
    // Persist notifications inside the transaction. Clients refresh them after commit.
    const notifications = new NotificationsService(prisma, { emitToUser() {} } as unknown as RealtimeGateway);
    const students = new StudentsService(prisma, acl, activity, new UploadsService(this.config));
    const transfers = new TransfersService(prisma, acl, activity, notifications);
    const suspensions = new SuspensionsService(prisma, acl, activity, notifications);
    const operations = new SchoolOperationsService(prisma);
    const preparations = new PreparationsService(prisma, acl, activity, notifications);
    const announcements = new AnnouncementsService(prisma, activity);
    const mediaActivities = new MediaActivitiesService(prisma);
    const certificates = new CertificatesService(prisma, { emitToUser() {} } as unknown as RealtimeGateway);
    return { prisma, acl, students, transfers, suspensions, operations, users: new UsersService(prisma, this.config, activity, acl, new UploadsService(this.config)), notifications, schedules: new SchedulesService(prisma, notifications), circles: new CirclesService(prisma, acl, activity, notifications),
      teachers: new TeachersService(prisma, this.config, activity, acl),
      recitations: new RecitationsService(prisma, acl, activity, students),
      attendance: new AttendanceService(prisma, acl, activity, notifications),
      exams: new ExamsService(prisma, acl, activity, notifications),
      courses: new CoursesService(prisma, activity, notifications), settings: new SettingsService(prisma, activity, new UploadsService(this.config)), preparations, announcements, mediaActivities, certificates };
  }
  async pull(user: AuthUser, table: string, page: number, changedIds?: Set<string>) {
    const s = this.services(this.prisma); const query = { page, limit: 200 };
    const staff = [Role.ADMIN, Role.SUPERVISOR, Role.TEACHER].includes(user.role as any);
    const empty = { data: [], meta: { hasNextPage: false } };
    switch (table) {
      case 'meetings': return { data: user.role === Role.ADMIN && page === 1 ? await s.operations.meetings(user) : [], meta: { hasNextPage: false } };
      case 'examCommittees': return { data: (staff || user.role === Role.EXAM_COMMITTEE) && page === 1 ? await s.operations.committees(user) : [], meta: { hasNextPage: false } };
      case 'absencePermissions': {
        if (![Role.ADMIN, Role.SUPERVISOR, Role.TEACHER, Role.STUDENT].includes(user.role as any)) return empty;
        const scope = await s.acl.studentScope(user);
        const where = user.role === Role.ADMIN ? {} : { student: scope };
        const data = await this.prisma.absencePermissionRequest.findMany({ where, include: { student: { select: { id: true, fullName: true, code: true, circleId: true } }, requester: { select: { id: true, fullName: true, role: true } } }, skip: (page - 1) * 200, take: 200, orderBy: { createdAt: 'desc' } });
        return { data, meta: { hasNextPage: (await this.prisma.absencePermissionRequest.count({ where })) > page * 200 } };
      }
      case 'guardianSummons': return { data: user.role === Role.ADMIN && page === 1 ? await s.attendance.listSummons() : [], meta: { hasNextPage: false } };
      case 'preparations': return s.preparations.findAll(user, plainToInstance(QueryPreparationsDto, query));
      case 'surahCompletions': {
        if (!staff) return empty;
        const where = { student: { ...(await s.acl.studentScope(user)), deletedAt: null } };
        const data = await this.prisma.surahCompletion.findMany({ where, skip: (page - 1) * 200, take: 200, orderBy: { id: 'desc' } });
        return { data, meta: { hasNextPage: (await this.prisma.surahCompletion.count({ where })) > page * 200 } };
      }
      case 'announcements': return user.role === Role.ADMIN
        ? s.announcements.findAll(plainToInstance(QueryAnnouncementsDto, { page, limit: 200 }))
        : { data: await s.announcements.active(user), meta: { hasNextPage: false } };
      case 'mediaActivities': return { data: [Role.ADMIN, Role.SUPERVISOR].includes(user.role as any) && page === 1 ? await s.mediaActivities.list() : [], meta: { hasNextPage: false } };
      case 'schoolSettings': return { data: page === 1 ? [{ id: 'default', ...await s.settings.publicInfo(), ...await s.settings.donationInfo() }] : [], meta: { hasNextPage: false } };
      case 'certificateTemplates': return { data: user.role === Role.ADMIN && page === 1 ? await s.certificates.listTemplates() : [], meta: { hasNextPage: false } };
      case 'certificateRequests': return { data: page === 1 ? user.role === Role.ADMIN ? await s.certificates.listRequests() : user.role === Role.STUDENT ? await s.certificates.myRequests(user) : [] : [], meta: { hasNextPage: false } };
      case 'certificates': return { data: page === 1 ? user.role === Role.ADMIN ? await s.certificates.listIssuedRecords() : user.role === Role.STUDENT ? await s.certificates.myCertificates(user) : [] : [], meta: { hasNextPage: false } };
      case 'transfers': return staff ? s.transfers.findAll(user, plainToInstance(QueryTransfersDto, query)) : empty;
      case 'suspensions': return staff ? s.suspensions.findAll(user, plainToInstance(QuerySuspensionsDto, query)) : empty;
      case 'profileReviews': {
        if (![Role.ADMIN, Role.STUDENT, Role.TEACHER].includes(user.role as any)) return empty;
        const reviews = new ProfileReviewsService(this.prisma);
        return { ...await reviews.list(user, undefined, page), ...(page === 1 && user.role !== Role.ADMIN ? { references: { '/profile-reviews/me': await reviews.mine(user) } } : {}) };
      }
      case 'users': return user.role === Role.ADMIN ? s.users.findAll(plainToInstance(QueryUsersDto, query)) : empty;
      case 'studentAccounts': {
        if (user.role !== Role.ADMIN || page !== 1) return empty;
        const data = await s.students.listAccounts();
        return { data: changedIds ? data.filter(row => changedIds.has(row.id)) : data,
          ...(changedIds ? { visibleIds: data.map(row => row.id) } : {}), meta: { hasNextPage: false } };
      }
      case 'mediaPlans': return { data: user.role === Role.ADMIN && page === 1 ? await s.schedules.media() : [], meta: { hasNextPage: false } };
      case 'teacherDuties': return { data: staff && page === 1 ? await s.schedules.duties(user) : [], meta: { hasNextPage: false } };
      case 'dutyTeachers': return { data: user.role === Role.ADMIN && page === 1 ? await s.schedules.teachers() : [], meta: { hasNextPage: false } };
      case 'students': return user.role === Role.STUDENT ? { data: page === 1 ? [await s.students.getMyProfile(user)] : [], meta: { hasNextPage: false } } : staff ? this.hydratePage(await s.students.findAll(user, plainToInstance(QueryStudentsDto, query)), async (id) => ({ ...await s.students.findOne(user, id), _offline: {
        eligibility: await s.exams.eligibility(user, id), milestones: await s.exams.milestoneRecords(user, id), history: await s.students.history(user, id), progress: await s.recitations.studentProgress(user, id),
      } }), changedIds) : empty;
      case 'circles': return staff ? this.hydratePage(await s.circles.findAll(user, plainToInstance(QueryCirclesDto, query)), (id) => s.circles.findOne(user, id), changedIds) : empty;
      case 'teachers': if (user.role === Role.TEACHER) return { data: page === 1 && user.teacherId ? [await s.teachers.findOne(user, user.teacherId)] : [], meta: { hasNextPage: false } }; return [Role.ADMIN, Role.SUPERVISOR].includes(user.role as any) ? this.hydratePage(await s.teachers.findAll(user, plainToInstance(QueryTeachersDto, query)), (id) => s.teachers.findOne(user, id), changedIds) : empty;
      case 'attendance': return staff ? s.attendance.findAll(user, plainToInstance(QueryAttendanceDto, query)) : empty;
      case 'staffAttendance': {
        if (![Role.ADMIN, Role.SUPERVISOR].includes(user.role as any)) return empty;
        const where = { skip: (page - 1) * 200, take: 200 };
        const [data, total] = await this.prisma.$transaction([
          this.prisma.staffAttendance.findMany({ ...where, include: { user: { select: { id: true, fullName: true, role: true, jobTitle: true } }, recordedBy: { select: { id: true, fullName: true } } }, orderBy: [{ date: 'desc' }, { createdAt: 'desc' }] }),
          this.prisma.staffAttendance.count(),
        ]);
        return { data, meta: { hasNextPage: total > page * 200 } };
      }
      case 'recitations': return staff ? { ...await s.recitations.findAll(user, plainToInstance(QueryRecitationsDto, query)), ...(page === 1 ? { references: { '/recitations/surahs': s.recitations.surahs() } } : {}) } : empty;
      case 'exams': return staff || user.role === Role.EXAM_COMMITTEE ? { ...await s.exams.findExams(user, plainToInstance(QueryExamsDto, query)), ...(page === 1 ? { references: { '/exams/sections': await s.exams.sections() } } : {}) } : empty;
      case 'examRequests': return staff || user.role === Role.EXAM_COMMITTEE ? s.exams.findRequests(user, plainToInstance(QueryExamRequestsDto, query)) : empty;
      case 'courses': return staff ? this.hydratePage(await s.courses.findAll(plainToInstance(QueryCoursesDto, { ...query, ...(user.role === Role.TEACHER ? { instructorId: user.id } : {}) })), async (id) => ({ ...await s.courses.findOne(id, user), _offline: { attendance: await this.prisma.courseAttendance.findMany({ where: { courseId: id }, include: { student: { select: { id: true, fullName: true, code: true } } } }) } }), changedIds) : empty;
      case 'courseAttendance': {
        if (!staff) return empty;
        const where = { course: { ...(user.role === Role.TEACHER ? { instructorId: user.id } : {}), deletedAt: null } };
        const [data, total] = await this.prisma.$transaction([
          this.prisma.courseAttendance.findMany({ where, skip: (page - 1) * 200, take: 200, include: { student: { select: { id: true, fullName: true, code: true } }, course: { select: { id: true, name: true } }, recordedBy: { select: { id: true, fullName: true } } }, orderBy: [{ date: 'desc' }, { createdAt: 'desc' }] }),
          this.prisma.courseAttendance.count({ where }),
        ]);
        return { data, meta: { hasNextPage: total > page * 200 } };
      }
      case 'notifications': return { data: await this.prisma.notification.findMany({ where: { userId: user.id }, skip: (page - 1) * 200, take: 200, orderBy: { id: 'asc' } }), meta: { hasNextPage: (await this.prisma.notification.count({ where: { userId: user.id } })) > page * 200 } };
      case 'behaviors': {
        if (!staff) return empty;
        const where = { deletedAt: null, student: { ...(await s.acl.studentScope(user)), deletedAt: null } };
        const [data, count] = await Promise.all([this.prisma.studentNote.findMany({ where, skip: (page - 1) * 200, take: 200, orderBy: { id: 'asc' } }), this.prisma.studentNote.count({ where })]);
        return { data, meta: { hasNextPage: count > page * 200 } };
      }
      default: throw new BadRequestException('جدول غير مدعوم');
    }
  }
  private async hydratePage(page: any, detail: (id: string) => Promise<any>, changedIds?: Set<string>) {
    const data: any[] = [];
    const rows = changedIds ? page.data.filter((row: any) => changedIds.has(row.id)) : page.data;
    for (let offset = 0; offset < rows.length; offset += 5) {
      data.push(...await Promise.all(rows.slice(offset, offset + 5).map(async (row: any) => ({ ...row, ...await detail(row.id) }))));
    }
    return { ...page, data, ...(changedIds ? { visibleIds: page.data.map((row: any) => row.id) } : {}) };
  }
  async watermark() {
    const rows = await this.prisma.$queryRaw<Array<{ seq: bigint }>>`SELECT COALESCE(MAX("seq"), 0)::bigint AS "seq" FROM sync_changes`;
    return { cursor: rows[0].seq.toString() };
  }
  async delta(user: AuthUser, since: string) {
    if (!/^(0|[1-9]\d*)$/.test(since) || since.length > 19 || BigInt(since) > 9223372036854775807n) throw new BadRequestException('مؤشر غير صالح');
    const changes = await this.prisma.syncChange.findMany({ where: { seq: { gt: BigInt(since) } }, orderBy: { seq: 'asc' }, take: 200 });
    const affected = new Map<string, Set<string> | undefined>();
    const add = (table: string, id?: string) => {
      if (affected.has(table) && !affected.get(table)) return;
      if (!id) { affected.set(table, undefined); return; }
      const ids = affected.get(table) || new Set<string>(); ids.add(id); affected.set(table, ids);
    };
    const direct: Record<string, string> = { profile_reviews: 'profileReviews', absence_permission_requests: 'absencePermissions', guardian_summons: 'guardianSummons', preparation_assignments: 'preparations', surah_completions: 'surahCompletions', announcements: 'announcements', media_activities: 'mediaActivities', school_settings: 'schoolSettings', student_file_requests: 'certificateRequests', certificate_records: 'certificates', certificate_templates: 'certificateTemplates', students: 'students', circles: 'circles', teacher_profiles: 'teachers', attendance: 'attendance', staff_attendance: 'staffAttendance', course_attendance: 'courseAttendance', recitations: 'recitations', exams: 'exams', exam_requests: 'examRequests', student_notes: 'behaviors', notifications: 'notifications', courses: 'courses', media_plans: 'mediaPlans', teacher_duties: 'teacherDuties' };
    for (const change of changes) {
      if (change.entity === 'meetings') add('meetings');
      if (change.entity === 'exam_committees') add('examCommittees');
      if (change.entity === 'transfer_requests') add('transfers');
      if (change.entity === 'suspension_requests') add('suspensions');
      const row = change.payload as any || {};
      if (direct[change.entity]) add(direct[change.entity], change.entityId);
      if (change.entity === 'students') {
        add('studentAccounts', change.entityId);
        if (row.circleId) add('circles', row.circleId);
        if (row._previous?.circleId) add('circles', row._previous.circleId);
      }
      if (row.studentId) add('students', row.studentId);
      if (row.courseId) add('courses', row.courseId);
      if (change.entity === 'exam_request_sections') add('examRequests', row.requestId);
      if (change.entity === 'exam_sections_on_exams') add('exams', row.examId);
      if (change.entity === 'circle_teachers' || change.entity === 'circle_memberships') {
        add('circles', row.circleId); add('teachers', row.teacherId);
        // Assignment changes can grant/revoke entire rosters, not just a single row.
        for (const table of ['students', 'attendance', 'recitations', 'exams', 'examRequests', 'behaviors']) add(table);
      }
      if (change.entity === 'users') {
        add('users', change.entityId);
        const accounts = await this.prisma.student.findMany({ where: { userId: change.entityId }, select: { id: true } });
        for (const account of accounts) add('studentAccounts', account.id);
        const teachers = await this.prisma.teacherProfile.findMany({ where: { userId: change.entityId }, select: { id: true } });
        for (const teacher of teachers) add('teachers', teacher.id);
        add('dutyTeachers');
        if (change.entityId === user.id) {
          for (const table of Object.values(direct)) add(table);
        }
      }
      if (change.entity === 'teacher_duty_assignments') add('teacherDuties', row.dutyId);
      if (change.entity === 'exam_sections') add('exams');
      if (change.entity === 'students' && row._previous && row._previous.circleId !== row.circleId) {
        for (const table of ['circles', 'attendance', 'recitations', 'exams', 'examRequests', 'behaviors']) add(table);
      }
    }
    const tables: Record<string, any> = {};
    for (const [table, ids] of affected) {
      const data: any[] = [], visibleIds: string[] = []; let references = {};
      for (let page = 1; ; page++) {
        const result: any = await this.pull(user, table, page, ids);
        visibleIds.push(...(result.visibleIds || result.data.map((row: any) => row.id)));
        data.push(...(ids ? result.data.filter((row: any) => ids.has(row.id)) : result.data));
        references = { ...references, ...result.references };
        if (!result.meta?.hasNextPage) break;
      }
      tables[table] = { data, visibleIds, references };
    }
    return { tables, changedEntities: [...new Set(changes.map(row => row.entity))], cursor: changes[changes.length - 1]?.seq.toString() || since, hasMore: changes.length === 200 };
  }
  async push(user: AuthUser, body: any) {
    if (!body || !Array.isArray(body.operations) || body.operations.length < 1 || body.operations.length > 50 || new Set(body.operations.map((row: any) => row?.opId)).size !== body.operations.length) throw new BadRequestException('يلزم إرسال 1–50 عملية بمعرفات مختلفة');
    const outcomes: any[] = [];
    for (const op of body.operations as Operation[]) {
      if (!op || op.accountId !== undefined && op.accountId !== user.id || !uuid.test(op.opId) || !uuid.test(op.entityId) || !op.data || typeof op.data !== 'object' || Array.isArray(op.data)) throw new BadRequestException('عملية غير صالحة أو تخص حسابًا آخر');
      try {
        const sensitive = ['password', 'newPassword', 'currentPassword', 'accountPassword'].some(field => op.data[field] !== undefined);
        const secret = sensitive ? this.config.get('JWT_ACCESS_SECRET') : undefined;
        if (sensitive && !secret) throw new BadRequestException('تهيئة مزامنة الحسابات غير مكتملة على الخادم');
        const fingerprint = (sensitive ? createHmac('sha256', secret!) : createHash('sha256'))
          .update(canonical({ table: op.table, action: op.action, entityId: op.entityId, data: op.data })).digest('hex');
        const outcome = await this.prisma.$transaction(async (tx) => {
          // Return an integer: Prisma cannot deserialize PostgreSQL's void lock result.
          await tx.$queryRaw`SELECT 1 FROM (SELECT pg_advisory_xact_lock(hashtext(${user.id}), hashtext(${op.opId}))) AS locked`;
          const previous = await tx.processedOperation.findUnique({ where: { opId_accountId: { opId: op.opId, accountId: user.id } } });
          if (previous) {
            const receipt = previous.result as any;
            if (receipt?.fingerprint !== fingerprint) throw new BadRequestException('استُخدم مفتاح العملية لبيانات مختلفة');
            return receipt.outcome;
          }
          // Domain services use this same transaction, including their nested transaction calls.
          const transactionPrisma = new Proxy(tx, { get(target, key) {
            if (key === '$transaction') return (arg: any) => typeof arg === 'function' ? arg(transactionPrisma) : Promise.all(arg);
            const value = Reflect.get(target, key); return typeof value === 'function' ? value.bind(target) : value;
          } }) as unknown as PrismaService;
          const ids = new Set<string>();
          const collect = (value: any) => { if (typeof value === 'string' && uuid.test(value)) ids.add(value); else if (Array.isArray(value)) value.forEach(collect); else if (value && typeof value === 'object') Object.values(value).forEach(collect); };
          collect(op.entityId); collect(op.data);
          const receipts = ids.size ? await tx.processedOperation.findMany({ where: { accountId: user.id, OR: [...ids].map((id) => ({ result: { path: ['localId'], equals: id } })) } }) : [];
          const mapping = new Map<string, string>(receipts.map((receipt): [string, string] => { const result = receipt.result as any; return [result.localId, result.outcome?.data?.id]; }).filter(([, id]) => typeof id === 'string'));
          const resolve = (value: any): any => { if (typeof value === 'string') return mapping.get(value) || value; if (Array.isArray(value)) return value.map(resolve); if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, resolve(item)])); return value; };
          const result = await this.apply(this.services(transactionPrisma), user, { ...op, entityId: resolve(op.entityId), data: resolve(op.data) });
          const outcome = JSON.parse(JSON.stringify({ opId: op.opId, status: 'applied', data: result }, (key, value) =>
            ['password', 'newPassword', 'currentPassword', 'accountPassword', 'temporaryPassword', 'passwordHash'].includes(key) ? undefined : value));
          await tx.processedOperation.create({ data: { opId: op.opId, accountId: user.id, result: { fingerprint, outcome, ...(['create','schedule','historical'].includes(op.action) ? { localId: op.entityId } : {}) } as Prisma.InputJsonValue } });
          return outcome;
        }, { timeout: 30000 });
        outcomes.push(outcome);
      } catch (error) {
        if (!(error instanceof HttpException) || error.getStatus() >= 500) throw error;
        outcomes.push({ opId: op.opId, status: 'rejected', message: error.message });
        break; // Preserve dependency ordering after a rejection.
      }
    }
    return { outcomes };
  }
  private async dto(Type: new () => any, data: any) {
    const { id: _id, pendingDelete: _deleted, ...payload } = data;
    const dto = plainToInstance(Type, payload);
    if ((await validate(dto, { whitelist: true, forbidNonWhitelisted: true })).length) throw new BadRequestException('بيانات غير صالحة للمزامنة');
    return dto;
  }
  private async apply(s: ReturnType<FullSyncService['services']>, user: AuthUser, op: Operation) {
    const staff = [Role.ADMIN, Role.SUPERVISOR, Role.TEACHER].includes(user.role as any);
    const admin = user.role === Role.ADMIN;
    const id = op.entityId;
    if (['meetings', 'examCommittees'].includes(op.table)) {
      if (op.action === 'delete') return s.operations.remove(user, op.table as any, id);
      if (['create','update'].includes(op.action)) return s.operations.write(user, op.table as any, op.data, id, op.action === 'create');
    }
    if (staff && ['transfers','suspensions'].includes(op.table)) {
      const pick = (fields: string[]) => Object.fromEntries(fields.filter(field => op.data[field] !== undefined).map(field => [field, op.data[field]]));
      if (op.action !== 'create' && op.action !== 'cancel' && !admin) throw new ForbiddenException('قرار الطلب للإدارة فقط');
      if (op.table === 'transfers') {
        if (op.action === 'create') return s.transfers.requestStudentTransfer(user, await this.dto(CreateStudentTransferDto, pick(['studentId','reason'])));
        if (op.action === 'approve') return s.transfers.approve(user, id, await this.dto(ApproveStudentTransferDto, pick(['toCircleId','decisionNote'])));
        if (op.action === 'reject') return s.transfers.reject(user, id, await this.dto(DecideTransferDto, pick(['decisionNote'])));
        if (op.action === 'cancel') return s.transfers.cancel(user, id);
      } else {
        if (op.action === 'create') return s.suspensions.request(user, await this.dto(CreateSuspensionDto, pick(['studentId','reason'])));
        if (op.action === 'approve') return s.suspensions.approve(user, id, await this.dto(ApproveSuspensionDto, pick(['action','durationDays','startDate','decisionNote'])));
        if (op.action === 'reject') return s.suspensions.reject(user, id, await this.dto(DecideSuspensionDto, pick(['decisionNote'])));
        if (op.action === 'return') return s.suspensions.returnStudent(user, id, await this.dto(ReturnStudentDto, pick(['note','circleId'])));
        if (op.action === 'cancel') return s.suspensions.cancel(user, id);
      }
    }
    if (admin && op.table === 'users') {
      if (op.action === 'create') return s.users.create(user, await this.dto(CreateUserDto, op.data));
      if (op.action === 'update') return s.users.update(user, id, await this.dto(UpdateUserDto, op.data));
      if (op.action === 'reset-password') {
        await s.users.resetPassword(user, id, await this.dto(ResetPasswordDto, op.data));
        return s.users.findOne(id);
      }
    }
    if (admin && op.table === 'studentAccounts' && ['create', 'reset-password'].includes(op.action)) {
      const dto = await this.dto(ResetPasswordDto, { newPassword: op.data.password });
      if (op.action === 'create') await s.students.createAccountForStudent(user, id, dto.newPassword);
      else await s.students.resetStudentAccountPassword(user, id, dto.newPassword);
      // Idempotency receipts never retain the temporary password.
      return (await s.students.listAccounts()).find(row => row.id === id);
    }
    if (admin && ['mediaPlans', 'teacherDuties'].includes(op.table)) {
      const { id: _id, pendingDelete: _deleted, ...payload } = op.data;
      if (op.table === 'mediaPlans') {
        if (op.action === 'create') return s.schedules.createMedia(user, payload);
        if (op.action === 'update') return s.schedules.updateMedia(id, payload);
        if (op.action === 'delete') return s.schedules.deleteMedia(id);
      } else {
        if (op.action === 'delete') return s.schedules.deleteDuty(id);
        const duty = op.action === 'create' ? await s.schedules.createDuty(user, payload) : op.action === 'update' ? await s.schedules.updateDuty(id, payload) : null;
        if (duty) return (await s.schedules.duties(user)).find((row) => row.id === duty.id);
      }
    }
    if (op.table === 'courses' && [Role.ADMIN, Role.SUPERVISOR].includes(user.role as any)) {
      if (op.action === 'create') return s.courses.create(user, await this.dto(CreateCourseDto, op.data));
      if (op.action === 'update') return s.courses.update(user, id, await this.dto(UpdateCourseDto, op.data));
      if (op.action === 'delete' && admin) return s.courses.remove(user, id);
    }
    if (op.table === 'schoolSettings' && user.role === Role.ADMIN && op.action === 'update') {
      // Settings are queued from a cached singleton row. Storage/server
      // metadata is not part of the editable DTO (also handles old queues).
      const { id: _id, accountId: _account, synced: _synced, updatedAt: _updated,
        createdAt: _created, pendingDelete: _deleted, ...settings } = op.data;
      return s.settings.update(user, await this.dto(UpdateSettingsDto, settings));
    }
    if (op.table === 'staffAttendance' && [Role.ADMIN, Role.SUPERVISOR].includes(user.role as any) && op.action === 'create') {
      const service = new StaffAttendanceService(s.prisma, new ActivityService(s.prisma));
      return service.record(user, await this.dto(RecordStaffAttendanceDto, op.data));
    }
    if (op.table === 'courseAttendance' && [Role.ADMIN, Role.SUPERVISOR, Role.TEACHER].includes(user.role as any) && op.action === 'create') {
      if (!op.data.courseId) throw new BadRequestException('ط§ط®طھط± ط¯ظˆط±ط© ظ„طھط³ط¬ظٹظ„ ط§ظ„ط­ط¶ظˆط±');
      return s.courses.recordAttendance(user, op.data.courseId, await this.dto(RecordCourseAttendanceDto, op.data));
    }
    if (op.table === 'profileReviews') {
      const reviews = new ProfileReviewsService(s.prisma);
      if (op.action === 'create') return reviews.submit(user, op.data.patch, id);
      if (op.action === 'decision') return reviews.decide(user, id, op.data.status, op.data.reason);
      throw new BadRequestException('عملية غير مدعومة');
    }
    if (op.table === 'absencePermissions') {
      if (op.action === 'create') return s.attendance.createAbsencePermission(user, op.data as { studentId: string; date: string; reason: string });
      if (op.action === 'approve' && admin) return s.attendance.decideAbsencePermission(user, id, true, op.data.decisionNote);
      if (op.action === 'reject' && admin) return s.attendance.decideAbsencePermission(user, id, false, op.data.decisionNote);
    }
    if (op.table === 'guardianSummons' && admin && op.action === 'create') return s.attendance.createSummons(user, op.data as { studentId: string; title: string; body: string });
    if (op.table === 'preparations') {
      if (op.action === 'create') return s.preparations.create(user, await this.dto(CreatePreparationDto, op.data));
      if (op.action === 'update') return s.preparations.update(user, id, await this.dto(UpdatePreparationDto, op.data));
      if (op.action === 'complete' || op.action === 'reopen') return s.preparations.setCompleted(user, id, op.action === 'complete');
      if (op.action === 'delete') return s.preparations.remove(user, id);
    }
    if (op.table === 'announcements' && admin) {
      if (op.action === 'create') return s.announcements.create(user, await this.dto(CreateAnnouncementDto, op.data));
      if (op.action === 'update') return s.announcements.update(user, id, await this.dto(UpdateAnnouncementDto, op.data));
      if (op.action === 'delete') return s.announcements.remove(user, id);
    }
    if (op.table === 'mediaActivities' && [Role.ADMIN, Role.SUPERVISOR].includes(user.role as any)) {
      if (op.action === 'create') return s.mediaActivities.create(user, op.data);
      if (op.action === 'delete') return s.mediaActivities.remove(id);
    }
    if (op.table === 'certificateRequests') {
      if (op.action === 'create' && user.role === Role.STUDENT) return s.certificates.createRequest(user, op.data);
      if (op.action === 'decision' && admin) return s.certificates.decideRequest(user, id, op.data);
    }
    if (op.table === 'certificateTemplates' && admin) {
      if (op.action === 'create') return s.certificates.createTemplate(user, op.data);
      if (op.action === 'deactivate') return s.certificates.deactivateTemplate(id);
    }
    if (op.table === 'surahCompletions') {
      if (op.action === 'create') return s.students.completeSurah(user, op.data.studentId, await this.dto(SurahCompletionDto, op.data));
      if (op.action === 'delete') return s.students.removeSurahCompletion(user, op.data.studentId, id);
    }
    if (op.table === 'notifications') {
      if (op.action === 'broadcast') {
        const result = await s.notifications.broadcast(user, await this.dto(BroadcastDto, op.data));
        return { id, ...result, pendingDelete: 1, isRead: true };
      }
      if (op.action === 'read') return s.notifications.markRead(user, id);
      if (op.action === 'delete') return s.notifications.remove(user, id);
    }
    if (op.table === 'students' && user.role === Role.STUDENT && op.action === 'questionnaire') {
      return s.students.updateMyQuestionnaire(user, await this.dto(StudentQuestionnaireDto, op.data), id);
    }
    if (op.table === 'students' && staff) {
      if (op.action === 'evaluation') return s.students.setEvaluation(user, id, await this.dto(SetEvaluationDto, { evaluation: op.data.evaluation, note: op.data.note }));
      if (op.action === 'create') return s.students.create(user, await this.dto(CreateStudentDto, op.data));
      if (op.action === 'update') return s.students.update(user, id, await this.dto(UpdateStudentDto, op.data));
      if (op.action === 'delete' && admin) return s.students.remove(user, id);
    }
    if (op.table === 'circles' && (admin || user.role === Role.SUPERVISOR && op.action === 'update')) {
      if (op.action === 'create') return s.circles.create(user, await this.dto(CreateCircleDto, op.data));
      if (op.action === 'update') return s.circles.update(user, id, await this.dto(UpdateCircleDto, op.data));
      if (op.action === 'delete') return s.circles.remove(user, id);
    }
    if (op.table === 'teachers' && (admin || user.role === Role.TEACHER && op.action === 'update')) {
      if (op.action === 'create') return s.teachers.create(user, await this.dto(CreateTeacherDto, op.data));
      if (op.action === 'update') return s.teachers.update(user, id, await this.dto(UpdateTeacherDto, op.data));
      if (op.action === 'delete') return s.teachers.remove(user, id);
    }
    if (op.table === 'recitations' && staff) {
      if (op.action === 'create') return s.recitations.create(user, await this.dto(CreateRecitationDto, op.data));
      if (op.action === 'update') return s.recitations.update(user, id, await this.dto(UpdateRecitationDto, op.data));
      if (op.action === 'delete') return s.recitations.remove(user, id);
    }
    if (op.table === 'attendance' && staff) {
      if (op.action === 'create') {
        const dto = await this.dto(RecordAttendanceDto, op.data);
        const result = await s.attendance.record(user, dto);
        const rows = await s.prisma.attendance.findMany({ where: { circleId: dto.circleId, date: new Date(`${dto.date}T00:00:00.000Z`) }, include: { student: { select: { id: true, fullName: true, code: true } } } });
        return { ...result, rows };
      }
      if (op.action === 'update') return s.attendance.updateRecord(user, id, await this.dto(UpdateAttendanceEntryDto, op.data));
    }
    if (op.table === 'examRequests' && staff && op.action === 'create') return s.exams.requestExam(user, await this.dto(CreateExamRequestDto, op.data));
    if (op.table === 'examRequests' && [Role.ADMIN,Role.EXAM_COMMITTEE].includes(user.role as any) && op.action === 'reject') return s.exams.rejectRequest(user,id,await this.dto(ReviewExamRequestDto,Object.fromEntries(Object.entries(op.data).filter(([key])=>key==='reviewNote'))));
    if (op.table === 'examRequests' && (staff || user.role===Role.EXAM_COMMITTEE) && op.action === 'cancel') return s.exams.cancelRequest(user,id);
    if (op.table === 'exams' && [Role.ADMIN, Role.EXAM_COMMITTEE].includes(user.role as any)) {
      if(op.action==='historical'&&admin)return s.exams.recordHistorical(user,await this.dto(HistoricalExamDto,Object.fromEntries(['studentId','sectionId','committeeId','combinedStage','score','notes','mistakes','alerts','tajweed','mistakePenalty','alertPenalty'].filter(key=>op.data[key]!==undefined).map(key=>[key,op.data[key]]))));
      if (op.action === 'schedule') {
        const payload=Object.fromEntries(['scheduledAt','examinerId','location','notes','committeeId'].filter(key=>op.data[key]!==undefined).map(key=>[key,op.data[key]]));
        return s.exams.scheduleExam(user,op.data.requestId,await this.dto(ScheduleExamDto,payload));
      }
      if (op.action === 'update') return s.exams.updateExam(user, id, await this.dto(UpdateExamDto, op.data));
      if (op.action === 'result') return s.exams.recordResult(user, id, await this.dto(RecordResultDto, op.data));
    }
    if (op.table === 'behaviors' && staff && op.action === 'create') {
      const { studentId, ...payload } = op.data;
      return s.students.addNote(user, studentId, await this.dto(AddNoteDto, payload));
    }
    throw new ForbiddenException('العملية غير مدعومة أو غير مسموحة لهذا الحساب');
  }
}
