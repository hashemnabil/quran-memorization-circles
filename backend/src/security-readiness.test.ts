import 'reflect-metadata';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { EventEmitter } from 'node:events';
import { JwtService } from '@nestjs/jwt';
import { Prisma, Role } from '@prisma/client';
import { validNewPassword } from './common/validators/password';
import { AccessControlService } from './common/services/access-control.service';
import { RegistryService } from './registry/registry.service';
import { loginLimiter } from './auth/login-limiter';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { FullSyncService } from './offline-sync/sync-all.service';
import { RealtimeGateway } from './realtime/realtime.gateway';
import { CoursesService } from './courses/courses.service';
import { ActivityService } from './common/services/activity.service';

test('new password policy accepts passphrases and rejects short, common and bcrypt-truncated inputs', () => {
  for (const value of ['', 'ب'.repeat(40)]) assert.equal(validNewPassword(value), false);
  assert.equal(validNewPassword('School River 27'), true); assert.equal(validNewPassword('عبارة مرور آمنة طويلة'), true);
});
test('login limiter counts failures, allows unrelated identities and expires without permanently locking users', () => {
  let now = 0; const middleware = loginLimiter(() => now);
  const request = (username: string, status = 401) => {
    let admitted = false; const response: any = new EventEmitter(); response.statusCode = status;
    response.setHeader = () => undefined; response.status = (code: number) => { response.statusCode = code; return response; }; response.json = () => response;
    middleware({ method: 'POST', path: '/api/auth/login', ip: 'client', body: { username } } as any, response, () => { admitted = true; });
    response.emit('finish'); return admitted;
  };
  for (let i = 0; i < 8; i++) assert(request('target'));
  assert.equal(request('target'), false); assert(request('different'));
  now = 16 * 60 * 1000; assert(request('target', 200));
  for (let i = 0; i < 15; i++) assert(request('successful', 200));
});
test('registry requires an administrator invitation bound to the right record and rejects legacy identity-only sessions', async () => {
  const secret = 'test-only-registry-signing-key-with-no-production-access';
  const jwt = new JwtService({ secret });
  const records = [{ id: 'one', nationalId: '123456789', isActive: true }, { id: 'two', nationalId: '987654321', isActive: true }];
  const service = new RegistryService({ registryUser: { findFirst: async ({ where }: any) => records.find(row => row.id === where.id && (!where.nationalId || row.nationalId === where.nationalId) && row.isActive) } } as any, jwt, { get: () => secret } as any);
  await assert.rejects(service.access('123456789'));
  const { invitation } = await service.invitation('one');
  assert.equal((await service.access('123456789', invitation)).user.id, 'one');
  await assert.rejects(service.access('987654321', invitation));
  await assert.rejects(service.me(await jwt.signAsync({ sub: 'one', kind: 'registry-user' })));
  const expired = await jwt.signAsync({ sub: 'one', kind: 'registry-invite' }, { audience: 'registry-invite', issuer: 'halaqat-registry', expiresIn: -1 });
  await assert.rejects(service.access('123456789', expired));
});
test('committee student scope is limited to exam-related students and read-only roles have no universal scope', async () => {
  const acl = new AccessControlService({} as any);
  const committee = await acl.studentScope({ id: 'committee', role: Role.EXAM_COMMITTEE } as any);
  assert.deepEqual(committee, { OR: [{ examRequests: { some: {} } }, { exams: { some: {} } }] });
  assert.deepEqual(await acl.studentScope({ role: Role.SUPPORT } as any), { id: '__none__' });
});
test('database exceptions expose neither SQL parameters to HTTP nor raw stack values in server logs', async () => {
  const logs: any[] = []; const filter = new AllExceptionsFilter(); (filter as any).logger = { error: (...args: any[]) => logs.push(args) };
  let result: any;
  const response: any = { status: () => response, json: (value: any) => { result = value; } };
  filter.catch(new Prisma.PrismaClientKnownRequestError('sensitive SQL parameter', { code: 'P2021', clientVersion: 'test' }), { switchToHttp: () => ({ getRequest: () => ({ method: 'POST', url: '/api/test' }), getResponse: () => response }) } as any);
  assert.equal(result.statusCode, 500); assert(!JSON.stringify({ result, logs }).includes('sensitive SQL parameter'));
  const audit = new ActivityService({ activityLog: { create: async () => { throw new Error('sensitive SQL parameter'); } } } as any);
  (audit as any).logger = { warn: (...args: any[]) => logs.push(args) };
  await audit.log({ action: 'TEST', summary: 'Private test event' });
  assert(!JSON.stringify(logs).includes('sensitive SQL parameter'));
});
test('unknown sync/database failures are not serialized as successful business rejections', async () => {
  const service = new FullSyncService({ $transaction: async () => { throw new Error('raw database details'); } } as any, { get: () => 'test-only-key' } as any);
  await assert.rejects(service.push({ id: 'actor' } as any, { operations: [{ opId: '00000000-0000-4000-8000-000000000001', entityId: '00000000-0000-4000-8000-000000000002', table: 'students', action: 'create', data: {} }] }));
});

test('already-connected revoked sockets cannot receive persisted notifications or join a conversation', async () => {
  let disconnected = 0; let emitted = 0; let memberships = 0;
  const client: any = { data: { user: { id: 'one', role: Role.STUDENT }, sessionId: 'session', tokenExpiresAt: Date.now() + 60000 }, disconnect: () => { disconnected++; }, emit: () => { emitted++; } };
  const gateway = new RealtimeGateway({} as any, {} as any, { refreshToken: { findFirst: async () => null }, conversationMember: { findFirst: async () => { memberships++; return {}; } } } as any);
  gateway.server = { in: () => ({ fetchSockets: async () => [client] }) } as any;
  await (gateway as any).emitChecked('user:one', 'notification:new', { title: 'Private' });
  assert.deepEqual(await gateway.joinConversation(client, { conversationId: 'chat' }), { ok: false });
  assert.equal(emitted, 0); assert.equal(memberships, 0); assert.equal(disconnected, 2);
});

test('a removed conversation member does not receive room messages even while their session is valid', async () => {
  let emitted = 0; let left = 0;
  const client: any = { data: { user: { id: 'one', role: Role.STUDENT }, sessionId: 'session', tokenExpiresAt: Date.now() + 60000 }, disconnect() {}, emit: () => { emitted++; }, leave: () => { left++; } };
  const gateway = new RealtimeGateway({} as any, {} as any, { refreshToken: { findFirst: async () => ({ id: 'session', user: { role: Role.STUDENT } }) }, conversationMember: { findFirst: async () => null } } as any);
  gateway.server = { in: () => ({ fetchSockets: async () => [client] }) } as any;
  await (gateway as any).emitChecked('conversation:chat', 'message:new', { body: 'Private' }, 'chat');
  assert.equal(emitted, 0); assert.equal(left, 1);
});
test('teachers cannot read or record attendance for a course assigned to someone else', async () => {
  const service = new CoursesService({ course: { findFirst: async () => ({ instructorId: 'other' }) } } as any, {} as any, {} as any);
  const actor: any = { id: 'teacher', role: Role.TEACHER };
  await assert.rejects(service.findOne('course', actor));
  await assert.rejects(service.attendanceSheet('course', { date: '2026-10-16' } as any, actor));
  await assert.rejects(service.attendanceHistory('course', actor));
  await assert.rejects(service.attendanceDetail('course', '2026-10-16', actor));
  await assert.rejects(service.recordAttendance(actor, 'course', { date: '2026-10-16', entries: [] }));
});
