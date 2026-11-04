import 'reflect-metadata';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Role } from '@prisma/client';
import { validate } from 'class-validator';
import { AccessControlService } from '../common/services/access-control.service';
import { StudentsService } from './students.service';
import { NotificationsService } from '../notifications/notifications.service';
import { AttendanceService } from '../attendance/attendance.service';
import { CreateUserDto } from '../users/dto/user.dto';
import { CreateAnnouncementDto } from '../announcements/dto/announcement.dto';

const actor: any = { id: 'account-one', role: Role.STUDENT };
test('student scope is bound to the authenticated account and retired parents have no scope', async () => {
  const prisma: any = { student: { findFirst: async ({ where }: any) => {
    if (where.userId) { assert.equal(where.userId, actor.id); assert.equal(where.deletedAt, null); return { id: 'one' }; }
    if (where.AND) return where.AND[0].id === where.AND[1].id ? { id: 'one' } : null;
    return { id: where.id };
  } } };
  const acl = new AccessControlService(prisma);
  assert.deepEqual(await acl.studentScope(actor), { id: 'one' });
  await acl.assertStudentAccess(actor, 'one');
  await assert.rejects(acl.assertStudentAccess(actor, 'two'), /صلاحية/);
  assert.deepEqual(await acl.studentScope({ ...actor, role: Role.PARENT, parentId: 'legacy' }), { id: '__none__' });
  assert.equal(await acl.contactableUserFilter({ ...actor, role: Role.PARENT }), null);
});

test('student notes exclude staff-private entries', async () => {
  const prisma: any = { studentNote: { findMany: async ({ where }: any) => {
    assert.equal(where.studentId, 'one'); assert.equal(where.isPrivate, false); return [{ body: 'Public note' }];
  } } };
  const service = new StudentsService(prisma, { assertStudentAccess: async () => ({ id: 'one' }) } as any, {} as any, {} as any);
  assert.equal((await service.listNotes(actor, 'one')).length, 1);
});

test('student profile exposes evaluations and summons without exposing legacy account data', async () => {
  const prisma: any = { student: { findFirst: async ({ where }: any) => { assert.equal(where.userId, actor.id); return { id: 'one' }; } },
    studentEvaluation: { findMany: async ({ where }: any) => { assert.equal(where.studentId, 'one'); return [{ id: 'evaluation' }]; } },
    guardianSummons: { findMany: async ({ where }: any) => { assert.equal(where.studentId, 'one'); return [{ id: 'summons' }]; } } };
  const service = new StudentsService(prisma, { assertStudentAccess: async () => ({ id: 'one' }) } as any, {} as any, {} as any);
  service.findOne = async () => ({ id: 'one', parentProfile: { username: 'secret' }, parentId: 'legacy', parentName: 'Legacy', parentPhone: 'private' }) as any;
  const result = await service.getMyProfile(actor);
  assert.equal(result.parentProfile, undefined); assert.equal(result.parentId, undefined);
  assert.equal(result.summons[0].id, 'summons'); assert.equal(result.evaluations[0].id, 'evaluation');
  await assert.rejects(service.getMyProfile({ ...actor, role: Role.PARENT }));
});

test('notifications and summons work without any parent profile and never query it', async () => {
  const sent: any[] = [];
  const prisma: any = { student: { findUnique: async ({ select }: any) => { assert.equal(select.parentProfile, undefined); return { id: 'one', fullName: 'Student', userId: actor.id }; } },
    guardianSummons: { create: async ({ data }: any) => ({ id: 'summons', ...data }) } };
  const notices = new NotificationsService(prisma, {} as any);
  notices.notify = async input => { sent.push(input); return input as any; };
  const attendance = new AttendanceService(prisma, {} as any, { log: async () => undefined } as any, notices);
  await attendance.createSummons({ id: 'admin', role: Role.ADMIN } as any, { studentId: 'one', title: 'Review', body: 'Attend' });
  assert.equal(sent.length, 1); assert.equal(sent[0].userId, actor.id); assert.equal(sent[0].link, '/student');
  assert.equal(sent[0].data.studentId, 'one');
});

test('retired parent role is rejected in account and announcement validation', async () => {
  const account = Object.assign(new CreateUserDto(), { role: Role.PARENT });
  assert.ok((await validate(account)).find(error => error.property === 'role' && error.constraints?.isNotIn));
  const announcement = Object.assign(new CreateAnnouncementDto(), { title: 'Notice', audience: [Role.PARENT] });
  assert.ok((await validate(announcement)).find(error => error.property === 'audience' && error.constraints?.isNotIn));
});
