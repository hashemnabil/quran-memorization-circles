import assert from 'node:assert/strict';
import { PrismaClient } from '@prisma/client';
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { transferParentData } from './transfer-parent-data.mjs';
import { verifyStudentTransferBackup } from './verify-student-transfer-backup.mjs';

const target = new URL(process.env.DATABASE_URL || 'postgresql://localhost/missing');
assert.ok(['localhost', '127.0.0.1'].includes(target.hostname) && target.pathname === '/quran_test', 'Migration integration requires disposable local quran_test');
const db = new PrismaClient();
const ids = Object.fromEntries(['parent', 'studentUser', 'teacher', 'one', 'two', 'conversation', 'message', 'noticeOne', 'noticeTwo', 'permission', 'ticket', 'announcement'].map(key => [key, randomUUID()]));
const key = randomBytes(32).toString('hex');
const directory = await mkdtemp(join(tmpdir(), 'qc-student-transfer-'));
const digests = [];
const copiedNotificationIds = [];
let secondAccount;
try {
  // The migration deliberately scans all retired accounts; never touch pre-existing fixtures.
  assert.equal(await db.user.count({where: {role: 'PARENT'}}), 0, 'Use a fresh test database before running migration fixtures');
  await db.user.createMany({data: [
    {id: ids.parent, username: `legacy-${ids.parent}`, fullName: 'Synthetic legacy parent', role: 'PARENT', passwordHash: 'test-only'},
    {id: ids.studentUser, username: `student-${ids.studentUser}`, fullName: 'Synthetic first student', role: 'STUDENT', passwordHash: 'test-only'},
    {id: ids.teacher, username: `teacher-${ids.teacher}`, fullName: 'Synthetic teacher', role: 'TEACHER', passwordHash: 'test-only'},
  ]});
  const parent = await db.parentProfile.create({data: {userId: ids.parent}});
  await db.student.createMany({data: [
    {id: ids.one, code: `first-${ids.one}`, fullName: 'First child', parentId: parent.id, userId: ids.studentUser},
    {id: ids.two, code: `second-${ids.two}`, fullName: 'Second child', parentId: parent.id},
  ]});
  const createdAt = new Date('2026-01-01T10:00:00.000Z');
  const readAt = new Date('2026-01-02T10:00:00.000Z');
  await db.conversation.create({data: {id: ids.conversation, type: 'DIRECT', createdById: ids.parent,
    members: {create: [{userId: ids.parent, isAdmin: true, joinedAt: createdAt}, {userId: ids.teacher}]},
    messages: {create: {id: ids.message, senderId: ids.parent, body: `About /parent/children/${ids.one}`, createdAt}},
  }});
  await db.notification.createMany({data: [
    {id: ids.noticeOne, userId: ids.parent, type: 'CHAT_MESSAGE', title: 'First child message', data: {studentId: ids.one, conversationId: ids.conversation}, createdAt, isRead: true, readAt},
    {id: ids.noticeTwo, userId: ids.parent, type: 'ATTENDANCE', title: 'Second child attendance', data: {studentId: ids.two}, createdAt},
  ]});
  await db.absencePermissionRequest.create({data: {id: ids.permission, studentId: ids.one, requesterId: ids.parent, date: new Date('2026-01-03'), reason: 'Synthetic absence'}});
  await db.supportTicket.create({data: {id: ids.ticket, createdById: ids.parent, subject: 'Student follow-up', category: 'GENERAL', description: 'Synthetic request', messages: {create: {senderId: ids.parent, body: 'Historical author'}}}});
  await db.announcement.create({data: {id: ids.announcement, title: 'Legacy audience', body: 'Synthetic announcement', audience: ['PARENT'], publishedAt: createdAt}});
  const mapping = {conversations: {[ids.conversation]: ids.one}, supportTickets: {[ids.ticket]: ids.one}};
  await assert.rejects(transferParentData(db), /mapping required/);
  assert.equal(await db.notification.count({where: {userId: ids.studentUser}}), 0);
  const plan = await transferParentData(db, {mapping});
  assert.equal(plan.dryRun, true);
  assert.equal(plan.accountsRequired, 1);
  const result = await transferParentData(db, {apply: true, mapping, backup: join(directory, 'student-transfer.enc'), backupKey: key});
  digests.push(result.backupSha256);
  assert.equal(result.recordsVerified, true);
  assert.equal((await verifyStudentTransferBackup(join(directory, 'student-transfer.enc'), key)).verified, true);
  assert.equal((await db.user.findUniqueOrThrow({where: {id: ids.parent}})).isActive, false);
  secondAccount = (await db.student.findUniqueOrThrow({where: {id: ids.two}})).userId;
  const account = await db.user.findUniqueOrThrow({where: {id: secondAccount}});
  assert.equal(account.role, 'STUDENT');
  assert.ok(account.username.length <= 32);
  assert.equal(account.mustChangePassword, true);
  const copied = await db.notification.findMany({where: {userId: {in: [ids.studentUser, secondAccount]}}});
  copiedNotificationIds.push(...copied.map(row => row.id));
  assert.equal(copied.length, 2);
  for (const notice of copied) assert.equal(notice.data.studentId, notice.userId === ids.studentUser ? ids.one : ids.two);
  const first = copied.find(row => row.userId === ids.studentUser);
  assert.equal(+first.createdAt, +createdAt);
  assert.equal(+first.readAt, +readAt);
  assert.equal(first.isRead, true);
  assert.ok(first.pushQueuedAt);
  assert.equal(await db.notification.count({where: {userId: ids.parent}}), 2, 'Original notices remain archived');
  const member = await db.conversationMember.findUniqueOrThrow({where: {conversationId_userId: {conversationId: ids.conversation, userId: ids.studentUser}}});
  assert.equal(member.isAdmin, false);
  assert.equal(await db.conversationMember.count({where: {conversationId: ids.conversation, userId: secondAccount}}), 0, 'A sibling cannot gain access to the first child’s conversation');
  assert.equal((await db.message.findUniqueOrThrow({where: {id: ids.message}})).senderId, ids.parent);
  assert.equal((await db.absencePermissionRequest.findUniqueOrThrow({where: {id: ids.permission}})).requesterId, ids.studentUser);
  assert.equal((await db.supportTicket.findUniqueOrThrow({where: {id: ids.ticket}})).createdById, ids.studentUser);
  assert.deepEqual((await db.announcement.findUniqueOrThrow({where: {id: ids.announcement}})).audience, ['STUDENT']);
  const replay = await transferParentData(db, {apply: true, mapping, backup: join(directory, 'student-transfer-replay.enc'), backupKey: key});
  digests.push(replay.backupSha256);
  assert.equal(await db.notification.count({where: {userId: {in: [ids.studentUser, secondAccount]}}}), 2);
  assert.equal(await db.conversationMember.count({where: {conversationId: ids.conversation}}), 3);
  console.log('Verified encrypted backup, sibling isolation, independent accounts, archived sources, unchanged authors and idempotent transfer on disposable PostgreSQL.');
} finally {
  await db.activityLog.deleteMany({where: {OR: [
    {action: 'PARENT_STUDENT_TRANSFER', entityId: {in: [ids.noticeOne, ids.noticeTwo, ids.permission, ids.ticket]}},
    ...digests.map(digest => ({action: 'PARENT_RETIREMENT_VERIFIED', metadata: {path: ['backupSha256'], equals: digest}})),
  ]}});
  const legacyMemberIds = await db.conversationMember.findMany({where: {conversationId: ids.conversation}, select: {id: true}});
  await db.activityLog.deleteMany({where: {action: 'PARENT_STUDENT_TRANSFER', entityId: {in: legacyMemberIds.map(row=>row.id)}}});
  await db.conversation.deleteMany({where: {id: ids.conversation}});
  await db.supportTicket.deleteMany({where: {id: ids.ticket}});
  await db.announcement.deleteMany({where: {id: ids.announcement}});
  secondAccount ||= (await db.student.findUnique({where: {id: ids.two}, select: {userId: true}}))?.userId;
  await db.student.deleteMany({where: {id: {in: [ids.one, ids.two]}}});
  await db.user.deleteMany({where: {id: {in: [ids.parent, ids.studentUser, ids.teacher, secondAccount].filter(Boolean)}}});
  await db.syncChange.deleteMany({where: {entityId: {in: copiedNotificationIds}}});
  await db.$disconnect();
  // Only the verified unique directory created by this test may be removed.
  assert.ok(resolve(directory).startsWith(resolve(tmpdir()) + '\\') || resolve(directory).startsWith(resolve(tmpdir()) + '/'));
  await rm(directory, {recursive: true, force: true});
}
