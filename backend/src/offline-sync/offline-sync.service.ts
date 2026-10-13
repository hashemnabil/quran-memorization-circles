import { BadRequestException, Injectable } from '@nestjs/common';
import { Role, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AccessControlService } from '../common/services/access-control.service';
import { AuthUser } from '../common/decorators';

const CIRCLE_ROLES = new Set<Role>([Role.ADMIN, Role.SUPERVISOR, Role.TEACHER]);
const STUDENT_ROLES = new Set<Role>([
  Role.ADMIN, Role.SUPERVISOR, Role.TEACHER, Role.PARENT, Role.STUDENT,
]);

@Injectable()
export class OfflineSyncService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly acl: AccessControlService,
  ) {}

  async bootstrap(user: AuthUser, cursor?: string, requestedLimit = 200) {
    const limit = Math.min(200, Math.max(1, Number.isFinite(requestedLimit) ? Math.floor(requestedLimit) : 200));
    if (cursor !== undefined && !cursor.trim()) {
      throw new BadRequestException('مؤشر الصفحة غير صالح');
    }

    // Never trust a client-supplied role or user ID. Both scopes are derived
    // from the authenticated server-side identity and the existing ACL service.
    const canReadCircles = CIRCLE_ROLES.has(user.role);
    const circles = canReadCircles
      ? await this.readableCircles(user)
      : [];

    const canReadStudents = STUDENT_ROLES.has(user.role);
    const studentScope = canReadStudents
      ? await this.acl.studentScope(user)
      : ({ id: '__offline_sync_no_access__' } satisfies Prisma.StudentWhereInput);
    const allowedCircleIds = canReadCircles
      ? await this.acl.accessibleCircleIds(user)
      : [];

    const studentWhere: Prisma.StudentWhereInput = {
      AND: [
        studentScope,
        { deletedAt: null },
        ...(allowedCircleIds !== null && canReadCircles
          ? [{ OR: [{ circleId: { in: allowedCircleIds } }, ...(user.role === Role.ADMIN ? [{ circleId: null }] : [])] } as Prisma.StudentWhereInput]
          : []),
      ],
    };

    const rows = canReadStudents
      ? await this.prisma.student.findMany({
          where: studentWhere,
          select: {
            id: true,
            circleId: true,
            code: true,
            fullName: true,
            status: true,
            evaluation: true,
            memorizedParts: true,
            currentSurah: true,
            currentPage: true,
            updatedAt: true,
          },
          orderBy: { id: 'asc' },
          ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
          take: limit + 1,
        })
      : [];

    // Validate cursors against the authorized query; an unknown or out-of-scope
    // cursor fails closed rather than silently restarting at a different page.
    if (cursor && canReadStudents && rows.length === 0) {
      const cursorExists = await this.prisma.student.findFirst({
        where: { AND: [{ id: cursor }, studentWhere] },
        select: { id: true },
      });
      if (!cursorExists) throw new BadRequestException('مؤشر الصفحة غير صالح لهذه الحزمة');
    }

    const hasMore = rows.length > limit;
    const students = hasMore ? rows.slice(0, limit) : rows;
    return {
      version: 1,
      accountId: user.id,
      generatedAt: new Date().toISOString(),
      circles,
      students,
      nextCursor: hasMore ? students[students.length - 1]?.id ?? null : null,
      complete: !hasMore,
      pageSize: limit,
    };
  }

  private async readableCircles(user: AuthUser) {
    const allowed = await this.acl.accessibleCircleIds(user);
    return this.prisma.circle.findMany({
      where: {
        deletedAt: null,
        ...(allowed !== null ? { id: { in: allowed } } : {}),
      },
      select: {
        id: true,
        name: true,
        code: true,
        scheduleDays: true,
        startTime: true,
        isActive: true,
      },
      orderBy: { id: 'asc' },
    });
  }
}
