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
   * Circle ids the user may read.
   * `null` means "no restriction" (admin / exam committee / support read-all roles).
   */
  async accessibleCircleIds(user: AuthUser): Promise<string[] | null> {
    switch (user.role) {
      case Role.ADMIN:
      case Role.EXAM_COMMITTEE:
        return null;
      case Role.SUPERVISOR:
        return this.supervisorCircleIds(user);
      case Role.TEACHER:
        return this.teacherCircleIds(user);
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
    if (user.role === Role.TEACHER) {
      const ids = await this.teacherCircleIds(user);
      if (!ids.includes(circleId)) throw new ForbiddenException('لا تملك صلاحية التعديل على هذه الحلقة');
      return;
    }
    if (user.role === Role.SUPERVISOR) {
      const ids = await this.supervisorCircleIds(user);
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
      case Role.EXAM_COMMITTEE:
        return {};
      case Role.SUPERVISOR: {
        const ids = await this.supervisorCircleIds(user);
        return { circleId: { in: ids } };
      }
      case Role.TEACHER: {
        const ids = await this.teacherCircleIds(user);
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
}
