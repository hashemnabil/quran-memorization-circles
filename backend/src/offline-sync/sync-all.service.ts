import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma, Role } from '@prisma/client';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { createHash } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser } from '../common/decorators';
import { AccessControlService } from '../common/services/access-control.service';
import { ActivityService } from '../common/services/activity.service';
import { NotificationsService } from '../notifications/notifications.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { UploadsService } from '../uploads/uploads.service';
import { StudentsService } from '../students/students.service';
import { CreateStudentDto, UpdateStudentDto, QueryStudentsDto, AddNoteDto } from '../students/dto/student.dto';
import { CirclesService } from '../circles/circles.service';
import { CreateCircleDto, UpdateCircleDto, QueryCirclesDto } from '../circles/dto/circle.dto';
import { TeachersService } from '../teachers/teachers.service';
import { CreateTeacherDto, UpdateTeacherDto, QueryTeachersDto } from '../teachers/dto/teacher.dto';
import { RecitationsService } from '../recitations/recitations.service';
import { CreateRecitationDto, UpdateRecitationDto, QueryRecitationsDto } from '../recitations/dto/recitation.dto';
import { AttendanceService } from '../attendance/attendance.service';
import { RecordAttendanceDto, UpdateAttendanceEntryDto, QueryAttendanceDto } from '../attendance/dto/attendance.dto';
import { ExamsService } from '../exams/exams.service';
import { CreateExamRequestDto, QueryExamRequestsDto, QueryExamsDto, RecordResultDto, UpdateExamDto } from '../exams/dto/exam.dto';
import { CoursesService } from '../courses/courses.service';
import { QueryCoursesDto, CreateCourseDto, UpdateCourseDto } from '../courses/dto/course.dto';
import { SchedulesService } from '../schedules/schedules.service';

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
    return { prisma, acl, students, notifications, schedules: new SchedulesService(prisma, notifications), circles: new CirclesService(prisma, acl, activity, notifications),
      teachers: new TeachersService(prisma, this.config, activity, acl),
      recitations: new RecitationsService(prisma, acl, activity, students),
      attendance: new AttendanceService(prisma, acl, activity, notifications),
      exams: new ExamsService(prisma, acl, activity, notifications),
      courses: new CoursesService(prisma, activity, notifications) };
  }
  async pull(user: AuthUser, table: string, page: number) {
    const s = this.services(this.prisma); const query = { page, limit: 200 };
    const staff = [Role.ADMIN, Role.SUPERVISOR, Role.TEACHER].includes(user.role as any);
    const empty = { data: [], meta: { hasNextPage: false } };
    switch (table) {
      case 'mediaPlans': return { data: user.role === Role.ADMIN && page === 1 ? await s.schedules.media() : [], meta: { hasNextPage: false } };
      case 'teacherDuties': return { data: staff && page === 1 ? await s.schedules.duties(user) : [], meta: { hasNextPage: false } };
      case 'dutyTeachers': return { data: user.role === Role.ADMIN && page === 1 ? await s.schedules.teachers() : [], meta: { hasNextPage: false } };
      case 'students': return staff ? this.hydratePage(await s.students.findAll(user, plainToInstance(QueryStudentsDto, query)), async (id) => ({ ...await s.students.findOne(user, id), _offline: {
        eligibility: await s.exams.eligibility(user, id), milestones: await s.exams.milestoneRecords(user, id), history: await s.students.history(user, id), progress: await s.recitations.studentProgress(user, id),
      } })) : empty;
      case 'circles': return staff ? this.hydratePage(await s.circles.findAll(user, plainToInstance(QueryCirclesDto, query)), (id) => s.circles.findOne(user, id)) : empty;
      case 'teachers': return [Role.ADMIN, Role.SUPERVISOR].includes(user.role as any) ? this.hydratePage(await s.teachers.findAll(user, plainToInstance(QueryTeachersDto, query)), (id) => s.teachers.findOne(user, id)) : empty;
      case 'attendance': return staff ? s.attendance.findAll(user, plainToInstance(QueryAttendanceDto, query)) : empty;
      case 'recitations': return staff ? { ...await s.recitations.findAll(user, plainToInstance(QueryRecitationsDto, query)), ...(page === 1 ? { references: { '/recitations/surahs': s.recitations.surahs() } } : {}) } : empty;
      case 'exams': return staff || user.role === Role.EXAM_COMMITTEE ? { ...await s.exams.findExams(user, plainToInstance(QueryExamsDto, query)), ...(page === 1 ? { references: { '/exams/sections': await s.exams.sections() } } : {}) } : empty;
      case 'examRequests': return staff || user.role === Role.EXAM_COMMITTEE ? s.exams.findRequests(user, plainToInstance(QueryExamRequestsDto, query)) : empty;
      case 'courses': return staff ? this.hydratePage(await s.courses.findAll(plainToInstance(QueryCoursesDto, { ...query, ...(user.role === Role.TEACHER ? { instructorId: user.id } : {}) })), async (id) => ({ ...await s.courses.findOne(id), _offline: { attendance: await this.prisma.courseAttendance.findMany({ where: { courseId: id }, include: { student: { select: { id: true, fullName: true, code: true } } } }) } })) : empty;
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
  private async hydratePage(page: any, detail: (id: string) => Promise<any>) {
    const data: any[] = [];
    for (let offset = 0; offset < page.data.length; offset += 5) {
      data.push(...await Promise.all(page.data.slice(offset, offset + 5).map(async (row: any) => ({ ...row, ...await detail(row.id) }))));
    }
    return { ...page, data };
  }
  async push(user: AuthUser, body: any) {
    if (!body || !Array.isArray(body.operations) || body.operations.length < 1 || body.operations.length > 50 || new Set(body.operations.map((row: any) => row?.opId)).size !== body.operations.length) throw new BadRequestException('يلزم إرسال 1–50 عملية بمعرفات مختلفة');
    const outcomes: any[] = [];
    for (const op of body.operations as Operation[]) {
      if (!op || op.accountId !== undefined && op.accountId !== user.id || !uuid.test(op.opId) || !uuid.test(op.entityId) || !op.data || typeof op.data !== 'object' || Array.isArray(op.data)) throw new BadRequestException('عملية غير صالحة أو تخص حسابًا آخر');
      try {
        const fingerprint = createHash('sha256').update(canonical({ table: op.table, action: op.action, entityId: op.entityId, data: op.data })).digest('hex');
        const outcome = await this.prisma.$transaction(async (tx) => {
          await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${user.id}), hashtext(${op.opId}))`;
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
          const outcome = JSON.parse(JSON.stringify({ opId: op.opId, status: 'applied', data: result }));
          await tx.processedOperation.create({ data: { opId: op.opId, accountId: user.id, result: { fingerprint, outcome, ...(op.action === 'create' ? { localId: op.entityId } : {}) } as Prisma.InputJsonValue } });
          return outcome;
        }, { timeout: 30000 });
        outcomes.push(outcome);
      } catch (error) {
        outcomes.push({ opId: op.opId, status: 'rejected', message: error instanceof Error ? error.message : 'تعذر حفظ العملية' });
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
    if (op.table === 'notifications') {
      if (op.action === 'read') return s.notifications.markRead(user, id);
      if (op.action === 'delete') return s.notifications.remove(user, id);
    }
    if (op.table === 'students' && staff) {
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
    if (op.table === 'exams' && [Role.ADMIN, Role.EXAM_COMMITTEE].includes(user.role as any)) {
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
