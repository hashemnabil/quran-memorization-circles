import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createDecipheriv } from 'node:crypto';
import { resolveStudent, studentTransferUsername, transferNotificationId, validateTransferContexts } from './student-transfer-policy.mjs';
import { transferParentData } from './transfer-parent-data.mjs';
import { verifyStudentTransferBackup } from './verify-student-transfer-backup.mjs';

test('references must agree and belong to the source parent; siblings require explicit mapping', () => {
  const children = [{ id: 'one' }, { id: 'two' }];
  assert.equal(resolveStudent({ id: 'n', data: { studentId: 'one' } }, children).id, 'one');
  assert.equal(resolveStudent({ id: 'n', link: '/parent/children/two' }, children).id, 'two');
  assert.equal(resolveStudent({ id: 'n' }, children, 'one').id, 'one');
  assert.throws(() => resolveStudent({ id: 'n' }, children), /mapping required/);
  assert.throws(() => resolveStudent({ id: 'n', data: { studentId: 'other' } }, children), /not linked/);
  assert.throws(() => resolveStudent({ id: 'n', data: { studentId: 'one' }, link: '/parent/children/two' }, children), /Conflicting/);
  assert.throws(() => resolveStudent({ id: 'orphan' }, []), /mapping required/);
});

function fixture({ siblings = false, missingAccount = false, failWrite = false, failVerification = false, ticketCategory } = {}) {
  let state = {
    users: [{ id: 'parent', role: 'PARENT', isActive: true }, { id: 'student-user', role: 'STUDENT', isActive: true }, ...(siblings ? [{ id: 'second-user', role: 'STUDENT', isActive: true }] : [])],
    students: [{ id: 'one', fullName: 'Student', userId: missingAccount ? null : 'student-user', deletedAt: null }, ...(siblings ? [{ id: 'two', userId: 'second-user' }] : [])],
    notifications: [{ id: 'old', userId: 'parent', type: 'ATTENDANCE', title: 'Absent', body: 'Recorded', data: { studentId: 'one' }, createdAt: new Date('2026-01-01'), isRead: true, readAt: new Date('2026-01-02') }],
    members: [{ id: 'old-member', userId: 'parent', conversationId: 'chat', joinedAt: new Date('2026-01-01'), leftAt: null, lastReadAt: null, isAdmin: true }],
    permissions: [{ id: 'permission', requesterId: 'parent', studentId: 'one' }],
    announcements: [{ id: 'a', audience: ['PARENT', 'STUDENT'], link: '/parent/children/one' }],
    tokens: [{ id: 't', userId: 'parent', revokedAt: null }], journal: [], ledger: [],
    tickets: ticketCategory ? [{ id: 'ticket', createdById: 'parent', category: ticketCategory, messages: [{ senderId: 'parent', body: 'Reply' }] }] : [],
  };
  let mutations = 0;
  const db = { $transaction: async (run, options) => {
    assert.equal(options.isolationLevel, 'Serializable');
    const working = structuredClone(state);
    const write = fn => { mutations++; if (failWrite) throw new Error('simulated DB failure'); return fn(); };
    const tx = {
      $queryRaw: async () => [], $executeRawUnsafe: async () => 0,
      parentProfile: { findMany: async () => [{ id: 'profile', userId: 'parent', user: working.users[0], students: working.students }] },
      user: {
        findMany: async () => working.users.filter(u => u.role === 'PARENT'),
        findUnique: async ({ where }) => working.users.find(u => u.id === where.id),
        create: async ({ data }) => write(() => { const u = { id: 'created-user', ...data }; working.users.push(u); return u; }),
        updateMany: async () => write(() => { working.users[0].isActive = false; }),
      },
      student: { update: async ({ where, data }) => write(() => Object.assign(working.students.find(s => s.id === where.id), data)) },
      notification: {
        findMany: async () => working.notifications.filter(n => n.userId === 'parent'),
        findFirst: async ({ where }) => failVerification ? undefined : working.notifications.find(n => n.userId === where.userId && n.type === where.type && n.title === where.title && n.body === where.body && +n.createdAt === +where.createdAt),
        upsert: async ({ where, create }) => write(() => { const old = working.notifications.find(n => n.id === where.id); if(old) return old; working.notifications.push(create); return create; }),
      },
      conversationMember: {
        findMany: async () => working.members.filter(m => m.userId === 'parent').map(m => ({ ...m, conversation: { messages: [{ id: 'message', senderId: 'parent', body: 'History' }] } })),
        findUnique: async ({ where }) => working.members.find(m => m.userId === where.conversationId_userId.userId && m.conversationId === where.conversationId_userId.conversationId),
        upsert: async ({ where, create }) => write(() => { if(!working.members.some(m => m.userId === where.conversationId_userId.userId)) working.members.push({ id: 'new-member', ...create }); }),
        update: async ({ where, data }) => write(() => Object.assign(working.members.find(m => m.id === where.id), data)),
      },
      absencePermissionRequest: {
        findMany: async () => working.permissions.filter(r => r.requesterId === 'parent'),
        findUnique: async ({ where }) => working.permissions.find(r => r.id === where.id),
        update: async ({ where, data }) => write(() => Object.assign(working.permissions.find(r => r.id === where.id), data)),
      },
      announcement: { findMany: async () => working.announcements.filter(a => a.audience.includes('PARENT')), update: async ({ where, data }) => write(() => Object.assign(working.announcements.find(a => a.id === where.id), data)) },
      refreshToken: { findMany: async () => working.tokens, updateMany: async () => write(() => { working.tokens[0].revokedAt = new Date(); }) },
      supportTicket: {
        findMany: async () => working.tickets.filter(t => t.createdById === 'parent'),
        findUnique: async ({ where }) => working.tickets.find(t => t.id === where.id),
        update: async ({ where, data }) => write(() => Object.assign(working.tickets.find(t => t.id === where.id), data)),
      },
      syncChange: { create: async ({ data }) => write(() => working.journal.push(data)) },
      activityLog: { findFirst: async ({ where }) => working.ledger.find(row => row.entityType === where.entityType && row.entityId === where.entityId), create: async ({ data }) => write(() => working.ledger.push(data)) },
    };
    const result = await run(tx); state = working; return result;
  } };
  return { db, state: () => state, mutations: () => mutations };
}

test('dry-run does not mutate the database', async () => {
  const f = fixture();
  assert.deepEqual(await transferParentData(f.db), { dryRun: true, parents: 1, transfers: 3, accountsRequired: 0 });
  assert.equal(f.mutations(), 0);
});

test('missing student accounts are created independently and sensitive support tickets require explicit review', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'student-transfer-account-'));
  try {
    const f = fixture({ missingAccount: true, ticketCategory: 'GENERAL' });
    await transferParentData(f.db, { apply: true, backup: join(directory, 'account.enc'), backupKey: 'ab'.repeat(32) });
    const account = f.state().users.find(user => user.id === 'created-user');
    assert.equal(account.role, 'STUDENT'); assert.equal(account.mustChangePassword, true);
    assert.equal(f.state().students[0].userId, account.id);
    assert.equal(f.state().tickets[0].createdById, account.id);
    assert.equal(f.state().tickets[0].messages[0].senderId, 'parent');
    const sensitive = fixture({ ticketCategory: 'ACCOUNT_DELETION' });
    await assert.rejects(transferParentData(sensitive.db), /sensitive ticket/);
    assert.equal(sensitive.mutations(), 0);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('ambiguous siblings and missing backup inputs abort without writes', async () => {
  const f = fixture({ siblings: true });
  await assert.rejects(transferParentData(f.db, { apply: true }), /mapping required/);
  assert.equal(f.mutations(), 0);
  const one = fixture();
  await assert.rejects(transferParentData(one.db, { apply: true }), /backup/);
  assert.equal(one.mutations(), 0);
});

test('encrypted backup can be restored; transfer preserves sources, timestamps and read state; replay is idempotent', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'student-transfer-test-'));
  const key = 'ab'.repeat(32);
  try {
    const f = fixture();
    const backup = join(directory, 'backup.enc');
    const applied = await transferParentData(f.db, { apply: true, backup, backupKey: key });
    assert.equal(applied.backupVerified, true);
    assert.equal(applied.recordsVerified, true);
    assert.match(applied.backupSha256, /^[a-f0-9]{64}$/);
    assert.equal(f.state().ledger.find(row => row.action === 'PARENT_RETIREMENT_VERIFIED').metadata.backupSha256, applied.backupSha256);
    const check = await verifyStudentTransferBackup(backup, key);
    assert.equal(check.verified, true); assert.equal(check.counts.notifications, 1);
    await assert.rejects(verifyStudentTransferBackup(backup, 'cd'.repeat(32)));
    const envelope = JSON.parse(await readFile(backup, 'utf8'));
    const decipher = createDecipheriv('aes-256-gcm', Buffer.from(key, 'hex'), Buffer.from(envelope.iv, 'hex'));
    decipher.setAuthTag(Buffer.from(envelope.tag, 'hex'));
    const restored = JSON.parse(Buffer.concat([decipher.update(Buffer.from(envelope.ciphertext, 'base64')), decipher.final()]).toString());
    assert.equal(restored.notifications[0].id, 'old');
    assert.equal(restored.members[0].conversation.messages[0].body, 'History');
    assert.equal(restored.refreshTokens[0].revokedAt, null);
    assert.equal(f.state().users[0].isActive, false);
    const notice = f.state().notifications.find(n => n.userId === 'student-user');
    assert.equal(notice.isRead, true); assert.equal(+notice.createdAt, +new Date('2026-01-01'));
    assert.equal(notice.link, '/student'); assert.ok(notice.pushQueuedAt);
    assert.match(notice.id, /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/);
    assert.equal(f.state().members[1].isAdmin, false); assert.ok(f.state().members[0].leftAt);
    assert.equal(f.state().permissions[0].requesterId, 'student-user');
    assert.deepEqual(f.state().announcements[0].audience, ['STUDENT']);
    await transferParentData(f.db, { apply: true, backup: join(directory, 'retry.enc'), backupKey: key });
    assert.equal(f.state().notifications.length, 2); assert.equal(f.state().members.length, 2);
    assert.equal(f.state().notifications[0].userId, 'parent');
    f.state().students.push({ id: 'two', userId: 'second-user' });
    f.state().users.push({ id: 'second-user', role: 'STUDENT' });
    const beforeRemap = f.mutations();
    await assert.rejects(transferParentData(f.db, { mapping: { conversations: { chat: 'two' } } }), /Previously transferred/);
    assert.equal(f.mutations(), beforeRemap);
    envelope.ciphertext = Buffer.from('corrupted').toString('base64');
    const corrupted = join(directory, 'corrupted.enc'); await writeFile(corrupted, JSON.stringify(envelope));
    await assert.rejects(verifyStudentTransferBackup(corrupted, key));
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('generated account names satisfy login limits and notification ids work with the outbox', () => {
  const student = '12345678-1234-4234-8234-123456789abc';
  const username = studentTransferUsername(student);
  assert.equal(username.length, 32);
  assert.match(username, /^[a-z0-9]+(?:[._-][a-z0-9]+)*$/);
  assert.equal(username, studentTransferUsername(student));
  assert.notEqual(username, studentTransferUsername('another-student'));
  const id = transferNotificationId('notice', student);
  assert.match(id, /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/);
  assert.equal(id, transferNotificationId('notice', student));
  assert.notEqual(id, transferNotificationId('notice', 'another-student'));
});

test('cross-linked conversation and ticket notifications cannot expose a sibling’s records', () => {
  const notice = {kind: 'notification', source: {id: 'notice', userId: 'parent', data: {conversationId: 'chat'}}, student: {id: 'one'}};
  const conversation = {kind: 'conversation', source: {id: 'member', userId: 'parent', conversationId: 'chat'}, student: {id: 'two'}};
  assert.throws(() => validateTransferContexts([notice, conversation]), /different students/);
  assert.throws(() => validateTransferContexts([
    {...notice, source: {...notice.source, data: {ticketId: 'ticket'}}},
    {kind: 'ticket', source: {id: 'ticket', createdById: 'parent'}, student: {id: 'two'}},
  ]), /different students/);
  assert.throws(() => validateTransferContexts([{...conversation, source: {...conversation.source, conversation: {messages: [{body: '/parent/children/one'}]}}}]), /another student's reference/);
});

test('dry-run rejects an invalid linked student account before backups or writes', async () => {
  const f = fixture();
  f.state().users[1].role = 'ADMIN';
  await assert.rejects(transferParentData(f.db), /Invalid student account/);
  assert.equal(f.mutations(), 0);
});

test('existing backup is never overwritten and a database failure rolls back all writes', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'student-transfer-fail-'));
  try {
    const backup = join(directory, 'exists.enc'); await writeFile(backup, 'keep');
    const f = fixture();
    await assert.rejects(transferParentData(f.db, { apply: true, backup, backupKey: 'ab'.repeat(32) }), /EEXIST/);
    assert.equal(f.mutations(), 0); assert.equal(await readFile(backup, 'utf8'), 'keep');
    const failure = fixture({ failWrite: true });
    await assert.rejects(transferParentData(failure.db, { apply: true, backup: join(directory, 'failure.enc'), backupKey: 'ab'.repeat(32) }), /simulated DB failure/);
    assert.equal(failure.state().notifications.length, 1); assert.equal(failure.state().users[0].isActive, true);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('failed post-transfer verification rolls back account and history changes', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'student-transfer-verification-'));
  try {
    const f = fixture({failVerification: true});
    await assert.rejects(transferParentData(f.db, {apply: true, backup: join(directory, 'student-transfer.enc'), backupKey: 'ab'.repeat(32)}), /Notification verification failed/);
    assert.equal(f.state().users[0].isActive, true);
    assert.equal(f.state().notifications.length, 1);
    assert.equal(f.state().permissions[0].requesterId, 'parent');
    assert.equal((await verifyStudentTransferBackup(join(directory, 'student-transfer.enc'), 'ab'.repeat(32))).verified, true);
  } finally { await rm(directory, {recursive: true, force: true}); }
});
