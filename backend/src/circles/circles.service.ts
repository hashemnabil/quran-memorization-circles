import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CircleTeacherRole, NotificationType, Prisma, Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AccessControlService } from '../common/services/access-control.service';
import { ActivityService } from '../common/services/activity.service';
import { NotificationsService } from '../notifications/notifications.service';
import { AuthUser } from '../common/decorators';
import { paginate } from '../common/dto/pagination.dto';
import {
  AssignTeacherDto,
  CreateCircleDto,
  QueryCirclesDto,
  SetSupervisorDto,
  UpdateCircleDto,
} from './dto/circle.dto';

const TEACHER_LINK_SELECT = {
  id: true,
  role: true,
  startedAt: true,
  teacher: {
    select: {
      id: true,
      isActive: true,
      user: { select: { id: true, fullName: true, phone: true, avatarUrl: true } },
    },
  },
} satisfies Prisma.CircleTeacherSelect;

@Injectable()
export class CirclesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly acl: AccessControlService,
    private readonly activity: ActivityService,
    private readonly notifications: NotificationsService,
  ) {}

  async findAll(user: AuthUser, query: QueryCirclesDto) {
    const allowed = await this.acl.accessibleCircleIds(user);

    const where: Prisma.CircleWhereInput = {
      deletedAt: null,
      ...(allowed !== null ? { id: { in: allowed } } : {}),
      ...(query.isActive !== undefined ? { isActive: query.isActive } : {}),
      ...(query.supervisorId ? { supervisorId: query.supervisorId } : {}),
      ...(query.teacherId
        ? { teachers: { some: { teacherId: query.teacherId, endedAt: null } } }
        : {}),
      ...(query.search
        ? {
            OR: [
              { name: { contains: query.search, mode: 'insensitive' } },
              { code: { contains: query.search, mode: 'insensitive' } },
              { location: { contains: query.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.circle.findMany({
        where,
        include: {
          supervisor: { select: { id: true, fullName: true, phone: true } },
          teachers: { where: { endedAt: null }, select: TEACHER_LINK_SELECT },
          _count: { select: { students: { where: { deletedAt: null } } } },
        },
        orderBy:
          query.sortBy === 'name' ? { name: query.sortOrder } : { createdAt: query.sortOrder || 'desc' },
        skip: query.skip,
        take: query.take,
      }),
      this.prisma.circle.count({ where }),
    ]);

    const data = rows.map((c) => this.shape(c));
    return paginate(data, total, query.page, query.limit);
  }

  async findOne(user: AuthUser, id: string) {
    await this.acl.assertCircleAccess(user, id);

    const circle = await this.prisma.circle.findFirst({
      where: { id, deletedAt: null },
      include: {
        supervisor: { select: { id: true, fullName: true, phone: true, email: true } },
        teachers: {
          where: { endedAt: null },
          select: TEACHER_LINK_SELECT,
        },
        students: {
          where: { deletedAt: null },
          select: {
            id: true,
            code: true,
            fullName: true,
            status: true,
            evaluation: true,
            memorizedParts: true,
            guardianPhone: true,
          },
          orderBy: { fullName: 'asc' },
        },
      },
    });
    if (!circle) throw new NotFoundException('الحلقة غير موجودة');

    const [attendanceToday, recitationsThisWeek] = await Promise.all([
      this.prisma.attendance.groupBy({
        by: ['status'],
        where: { circleId: id, date: this.today() },
        _count: { _all: true },
      }),
      this.prisma.recitation.count({
        where: { circleId: id, date: { gte: this.daysAgo(7) }, deletedAt: null },
      }),
    ]);

    return {
      ...this.shape(circle),
      stats: {
        attendanceToday: attendanceToday.map((a) => ({ status: a.status, count: a._count._all })),
        recitationsThisWeek,
        activeStudents: circle.students.filter((s) => s.status === 'ACTIVE').length,
        suspendedStudents: circle.students.filter((s) => s.status === 'SUSPENDED').length,
      },
    };
  }

  /** Circles the teacher / supervisor can pick from in dropdowns. */
  async options(user: AuthUser) {
    const allowed = await this.acl.accessibleCircleIds(user);
    return this.prisma.circle.findMany({
      where: {
        deletedAt: null,
        isActive: true,
        ...(allowed !== null ? { id: { in: allowed } } : {}),
      },
      select: { id: true, name: true, code: true },
      orderBy: { name: 'asc' },
    });
  }

  async create(actor: AuthUser, dto: CreateCircleDto) {
    const code = dto.code?.trim() || (await this.nextCode());
    const dup = await this.prisma.circle.findUnique({ where: { code } });
    if (dup) throw new ConflictException('رمز الحلقة مستخدم مسبقاً');

    if (dto.supervisorId) await this.assertSupervisor(dto.supervisorId);
    // Accepts either an existing teacher-profile id, or the id of a supervisor
    // acting as their own circle's teacher (same account, no new user created).
    const primaryTeacherId = dto.primaryTeacherId
      ? await this.resolvePrimaryTeacherId(dto.primaryTeacherId)
      : null;

    const circle = await this.prisma.$transaction(async (tx) => {
      const created = await tx.circle.create({
        data: {
          name: dto.name,
          code,
          description: dto.description,
          location: dto.location,
          level: dto.level,
          capacity: dto.capacity ?? 25,
          scheduleDays: dto.scheduleDays ?? [],
          startTime: dto.startTime,
          endTime: dto.endTime,
          supervisorId: dto.supervisorId || null,
          isActive: dto.isActive ?? true,
        },
      });

      if (primaryTeacherId) {
        await tx.circleTeacher.create({
          data: {
            circleId: created.id,
            teacherId: primaryTeacherId,
            role: CircleTeacherRole.PRIMARY,
          },
        });
      }
      return created;
    });

    await this.activity.log({
      userId: actor.id,
      action: 'CIRCLE_CREATE',
      summary: `إنشاء حلقة جديدة: ${circle.name}`,
      entityType: 'Circle',
      entityId: circle.id,
    });

    if (dto.supervisorId) {
      await this.notifications.notify({
        userId: dto.supervisorId,
        type: NotificationType.SYSTEM,
        title: 'تم إسنادك كمشرف على حلقة',
        body: `تم تعيينك مشرفاً على حلقة "${circle.name}"`,
        link: `/circles/${circle.id}`,
      });
    }

    return this.findOne(actor, circle.id);
  }

  async update(actor: AuthUser, id: string, dto: UpdateCircleDto) {
    const circle = await this.prisma.circle.findFirst({ where: { id, deletedAt: null } });
    if (!circle) throw new NotFoundException('الحلقة غير موجودة');

    // Supervisors may adjust their own circles' schedule but not reassign supervision.
    if (actor.role === Role.SUPERVISOR) {
      await this.acl.assertCircleWriteAccess(actor, id);
      if (dto.supervisorId !== undefined || dto.primaryTeacherId !== undefined) {
        throw new BadRequestException('تعيين المشرف أو المعلم الأساسي من صلاحيات الإدارة');
      }
    }

    if (dto.code && dto.code !== circle.code) {
      const dup = await this.prisma.circle.findUnique({ where: { code: dto.code } });
      if (dup) throw new ConflictException('رمز الحلقة مستخدم مسبقاً');
    }
    if (dto.supervisorId) await this.assertSupervisor(dto.supervisorId);

    const updated = await this.prisma.circle.update({
      where: { id },
      data: {
        name: dto.name,
        code: dto.code,
        description: dto.description,
        location: dto.location,
        level: dto.level,
        capacity: dto.capacity,
        scheduleDays: dto.scheduleDays,
        startTime: dto.startTime,
        endTime: dto.endTime,
        isActive: dto.isActive,
        ...(dto.supervisorId !== undefined ? { supervisorId: dto.supervisorId || null } : {}),
      },
    });

    if (dto.primaryTeacherId !== undefined && dto.primaryTeacherId) {
      await this.setPrimaryTeacher(actor, id, { teacherId: dto.primaryTeacherId });
    }

    await this.activity.log({
      userId: actor.id,
      action: 'CIRCLE_UPDATE',
      summary: `تعديل بيانات الحلقة: ${updated.name}`,
      entityType: 'Circle',
      entityId: id,
    });

    return this.findOne(actor, id);
  }

  async setSupervisor(actor: AuthUser, id: string, dto: SetSupervisorDto) {
    const circle = await this.prisma.circle.findFirst({ where: { id, deletedAt: null } });
    if (!circle) throw new NotFoundException('الحلقة غير موجودة');
    if (dto.supervisorId) await this.assertSupervisor(dto.supervisorId);

    await this.prisma.circle.update({
      where: { id },
      data: { supervisorId: dto.supervisorId || null },
    });

    if (dto.supervisorId) {
      await this.notifications.notify({
        userId: dto.supervisorId,
        type: NotificationType.SYSTEM,
        title: 'تم إسنادك كمشرف على حلقة',
        body: `تم تعيينك مشرفاً على حلقة "${circle.name}"`,
        link: `/circles/${id}`,
      });
    }

    await this.activity.log({
      userId: actor.id,
      action: 'CIRCLE_SET_SUPERVISOR',
      summary: dto.supervisorId
        ? `تعيين مشرف لحلقة ${circle.name}`
        : `إزالة مشرف حلقة ${circle.name}`,
      entityType: 'Circle',
      entityId: id,
    });

    return this.findOne(actor, id);
  }

  /** Makes a teacher the primary teacher, demoting the previous one to "ended". */
  async setPrimaryTeacher(actor: AuthUser, circleId: string, dto: AssignTeacherDto) {
    const circle = await this.prisma.circle.findFirst({ where: { id: circleId, deletedAt: null } });
    if (!circle) throw new NotFoundException('الحلقة غير موجودة');

    const teacher = await this.prisma.teacherProfile.findFirst({
      where: { id: dto.teacherId, deletedAt: null },
      include: { user: { select: { id: true, fullName: true } } },
    });
    if (!teacher) throw new NotFoundException('المعلم غير موجود');

    await this.prisma.$transaction(async (tx) => {
      // End the current primary assignment (history is kept).
      await tx.circleTeacher.updateMany({
        where: { circleId, role: CircleTeacherRole.PRIMARY, endedAt: null },
        data: { endedAt: new Date(), note: 'تغيير المعلم الأساسي' },
      });
      // If this teacher was already an assistant here, close that link first.
      await tx.circleTeacher.updateMany({
        where: { circleId, teacherId: dto.teacherId, endedAt: null },
        data: { endedAt: new Date(), note: 'ترقية إلى معلم أساسي' },
      });
      await tx.circleTeacher.create({
        data: {
          circleId,
          teacherId: dto.teacherId,
          role: CircleTeacherRole.PRIMARY,
          note: dto.note,
        },
      });
    });

    await this.notifications.notify({
      userId: teacher.user.id,
      type: NotificationType.SYSTEM,
      title: 'تم إسنادك لحلقة جديدة',
      body: `تم تعيينك معلماً أساسياً لحلقة "${circle.name}"`,
      link: `/circles/${circleId}`,
    });

    await this.activity.log({
      userId: actor.id,
      action: 'CIRCLE_SET_PRIMARY_TEACHER',
      summary: `تعيين ${teacher.user.fullName} معلماً أساسياً لحلقة ${circle.name}`,
      entityType: 'Circle',
      entityId: circleId,
    });

    return this.findOne(actor, circleId);
  }

  async addAssistant(actor: AuthUser, circleId: string, dto: AssignTeacherDto) {
    const circle = await this.prisma.circle.findFirst({ where: { id: circleId, deletedAt: null } });
    if (!circle) throw new NotFoundException('الحلقة غير موجودة');
    // A supervisor may only staff the circles they actually supervise.
    await this.acl.assertCircleWriteAccess(actor, circleId);

    const teacher = await this.prisma.teacherProfile.findFirst({
      where: { id: dto.teacherId, deletedAt: null },
      include: { user: { select: { id: true, fullName: true } } },
    });
    if (!teacher) throw new NotFoundException('المعلم غير موجود');

    const existing = await this.prisma.circleTeacher.findFirst({
      where: { circleId, teacherId: dto.teacherId, endedAt: null },
    });
    if (existing) throw new ConflictException('المعلم مسند لهذه الحلقة بالفعل');

    await this.prisma.circleTeacher.create({
      data: {
        circleId,
        teacherId: dto.teacherId,
        role: CircleTeacherRole.ASSISTANT,
        note: dto.note,
      },
    });

    await this.notifications.notify({
      userId: teacher.user.id,
      type: NotificationType.SYSTEM,
      title: 'تم إسنادك كمعلم مساعد',
      body: `تم تعيينك معلماً مساعداً في حلقة "${circle.name}"`,
      link: `/circles/${circleId}`,
    });

    await this.activity.log({
      userId: actor.id,
      action: 'CIRCLE_ADD_ASSISTANT',
      summary: `إضافة ${teacher.user.fullName} معلماً مساعداً في حلقة ${circle.name}`,
      entityType: 'Circle',
      entityId: circleId,
    });

    return this.findOne(actor, circleId);
  }

  async removeTeacher(actor: AuthUser, circleId: string, teacherId: string) {
    await this.acl.assertCircleWriteAccess(actor, circleId);

    const link = await this.prisma.circleTeacher.findFirst({
      where: { circleId, teacherId, endedAt: null },
      include: {
        circle: { select: { name: true } },
        teacher: { include: { user: { select: { id: true, fullName: true } } } },
      },
    });
    if (!link) throw new NotFoundException('المعلم غير مسند لهذه الحلقة');

    await this.prisma.circleTeacher.update({
      where: { id: link.id },
      data: { endedAt: new Date(), note: 'إزالة من الحلقة' },
    });

    await this.notifications.notify({
      userId: link.teacher.user.id,
      type: NotificationType.SYSTEM,
      title: 'تم إنهاء إسنادك للحلقة',
      body: `تم إنهاء إسنادك لحلقة "${link.circle.name}"`,
      link: '/circles',
    });

    await this.activity.log({
      userId: actor.id,
      action: 'CIRCLE_REMOVE_TEACHER',
      summary: `إزالة ${link.teacher.user.fullName} من حلقة ${link.circle.name}`,
      entityType: 'Circle',
      entityId: circleId,
    });

    return this.findOne(actor, circleId);
  }

  /** Full assignment history of a circle (teachers in / out, students in / out). */
  async history(user: AuthUser, circleId: string) {
    await this.acl.assertCircleAccess(user, circleId);

    const [teachers, students] = await Promise.all([
      this.prisma.circleTeacher.findMany({
        where: { circleId },
        select: {
          id: true,
          role: true,
          startedAt: true,
          endedAt: true,
          note: true,
          teacher: { select: { id: true, user: { select: { fullName: true } } } },
        },
        orderBy: { startedAt: 'desc' },
      }),
      this.prisma.circleMembership.findMany({
        where: { circleId },
        select: {
          id: true,
          startedAt: true,
          endedAt: true,
          reason: true,
          student: { select: { id: true, fullName: true, code: true } },
        },
        orderBy: { startedAt: 'desc' },
        take: 100,
      }),
    ]);

    return { teachers, students };
  }

  async remove(actor: AuthUser, id: string) {
    const circle = await this.prisma.circle.findFirst({
      where: { id, deletedAt: null },
      include: { _count: { select: { students: { where: { deletedAt: null } } } } },
    });
    if (!circle) throw new NotFoundException('الحلقة غير موجودة');
    if (circle._count.students > 0) {
      throw new BadRequestException('لا يمكن حذف الحلقة لوجود طلاب مسجلين بها، يرجى نقلهم أولاً');
    }

    const now = new Date();
    await this.prisma.$transaction([
      this.prisma.circleTeacher.updateMany({
        where: { circleId: id, endedAt: null },
        data: { endedAt: now, note: 'حذف الحلقة' },
      }),
      this.prisma.circle.update({ where: { id }, data: { deletedAt: now, isActive: false } }),
    ]);

    await this.activity.log({
      userId: actor.id,
      action: 'CIRCLE_DELETE',
      summary: `حذف الحلقة: ${circle.name}`,
      entityType: 'Circle',
      entityId: id,
    });

    return { message: 'تم حذف الحلقة' };
  }

  // -------------------------------------------------------------------------

  private shape(circle: any) {
    const links = circle.teachers || [];
    const primary = links.find((t: any) => t.role === CircleTeacherRole.PRIMARY) || null;
    const assistants = links.filter((t: any) => t.role === CircleTeacherRole.ASSISTANT);
    return {
      ...circle,
      primaryTeacher: primary
        ? { linkId: primary.id, ...primary.teacher, startedAt: primary.startedAt }
        : null,
      assistantTeachers: assistants.map((a: any) => ({
        linkId: a.id,
        ...a.teacher,
        startedAt: a.startedAt,
      })),
      studentsCount: circle._count?.students ?? circle.students?.length ?? 0,
    };
  }

  private async assertSupervisor(userId: string) {
    const supervisor = await this.prisma.user.findFirst({
      where: { id: userId, deletedAt: null, role: { in: [Role.SUPERVISOR, Role.ADMIN] } },
    });
    if (!supervisor) throw new BadRequestException('المستخدم المحدد ليس مشرفاً');
  }

  /**
   * Resolves the id submitted for "المعلم الأساسي" (primary teacher).
   *
   * It may be:
   *  - an existing teacher-profile id (normal case), or
   *  - the user id of a supervisor (or admin) chosen to also be the primary
   *    teacher of their own circle.
   *
   * In the second case the same account/login is kept — no new user is ever
   * created. If that user already has a teaching profile it is reused as-is;
   * otherwise a teaching profile is created and linked to their *existing*
   * user record, giving them the same student roster, recitation, review,
   * evaluation and attendance tools any teacher has, without touching their
   * SUPERVISOR role or creating a duplicate account.
   */
  private async resolvePrimaryTeacherId(rawId: string): Promise<string> {
    const teacher = await this.prisma.teacherProfile.findFirst({
      where: { id: rawId, deletedAt: null },
    });
    if (teacher) return teacher.id;

    const user = await this.prisma.user.findFirst({
      where: { id: rawId, deletedAt: null, role: { in: [Role.SUPERVISOR, Role.ADMIN] } },
    });
    if (!user) throw new BadRequestException('المعلم أو المشرف المحدد غير موجود');

    const existingProfile = await this.prisma.teacherProfile.findUnique({
      where: { userId: user.id },
    });
    if (existingProfile) {
      if (existingProfile.deletedAt) {
        throw new BadRequestException('ملف التحفيظ الخاص بهذا المستخدم موقوف');
      }
      return existingProfile.id;
    }

    const created = await this.prisma.teacherProfile.create({
      data: { userId: user.id, employmentType: 'VOLUNTEER', isActive: true },
    });
    return created.id;
  }

  private async nextCode() {
    const count = await this.prisma.circle.count();
    let n = count + 1;
    // Guard against gaps created by previously used codes.
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const code = `C-${String(n).padStart(3, '0')}`;
      const exists = await this.prisma.circle.findUnique({ where: { code } });
      if (!exists) return code;
      n += 1;
    }
  }

  private today() {
    const d = new Date();
    return new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  }

  private daysAgo(n: number) {
    const d = new Date();
    d.setDate(d.getDate() - n);
    return new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  }
}
