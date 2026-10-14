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
      nextStudentCursor: students.length ? encodeCursor(students[students.length - 1]) : studentCursor ?? null,
      nextCircleCursor: circles.length ? encodeCursor(circles[circles.length - 1]) : circleCursor ?? null,
      hasMoreStudents,
      hasMoreCircles,
      pageSize: limit,
    };
  }


  /** Global sequence feed. Only entities with explicit safe projections are exposed. */
  async syncChanges(user: AuthUser, since: bigint, requestedLimit = 200) {
    const limit = Math.min(200, Math.max(1, Math.floor(requestedLimit)));
    const canReadCircles = CIRCLE_ROLES.has(user.role);
    const circleIds = canReadCircles ? await this.acl.accessibleCircleIds(user) : [];
    const studentScope = STUDENT_ROLES.has(user.role)
      ? await this.acl.studentScope(user)
      : ({ id: '__sync_no_access__' } satisfies Prisma.StudentWhereInput);
    const rows = await this.prisma.$queryRaw<Array<{
      seq: bigint; entity: string; entityId: string; operation: string; payload: unknown; changedAt: Date;
    }>>`SELECT "seq", "entity", "entityId", "operation", "payload", "changedAt"
      FROM "sync_changes" WHERE "seq" > ${since} ORDER BY "seq" ASC LIMIT ${limit + 1}`;
    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;
    const changes: Array<Record<string, unknown>> = [];
    let lastSeq = since;
    for (const row of page) {
      lastSeq = row.seq;
      const payload = row.payload && typeof row.payload === 'object'
        ? row.payload as Record<string, unknown> : null;
      if (row.entity === 'circles') {
        if (!canReadCircles) continue;
        if (circleIds !== null && !circleIds.includes(row.entityId)) continue;
        // Do not return arbitrary JSON from the journal; project approved fields only.
        changes.push({ seq: row.seq.toString(), entity: 'circle', id: row.entityId, operation: row.operation,
          data: row.operation === 'DELETE' || !payload ? null : {
            id: row.entityId, name: payload.name, code: payload.code,
            scheduleDays: payload.scheduleDays, startTime: payload.startTime,
            isActive: payload.isActive, updatedAt: payload.updatedAt,
          } });
      } else if (row.entity === 'students') {
        if (!STUDENT_ROLES.has(user.role)) continue;
        // A journal record is only emitted if its student is in the caller's live ACL scope.
        // Tombstones without a safely scoped historical payload fail closed.
        if (!payload || !row.entityId) continue;
        const visible = await this.prisma.student.findFirst({
          where: { AND: [{ id: row.entityId }, studentScope] },
          select: { id: true },
        });
        if (!visible) continue;
        const circleId = typeof payload.circleId === 'string' ? payload.circleId : null;
        if (circleId && circleIds !== null && !circleIds.includes(circleId)) continue;
        changes.push({ seq: row.seq.toString(), entity: 'student', id: row.entityId, operation: row.operation,
          data: row.operation === 'DELETE' ? null : {
            id: row.entityId, circleId, code: payload.code, fullName: payload.fullName,
            status: payload.status, evaluation: payload.evaluation,
            memorizedParts: payload.memorizedParts, currentSurah: payload.currentSurah,
            currentPage: payload.currentPage, updatedAt: payload.updatedAt,
          } });
      }
    }
    return { version: 1, accountId: user.id, since: since.toString(),
      nextSeq: lastSeq.toString(), hasMore, changes };
  }

  /**
   * General writes stay fail-closed until each entity has a reviewed mutation
   * schema, conflict policy and atomic domain transaction. This prevents a generic
   * sync endpoint from becoming an ACL bypass or arbitrary Prisma write surface.
   */
  async pushOperations(_user: AuthUser, body: unknown) {
    if (!body || typeof body !== 'object' || !Array.isArray((body as { operations?: unknown }).operations)) {
      throw new BadRequestException('صيغة العمليات غير صالحة');
    }
    const operations = (body as { operations: unknown[] }).operations;
    if (operations.length > 100) throw new BadRequestException('الحد الأقصى 100 عملية');
    if (operations.length === 0) throw new BadRequestException('يجب إرسال عملية واحدة على الأقل');
    const seen = new Set<string>();
    for (const operation of operations) {
      if (!operation || typeof operation !== 'object' || Array.isArray(operation)) {
        throw new BadRequestException('صيغة العملية غير صالحة');
      }
      const record = operation as Record<string, unknown>;
      if (typeof record.opId !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(record.opId)) {
        throw new BadRequestException('معرّف العملية غير صالح');
      }
      if (seen.has(record.opId)) {
        throw new BadRequestException('معرّف العملية مكرر داخل الحزمة');
      }
      seen.add(record.opId);
      if (typeof record.entity !== 'string' || !record.entity.trim()) {
        throw new BadRequestException('نوع الكيان غير صالح');
      }
    }
    // Validation is not authorization: never dispatch arbitrary mutations here.
    throw new BadRequestException('عمليات الكتابة العامة غير مفعّلة بعد؛ استخدم المسارات المدعومة ذات سياسات التعارض وidempotency');
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
