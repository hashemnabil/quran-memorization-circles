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


  /**
   * Incremental feed for offline replicas. Each resource has its own opaque
   * (updatedAt,id) cursor so rows sharing the same timestamp cannot be skipped.
   * Deleted students are returned as tombstones; clients must remove them locally.
   */
  async changes(
    user: AuthUser,
    studentCursor?: string,
    circleCursor?: string,
    requestedLimit = 200,
  ) {
    const limit = Math.min(200, Math.max(1, Number.isFinite(requestedLimit) ? Math.floor(requestedLimit) : 200));
    const decodeCursor = (value: string | undefined): { updatedAt: Date; id: string } | undefined => {
      if (value === undefined) return undefined;
      try {
        const parsed = JSON.parse(Buffer.from(value, 'base64url').toString('utf8'));
        const updatedAt = new Date(parsed.updatedAt);
        if (typeof parsed.id !== 'string' || !parsed.id || Number.isNaN(updatedAt.getTime())) {
          throw new Error('invalid cursor');
        }
        return { updatedAt, id: parsed.id };
      } catch {
        throw new BadRequestException('مؤشر المزامنة غير صالح');
      }
    };
    const encodeCursor = (row: { updatedAt: Date; id: string }) =>
      Buffer.from(JSON.stringify({ updatedAt: row.updatedAt.toISOString(), id: row.id })).toString('base64url');

    const studentAfter = decodeCursor(studentCursor);
    const circleAfter = decodeCursor(circleCursor);
    const canReadCircles = CIRCLE_ROLES.has(user.role);
    const allowedCircleIds = canReadCircles ? await this.acl.accessibleCircleIds(user) : [];
    const studentScope = STUDENT_ROLES.has(user.role)
      ? await this.acl.studentScope(user)
      : ({ id: '__offline_sync_no_access__' } satisfies Prisma.StudentWhereInput);
    const studentWhere: Prisma.StudentWhereInput = {
      AND: [
        studentScope,
        ...(allowedCircleIds !== null && canReadCircles
          ? [{ OR: [{ circleId: { in: allowedCircleIds } }, ...(user.role === Role.ADMIN ? [{ circleId: null }] : [])] } as Prisma.StudentWhereInput]
          : []),
        ...(studentAfter ? [{
          OR: [
            { updatedAt: { gt: studentAfter.updatedAt } },
            { updatedAt: studentAfter.updatedAt, id: { gt: studentAfter.id } },
          ],
        } as Prisma.StudentWhereInput] : []),
      ],
    };
    const circleWhere: Prisma.CircleWhereInput = {
      ...(canReadCircles ? {} : { id: '__offline_sync_no_access__' }),
      ...(allowedCircleIds !== null ? { id: { in: allowedCircleIds } } : {}),
      ...(circleAfter ? {
        OR: [
          { updatedAt: { gt: circleAfter.updatedAt } },
          { updatedAt: circleAfter.updatedAt, id: { gt: circleAfter.id } },
        ],
      } : {}),
    };

    const [studentRows, circleRows] = await Promise.all([
      STUDENT_ROLES.has(user.role) ? this.prisma.student.findMany({
        where: studentWhere,
        select: {
          id: true, circleId: true, code: true, fullName: true, status: true,
          evaluation: true, memorizedParts: true, currentSurah: true, currentPage: true,
          updatedAt: true, deletedAt: true,
        },
        orderBy: [{ updatedAt: 'asc' }, { id: 'asc' }],
        take: limit + 1,
      }) : Promise.resolve([]),
      canReadCircles ? this.prisma.circle.findMany({
        where: circleWhere,
        select: {
          id: true, name: true, code: true, scheduleDays: true, startTime: true,
          isActive: true, updatedAt: true, deletedAt: true,
        },
        orderBy: [{ updatedAt: 'asc' }, { id: 'asc' }],
        take: limit + 1,
      }) : Promise.resolve([]),
    ]);

    const hasMoreStudents = studentRows.length > limit;
    const hasMoreCircles = circleRows.length > limit;
    const students = hasMoreStudents ? studentRows.slice(0, limit) : studentRows;
    const circles = hasMoreCircles ? circleRows.slice(0, limit) : circleRows;
    return {
      version: 1,
      accountId: user.id,
      generatedAt: new Date().toISOString(),
      students,
      circles,
      nextStudentCursor: hasMoreStudents && students.length ? encodeCursor(students[students.length - 1]) : null,
      nextCircleCursor: hasMoreCircles && circles.length ? encodeCursor(circles[circles.length - 1]) : null,
      hasMoreStudents,
      hasMoreCircles,
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
