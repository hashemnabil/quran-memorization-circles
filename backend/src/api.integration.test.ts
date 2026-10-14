import 'reflect-metadata';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import * as bcrypt from 'bcryptjs';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { JwtService } from '@nestjs/jwt';
import { Role } from '@prisma/client';
import { AppModule } from './app.module';
import { configureApp } from './configure-app';
import { PrismaService } from './prisma/prisma.service';

// Real HTTP, global auth/role guards, validation and domain/database paths.
test('role workflows and production security regressions over HTTP', { timeout: 120000 }, async (t) => {
  const target = new URL(process.env.DATABASE_URL || 'postgresql://localhost/missing');
  assert.ok(['localhost', '127.0.0.1'].includes(target.hostname) && target.pathname === '/quran_test', 'HTTP integration requires disposable local quran_test');
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bodyParser: false, logger: false });
  configureApp(app);
  await app.listen(0, '127.0.0.1');
  const db = app.get(PrismaService);
  const base = await app.getUrl();
  const suffix = randomUUID().replace(/-/g, '').slice(0, 12);
  const password = 'TestPassword!983';
  const ids: Partial<Record<Role, string>> = {};
  const sessions: Partial<Record<Role, any>> = {};
  let circle: any, hiddenCircle: any, student: any, hiddenStudent: any;
  let course: any, template: any, conversation: any;
  let teacherId: string;
  const request = async (method: string, path: string, role?: Role, body?: unknown, expected?: number) => {
    const response = await fetch(`${base}/api${path}`, {
      method, headers: { 'Content-Type': 'application/json', ...(role && sessions[role] ? { Authorization: `Bearer ${sessions[role].accessToken}` } : {}) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const text = await response.text();
    let data: any; try { data = JSON.parse(text); } catch { data = text; }
    if (expected !== undefined) assert.equal(response.status, expected, `${method} ${path}: ${data?.message || response.status}`);
    else assert.ok(response.ok, `${method} ${path}: ${response.status} ${data?.message || ''}`);
    return data;
  };
  try {
    const passwordHash = await bcrypt.hash(password, 4);
    for (const role of Object.values(Role)) {
      const id = randomUUID(); ids[role] = id;
      await db.user.create({ data: { id, username: `test${role.toLowerCase().replace(/_/g, '')}${suffix}`, fullName: `Test ${role}`, role, passwordHash } });
    }
    teacherId = (await db.teacherProfile.create({ data: { userId: ids.TEACHER! } })).id;
    await t.test('all enabled roles can login and parent portal remains disabled', async () => {
      for (const role of Object.values(Role)) {
        const user = await db.user.findUniqueOrThrow({ where: { id: ids[role]! } });
        if (role === Role.PARENT) { await request('POST', '/auth/login', undefined, { username: user.username, password }, 401); continue; }
        sessions[role] = await request('POST', '/auth/login', undefined, { username: user.username, password }, 200);
        assert.equal((await request('GET', '/auth/me', role)).id, user.id);
      }
      // Legacy access tokens also cannot reopen the disabled parent portal.
      sessions.PARENT = { accessToken: await app.get(JwtService).signAsync({ sub: ids.PARENT, role: Role.PARENT }) };
      await request('GET', '/auth/me', Role.PARENT, undefined, 401);
      await request('GET', '/users', undefined, undefined, 401);
      assert.equal((await request('GET', '/health')).status, 'ok');
    });
    await t.test('admin creates circles/students; teacher and supervisor see only their scope', async () => {
      circle = await request('POST', '/circles', Role.ADMIN, { name: `Allowed ${suffix}`, code: `A${suffix}`, primaryTeacherId: teacherId, supervisorId: ids.SUPERVISOR });
      hiddenCircle = await request('POST', '/circles', Role.ADMIN, { name: `Hidden ${suffix}`, code: `H${suffix}` });
      student = await request('POST', '/students', Role.ADMIN, { fullName: `Allowed student ${suffix}`, circleId: circle.id });
      hiddenStudent = await request('POST', '/students', Role.ADMIN, { fullName: `Hidden student ${suffix}`, circleId: hiddenCircle.id });
      await db.student.update({ where: { id: student.id }, data: { userId: ids.STUDENT } });
      const listing = await request('GET', '/students', Role.TEACHER);
      assert.equal(listing.data.some((item: any) => item.id === student.id), true);
      assert.equal(listing.data.some((item: any) => item.id === hiddenStudent.id), false);
      await request('GET', `/students/${hiddenStudent.id}`, Role.TEACHER, undefined, 403);
      await request('GET', `/students/${student.id}`, Role.SUPERVISOR);
      await request('GET', '/users', Role.TEACHER, undefined, 403);
      assert.equal((await request('GET', '/students/me', Role.STUDENT)).id, student.id);
    });
    await t.test('attendance and recitation write through to storage and authorized reports', async () => {
      await request('POST', '/attendance', Role.TEACHER, { circleId: circle.id, date: '2026-01-01', entries: [{ studentId: student.id, status: 'PRESENT' }] });
      assert.equal(await db.attendance.count({ where: { studentId: student.id } }), 1);
      await request('POST', '/recitations', Role.TEACHER, { studentId: student.id, date: '2026-01-01', fromSurah: 'الفاتحة', fromAyah: 1, toSurah: 'الفاتحة', toAyah: 7, evaluation: 'EXCELLENT', mistakes: 1, warnings: 0 });
      assert.equal((await db.recitation.findFirstOrThrow({ where: { studentId: student.id } })).points, 6);
      assert.equal((await db.student.findUniqueOrThrow({ where: { id: student.id } })).totalPoints, 6);
      const report = await request('GET', '/reports?type=students&track=CIRCLE', Role.TEACHER);
      assert.equal(report.rows.some((row: any) => row['الطالب'] === hiddenStudent.fullName), false);
      assert.equal(report.rows.some((row: any) => row['الطالب'] === student.fullName), true);
      await request('GET', '/recitations', Role.EXAM_COMMITTEE, undefined, 403);
      await request('GET', '/attendance', Role.SUPPORT, undefined, 403);
      await request('POST', '/attendance', Role.STUDENT, {}, 403);
      await request('GET', `/recitations/history/2026-01-01/${hiddenCircle.id}`, Role.STUDENT, undefined, 403);
      await request('GET', `/exams/milestones/${student.id}`, Role.ADMIN);
      await request('GET', `/exams/eligibility/${student.id}`, Role.STUDENT);
      await request('GET', '/exams/requests', Role.EXAM_COMMITTEE);
    });
    await t.test('courses, support, notifications and chat execute actual database workflows', async () => {
      course = await request('POST', '/courses', Role.ADMIN, { name: `Course ${suffix}`, code: `C${suffix}`, type: 'TAJWEED', instructorId: ids.TEACHER });
      await request('POST', `/courses/${course.id}/students`, Role.ADMIN, { studentIds: [student.id] });
      await request('POST', `/courses/${course.id}/attendance`, Role.TEACHER, { date: '2026-01-01', entries: [{ studentId: student.id, status: 'PRESENT' }] });
      assert.equal(await db.courseAttendance.count({ where: { courseId: course.id } }), 1);
      const ticket = await request('POST', '/support', Role.STUDENT, { subject: `Test ${suffix}`, description: 'Test support request' });
      await request('POST', `/support/${ticket.id}/reply`, Role.SUPPORT, { body: 'Test support response' });
      await request('GET', '/notifications', Role.STUDENT);
      conversation = await request('POST', '/chat/conversations/direct', Role.TEACHER, { userId: ids.SUPERVISOR });
      await request('POST', `/chat/conversations/${conversation.id}/messages`, Role.TEACHER, { body: 'Test message' });
      assert.equal(await db.message.count({ where: { conversationId: conversation.id } }), 1);
      await request('GET', `/chat/conversations/${conversation.id}`, Role.EXAM_COMMITTEE, undefined, 403);
    });
    await t.test('certificates, requests, settings and invalid file links are checked', async () => {
      template = await request('POST', '/certificates/templates', Role.ADMIN, { name: `Template ${suffix}`, kind: 'COURSE_COMPLETION', sourceType: 'BUILDER' });
      const fileUrl = `data:application/pdf;base64,${Buffer.from('%PDF-1.4\n%%EOF').toString('base64')}`;
      await request('POST', '/certificates/issue', Role.ADMIN, { studentId: student.id, templateId: template.id, kind: 'COURSE_COMPLETION', title: 'Test certificate', fileUrl });
      assert.equal((await request('GET', '/certificates/mine', Role.STUDENT)).length, 1);
      await request('POST', '/certificates/requests', Role.STUDENT, { kind: 'CERTIFICATE', certificateKind: 'COURSE_COMPLETION' });
      assert.equal(await db.studentFileRequest.count({ where: { studentId: student.id } }), 1);
      await request('POST', '/certificates/issue', Role.ADMIN, { studentId: student.id, kind: 'COURSE_COMPLETION', title: 'Unsafe', fileUrl: 'javascript:alert(1)' }, 400);
      await Promise.all([request('GET', '/settings/public'), request('GET', '/settings/public')]);
      await request('PATCH', '/settings', Role.TEACHER, { name: 'Unauthorized' }, 403);
    });
    await t.test('uploaded images are owned and deletion is not authorized by URL alone', async () => {
      const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aS0UAAAAASUVORK5CYII=', 'base64');
      const form = new FormData(); form.append('file', new Blob([png], { type: 'image/png' }), 'test.png');
      const response = await fetch(`${base}/api/uploads/avatar`, { method: 'POST', headers: { Authorization: `Bearer ${sessions.TEACHER.accessToken}` }, body: form });
      assert.equal(response.status, 201);
      const uploaded = await response.json();
      await request('DELETE', '/uploads', Role.STUDENT, { url: uploaded.url }, 403);
      assert.equal((await request('DELETE', '/uploads', Role.TEACHER, { url: uploaded.url })).deleted, true);
    });
    await t.test('concurrent refresh rotates once and password change invalidates access and refresh tokens', async () => {
      const refreshToken = sessions.ADMIN.refreshToken;
      const responses = await Promise.all([0, 1].map(() => fetch(`${base}/api/auth/refresh`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ refreshToken }) })));
      assert.deepEqual(responses.map((response) => response.status).sort(), [200, 401]);
      const winning = await responses.find((response) => response.ok)!.json();
      sessions.ADMIN = winning;
      await request('PATCH', '/auth/change-password', Role.ADMIN, { currentPassword: password, newPassword: 'UpdatedPassword!983' });
      await request('GET', '/auth/me', Role.ADMIN, undefined, 401);
      await request('POST', '/auth/refresh', undefined, { refreshToken: winning.refreshToken }, 401);
    });
    await t.test('inactive teacher profiles and deactivated users lose API access immediately', async () => {
      await db.teacherProfile.update({ where: { id: teacherId }, data: { isActive: false } });
      await request('GET', '/auth/me', Role.TEACHER, undefined, 401);
      await db.user.update({ where: { id: ids.SUPPORT }, data: { isActive: false } });
      await request('GET', '/auth/me', Role.SUPPORT, undefined, 401);
    });
  } finally {
    // All records belong to synthetic identities in the disposable database.
    if (conversation?.id) await db.conversation.deleteMany({ where: { id: conversation.id } });
    if (course?.id) await db.course.deleteMany({ where: { id: course.id } });
    if (template?.id) await db.certificateTemplate.deleteMany({ where: { id: template.id } });
    if (circle?.id || hiddenCircle?.id) await db.circle.deleteMany({ where: { id: { in: [circle?.id, hiddenCircle?.id].filter(Boolean) } } });
    if (student?.id || hiddenStudent?.id) await db.student.deleteMany({ where: { id: { in: [student?.id, hiddenStudent?.id].filter(Boolean) } } });
    await db.user.deleteMany({ where: { id: { in: Object.values(ids) } } });
    await app.close();
  }
});
