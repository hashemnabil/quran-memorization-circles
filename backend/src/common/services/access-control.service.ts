import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, Role } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthUser } from '../decorators';

/**
 * Central place for resource-level authorization.
 *
 * Role guards answer "can this role reach this endpoint"; this service answers
 * "may this specific user touch this specific circle / student". Every module
 * that exposes circle- or student-scoped data must go through it.
 */
@Injectable()
export class AccessControlService {
  constructor(private readonly prisma: PrismaService) {}

  isAdmin(user: AuthUser) {
    return user.role === Role.ADMIN;
  }

  /** Circles a teacher currently teaches (primary or assistant). */
  async teacherCircleIds(user: AuthUser): Promise<string[]> {
    if (!user.teacherId) return [];
    const links = await this.prisma.circleTeacher.findMany({
      where: { teacherId: user.teacherId, endedAt: null, circle: { deletedAt: null } },
      select: { circleId: true },
    });
    return [...new Set(links.map((l) => l.circleId))];
  }

  /** Circles a supervisor is responsible for. */
  async supervisorCircleIds(user: AuthUser): Promise<string[]> {
    const circles = await this.prisma.circle.findMany({
      where: { supervisorId: user.id, deletedAt: null },
      select: { id: true },
    });
    return circles.map((c) => c.id);
  }

  /**
   * Every circle the user is attached to, in either capacity.
   *
   * A supervisor commonly runs a circle of their own *and* oversees others, so
   * the two sets are unioned rather than chosen between — asking "are you a
   * teacher or a supervisor here?" has no single right answer for them.
   */
  async ownCircleIds(user: AuthUser): Promise<string[]> {
    const [taught, supervised] = await Promise.all([
      this.teacherCircleIds(user),
      user.role === Role.SUPERVISOR ? this.supervisorCircleIds(user) : Promise.resolve([]),
    ]);
    return [...new Set([...taught, ...supervised])];
  }

  /**
   * Circle ids the user may read. `null` means "no restriction".
   *
   * The exam committee is *not* unrestricted any more: it works from the exam
   * queue alone and has no business browsing circles.
   */
  async accessibleCircleIds(user: AuthUser): Promise<string[] | null> {
    switch (user.role) {
      case Role.ADMIN:
        return null;
      case Role.SUPERVISOR:
      case Role.TEACHER:
        return this.ownCircleIds(user);
      default:
        return [];
    }
  }

  /** Throws unless the user may read the circle. */
  async assertCircleAccess(user: AuthUser, circleId: string): Promise<void> {
    const circle = await this.prisma.circle.findFirst({
      where: { id: circleId, deletedAt: null },
      select: { id: true },
    });
    if (!circle) throw new NotFoundException('الحلقة غير موجودة');

    const allowed = await this.accessibleCircleIds(user);
    if (allowed === null) return;
    if (!allowed.includes(circleId)) {
      throw new ForbiddenException('لا تملك صلاحية الوصول إلى هذه الحلقة');
    }
  }

  /** Throws unless the user may *modify* circle data (teachers of the circle, its supervisor, admin). */
  async assertCircleWriteAccess(user: AuthUser, circleId: string): Promise<void> {
    if (user.role === Role.ADMIN) return;
    if (user.role === Role.TEACHER || user.role === Role.SUPERVISOR) {
      const ids = await this.ownCircleIds(user);
      if (!ids.includes(circleId)) throw new ForbiddenException('لا تملك صلاحية التعديل على هذه الحلقة');
      return;
    }
    throw new ForbiddenException('لا تملك صلاحية التعديل على هذه الحلقة');
  }

  /**
   * A Prisma `where` fragment restricting a Student query to what the user may see.
   * Returns `{}` for unrestricted roles and an impossible filter for roles with no access.
   */
  async studentScope(user: AuthUser): Promise<Prisma.StudentWhereInput> {
    switch (user.role) {
      case Role.ADMIN:
        return {};
      // The exam committee never browses students, but it does read the ones
      // attached to the exams it grades, so the scope stays open while the
      // student *pages* are closed to it at the route level.
      case Role.EXAM_COMMITTEE:
        return {};
      case Role.SUPERVISOR:
      case Role.TEACHER: {
        const ids = await this.ownCircleIds(user);
        return { circleId: { in: ids } };
      }
      case Role.PARENT:
        return user.parentId ? { parentId: user.parentId } : { id: '__none__' };
      default:
        return { id: '__none__' };
    }
  }

  /** Loads a student after verifying the user may see it. */
  async assertStudentAccess(user: AuthUser, studentId: string) {
    const scope = await this.studentScope(user);
    const student = await this.prisma.student.findFirst({
      where: { AND: [{ id: studentId, deletedAt: null }, scope] },
      select: { id: true, circleId: true, fullName: true, status: true, parentId: true },
    });
    if (!student) {
      // Distinguish "missing" from "forbidden" without leaking existence to unrelated users.
      const exists = await this.prisma.student.findFirst({
        where: { id: studentId, deletedAt: null },
        select: { id: true },
      });
      if (exists) throw new ForbiddenException('لا تملك صلاحية الوصول إلى بيانات هذا الطالب');
      throw new NotFoundException('الطالب غير موجود');
    }
    return student;
  }

  /** Write access to a student: admin, the student's teachers, or the circle supervisor. */
  async assertStudentWriteAccess(user: AuthUser, studentId: string) {
    const student = await this.prisma.student.findFirst({
      where: { id: studentId, deletedAt: null },
      select: { id: true, circleId: true, fullName: true, status: true },
    });
    if (!student) throw new NotFoundException('الطالب غير موجود');
    if (user.role === Role.ADMIN) return student;
    if (user.role === Role.PARENT || user.role === Role.SUPPORT) {
      throw new ForbiddenException('لا تملك صلاحية تعديل بيانات الطالب');
    }
    if (!student.circleId) throw new ForbiddenException('الطالب غير مسجل في حلقة');
    await this.assertCircleWriteAccess(user, student.circleId);
    return student;
  }

  /** Users the current user is allowed to start a chat with / search in directories. */
  async assertUserVisible(user: AuthUser, targetUserId: string) {
    const target = await this.prisma.user.findFirst({
      where: { id: targetUserId, deletedAt: null, isActive: true },
      select: { id: true, fullName: true, role: true },
    });
    if (!target) throw new NotFoundException('المستخدم غير موجود');
    return target;
  }

  // -------------------------------------------------------------------------
  // Who may talk to whom
  // -------------------------------------------------------------------------

  /** Staff roles — these may always talk to one another. */
  private static readonly STAFF: Role[] = [
    Role.ADMIN,
    Role.SUPERVISOR,
    Role.TEACHER,
    Role.EXAM_COMMITTEE,
    Role.SUPPORT,
  ];

  /** User ids of every teacher currently assigned to any of `circleIds`. */
  private async teacherUserIdsOfCircles(circleIds: string[]): Promise<string[]> {
    if (!circleIds.length) return [];
    const links = await this.prisma.circleTeacher.findMany({
      where: { circleId: { in: circleIds }, endedAt: null },
      select: { teacher: { select: { userId: true } } },
    });
    return links.map((l) => l.teacher.userId);
  }

  /** User ids of the supervisors of `circleIds`. */
  private async supervisorUserIdsOfCircles(circleIds: string[]): Promise<string[]> {
    if (!circleIds.length) return [];
    const circles = await this.prisma.circle.findMany({
      where: { id: { in: circleIds }, supervisorId: { not: null } },
      select: { supervisorId: true },
    });
    return circles.map((c) => c.supervisorId!).filter(Boolean);
  }

  /**
   * A Prisma `where` fragment listing everyone this user may open a conversation
   * with. `null` means "nobody".
   *
   * The rule throughout is that a conversation needs an existing relationship
   * inside the school: staff are colleagues, and a parent is connected only to
   * the people actually responsible for their own children. In particular no
   * role can reach *every* parent, and parents cannot reach each other at all.
   */
  async contactableUserFilter(user: AuthUser): Promise<Prisma.UserWhereInput | null> {
    switch (user.role) {
      // The administration and technical support answer to everyone.
      case Role.ADMIN:
      case Role.SUPPORT:
        return {};

      // Colleagues, plus the guardians of the children they are responsible for.
      case Role.TEACHER:
      case Role.SUPERVISOR: {
        const circleIds = await this.ownCircleIds(user);
        const parentIds = circleIds.length
          ? (
              await this.prisma.student.findMany({
                where: { circleId: { in: circleIds }, deletedAt: null, parentId: { not: null } },
                select: { parentId: true },
                distinct: ['parentId'],
              })
            ).map((s) => s.parentId!)
          : [];
        return {
          OR: [
            { role: { in: AccessControlService.STAFF } },
            ...(parentIds.length ? [{ parent: { id: { in: parentIds } } }] : []),
          ],
        };
      }

      // Grades exams; talks to colleagues, never to families directly.
      case Role.EXAM_COMMITTEE:
        return { role: { in: AccessControlService.STAFF } };

      // The administration, and the staff responsible for their own children.
      case Role.PARENT: {
        if (!user.parentId) return { role: { in: [Role.ADMIN, Role.SUPPORT] } };
        const children = await this.prisma.student.findMany({
          where: { parentId: user.parentId, deletedAt: null, circleId: { not: null } },
          select: { circleId: true },
        });
        const circleIds = [...new Set(children.map((c) => c.circleId!))];
        const [teacherIds, supervisorIds] = await Promise.all([
          this.teacherUserIdsOfCircles(circleIds),
          this.supervisorUserIdsOfCircles(circleIds),
        ]);
        const related = [...new Set([...teacherIds, ...supervisorIds])];
        return {
          OR: [
            { role: { in: [Role.ADMIN, Role.SUPPORT] } },
            ...(related.length ? [{ id: { in: related } }] : []),
          ],
        };
      }

      default:
        return null;
    }
  }

  /** Throws unless `user` is allowed to start / join a conversation with `targetId`. */
  async assertCanContact(user: AuthUser, targetId: string) {
    if (targetId === user.id) {
      throw new ForbiddenException('لا يمكنك بدء محادثة مع نفسك');
    }
    const filter = await this.contactableUserFilter(user);
    if (filter === null) throw new ForbiddenException('لا تملك صلاحية بدء المحادثات');

    const target = await this.prisma.user.findFirst({
      where: { AND: [{ id: targetId, deletedAt: null, isActive: true }, filter] },
      select: { id: true, fullName: true, role: true },
    });
    if (!target) {
      const exists = await this.prisma.user.findFirst({
        where: { id: targetId, deletedAt: null },
        select: { id: true },
      });
      if (exists) throw new ForbiddenException('لا تملك صلاحية مراسلة هذا المستخدم');
      throw new NotFoundException('المستخدم غير موجود');
    }
    return target;
  }
}
