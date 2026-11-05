import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { randomBytes, createCipheriv, createDecipheriv, createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import bcrypt from 'bcryptjs';
import { resolveStudent, studentTransferUsername, transferNotificationId, validateTransferContexts } from './student-transfer-policy.mjs';
import { pathToFileURL } from 'node:url';

// Dry-run by default. Never reuse a parent's identity or password for a child.
export async function transferParentData(db, { apply = false, mapping = {}, backup, backupKey } = {}) {
  return db.$transaction(async tx => {
    await tx.$queryRaw`SELECT 1 FROM (SELECT pg_advisory_xact_lock(hashtext('transfer-parent-data-v1'))) AS locked`;
    if (apply) await tx.$executeRawUnsafe('LOCK TABLE users, students, parent_profiles, notifications, conversation_members, conversations, messages, absence_permission_requests, announcements, refresh_tokens, support_tickets, ticket_messages, activity_logs IN SHARE ROW EXCLUSIVE MODE');
    const parents = await tx.parentProfile.findMany({ where: { user: { role: 'PARENT' } }, include: { user: true, students: true } });
    const legacyUsers = await tx.user.findMany({ where: { role: 'PARENT' } });
    for (const user of legacyUsers) if (!parents.some(p => p.userId === user.id)) parents.push({ userId: user.id, user, students: [] });
    const ids = legacyUsers.map(user => user.id);
    const notifications = await tx.notification.findMany({ where: { userId: { in: ids } } });
    const members = await tx.conversationMember.findMany({ where: { userId: { in: ids } }, include: { conversation: { include: { messages: true, members: true } } } });
    const permissions = await tx.absencePermissionRequest.findMany({ where: { requesterId: { in: ids } } });
    const announcements = await tx.announcement.findMany({ where: { audience: { has: 'PARENT' } } });
    const refreshTokens = await tx.refreshToken.findMany({ where: { userId: { in: ids } } });
    const tickets = await tx.supportTicket.findMany({ where: { createdById: { in: ids } }, include: { messages: true } });
    const transfers = [];
    for (const parent of parents) {
      for (const notice of notifications.filter(n => n.userId === parent.userId)) {
        const student = resolveStudent(notice, parent.students, mapping.notifications?.[notice.id] || mapping.conversations?.[notice.data?.conversationId] || mapping.supportTickets?.[notice.data?.ticketId]);
        transfers.push({ kind: 'notification', source: notice, student });
      }
      for (const member of members.filter(m => m.userId === parent.userId)) {
        const student = resolveStudent({ id: member.conversationId }, parent.students, mapping.conversations?.[member.conversationId]);
        transfers.push({ kind: 'conversation', source: member, student });
      }
      for (const request of permissions.filter(r => r.requesterId === parent.userId)) {
        const student = resolveStudent({ id: request.id, data: { studentId: request.studentId } }, parent.students, mapping.permissions?.[request.id]);
        transfers.push({ kind: 'permission', source: request, student });
      }
      for (const ticket of tickets.filter(t => t.createdById === parent.userId)) {
        if (['PASSWORD_RESET', 'ACCOUNT_DELETION'].includes(ticket.category) && !mapping.supportTickets?.[ticket.id]) throw new Error(`Explicit student mapping required for sensitive ticket: ${ticket.id}`);
        const student = resolveStudent({ id: ticket.id }, parent.students, mapping.supportTickets?.[ticket.id]);
        transfers.push({ kind: 'ticket', source: ticket, student });
      }
    }
    validateTransferContexts(transfers);
    const students = [...new Map(parents.flatMap(parent => parent.students).map(student => [student.id, student])).values()];
    for (const student of students) {
      if (!student.userId) continue;
      const account = await tx.user.findUnique({ where: { id: student.userId } });
      if (!account || account.role !== 'STUDENT' || account.deletedAt) throw new Error(`Invalid student account: ${student.id}`);
    }
    for (const transfer of transfers) {
      transfer.previous = await tx.activityLog.findFirst({ where: { action: 'PARENT_STUDENT_TRANSFER', entityType: transfer.kind, entityId: transfer.source.id } });
      if (transfer.previous && transfer.previous.metadata?.studentId !== transfer.student.id) throw new Error(`Previously transferred to another student: ${transfer.source.id}`);
    }
    const summary = { dryRun: !apply, parents: parents.length, transfers: transfers.length,
      accountsRequired: students.filter(s => !s.userId).length };
    if (!apply) return summary;
    if (!/^[a-f0-9]{64}$/i.test(backupKey || '') || !backup) throw new Error('Apply requires --backup <new file> and STUDENT_TRANSFER_BACKUP_KEY (64 hex characters; store separately)');
    const key = Buffer.from(backupKey, 'hex');
    const snapshot = Buffer.from(JSON.stringify({ version: 1, createdAt: new Date(), parents, notifications, members, permissions, announcements, refreshTokens, tickets }));
    const iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm', key, iv);
    const encrypted = Buffer.concat([cipher.update(snapshot), cipher.final()]);
    const envelope = { version: 1, iv: iv.toString('hex'), tag: cipher.getAuthTag().toString('hex'), ciphertext: encrypted.toString('base64') };
    await writeFile(backup, JSON.stringify(envelope), { flag: 'wx', mode: 0o600 });
    const verify = JSON.parse(await readFile(backup, 'utf8'));
    const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(verify.iv, 'hex'));
    decipher.setAuthTag(Buffer.from(verify.tag, 'hex'));
    if (!Buffer.concat([decipher.update(Buffer.from(verify.ciphertext, 'base64')), decipher.final()]).equals(snapshot)) throw new Error('Backup verification failed');
    await tx.$queryRaw`SELECT 1 FROM (SELECT pg_advisory_xact_lock(hashtext('quran-sync-journal'), 0)) AS locked`;
    const accounts = new Map();
    for (const student of students) {
      const legacy = parents.find(parent => parent.students.some(child => child.id === student.id));
      // Keep family contact information on the student, independent of the archived profile.
      await tx.student.update({ where: { id: student.id }, data: {
        guardianName: student.guardianName ?? legacy?.user.fullName,
        guardianPhone: student.guardianPhone ?? legacy?.phone ?? legacy?.user.phone,
        fatherNationalId: student.fatherNationalId ?? legacy?.nationalId,
      } });
      let userId = student.userId;
      if (!userId) {
        const account = await tx.user.create({ data: { username: studentTransferUsername(student.id), fullName: student.fullName, role: 'STUDENT',
          passwordHash: await bcrypt.hash(randomBytes(32).toString('hex'), 10), mustChangePassword: true, isActive: !student.deletedAt } });
        userId = account.id;
        await tx.student.update({ where: { id: student.id }, data: { userId } });
      } else {
        const account = await tx.user.findUnique({ where: { id: userId } });
        if (!account || account.role !== 'STUDENT') throw new Error(`Invalid student account: ${student.id}`);
      }
      accounts.set(student.id, userId);
    }
    for (const { kind, source, student, previous } of transfers) {
      if (previous) continue;
      const userId = accounts.get(student.id);
      if (kind === 'notification') {
        // Deterministic id and semantic key both prevent duplicate historical alerts.
        const id = transferNotificationId(source.id, student.id);
        const duplicate = await tx.notification.findFirst({ where: { userId, type: source.type, title: source.title, body: source.body,
          ...(source.data?.alertKey ? { data: { path: ['alertKey'], equals: source.data.alertKey } } : { createdAt: source.createdAt }) } });
        if (!duplicate) {
          const row = await tx.notification.upsert({ where: { id }, update: {}, create: { id, userId, type: source.type, title: source.title, body: source.body,
            link: source.type === 'CHAT_MESSAGE' ? '/chat' : '/student', createdAt: source.createdAt, isRead: source.isRead, readAt: source.readAt, pushQueuedAt: new Date(),
            data: { ...source.data, studentId: student.id, legacyNotificationId: source.id } } });
          await tx.syncChange.create({ data: { entity: 'notifications', entityId: row.id, operation: 'UPSERT', payload: { id: row.id, userId } } });
        }
      } else if (kind === 'conversation') {
        // Preserve original authors and timestamps; grant no administrative privileges.
        await tx.conversationMember.upsert({ where: { conversationId_userId: { conversationId: source.conversationId, userId } }, update: {},
          create: { conversationId: source.conversationId, userId, joinedAt: source.joinedAt, leftAt: source.leftAt, lastReadAt: source.lastReadAt, isAdmin: false } });
        // The retired participant must not block future contact checks or receive messages.
        await tx.conversationMember.update({ where: { id: source.id }, data: { leftAt: source.leftAt || new Date() } });
      } else if (kind === 'ticket') {
        await tx.supportTicket.update({ where: { id: source.id }, data: { createdById: userId } });
      } else {
        await tx.absencePermissionRequest.update({ where: { id: source.id }, data: { requesterId: userId, studentId: student.id } });
      }
      await tx.activityLog.create({ data: { action: 'PARENT_STUDENT_TRANSFER', entityType: kind, entityId: source.id,
        summary: 'نقل سجل مؤرشف إلى حساب الطالب', metadata: { studentId: student.id, sourceUserId: source.userId || source.requesterId || source.createdById } } });
    }
    await tx.user.updateMany({ where: { role: 'PARENT' }, data: { isActive: false } });
    await tx.refreshToken.updateMany({ where: { userId: { in: ids }, revokedAt: null }, data: { revokedAt: new Date() } });
    for (const row of announcements) await tx.announcement.update({ where: { id: row.id }, data: {
      audience: [...new Set(row.audience.map(role => role === 'PARENT' ? 'STUDENT' : role))],
      ...(row.link?.startsWith('/parent/') ? { link: '/student' } : {}),
    } });
    for (const { kind, source, student } of transfers) {
      const userId = accounts.get(student.id);
      if (kind === 'notification') {
        const saved = await tx.notification.findFirst({ where: { userId, type: source.type, title: source.title, body: source.body,
          ...(source.data?.alertKey ? { data: { path: ['alertKey'], equals: source.data.alertKey } } : { createdAt: source.createdAt }) } });
        if (!saved) throw new Error(`Notification verification failed: ${source.id}`);
      }
      if (kind === 'conversation') {
        const member = await tx.conversationMember.findUnique({ where: { conversationId_userId: { conversationId: source.conversationId, userId } } });
        if (!member || !source.leftAt && member.leftAt) throw new Error('Conversation verification failed');
      }
      if (kind === 'permission') {
        const saved = await tx.absencePermissionRequest.findUnique({ where: { id: source.id } });
        if (saved?.requesterId !== userId || saved?.studentId !== student.id) throw new Error('Permission verification failed');
      }
      if (kind === 'ticket') {
        const saved = await tx.supportTicket.findUnique({ where: { id: source.id } });
        if (saved?.createdById !== userId) throw new Error('Support ticket verification failed');
      }
    }
    const backupSha256 = createHash('sha256').update(await readFile(backup)).digest('hex');
    await tx.activityLog.create({ data: { action: 'PARENT_RETIREMENT_VERIFIED', summary: 'التحقق من نقل وظائف ولي الأمر إلى الطالب دون حذف الأرشيف',
      metadata: { parents: parents.length, students: students.length, transfers: transfers.length, backupSha256 } } });
    return { ...summary, backupVerified: true, recordsVerified: true, backupSha256 };
  }, { isolationLevel: 'Serializable', timeout: 120000, maxWait: 10000 });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2);
  const option = name => args.includes(name) ? args[args.indexOf(name) + 1] : undefined;
  const db = new PrismaClient();
  try {
    const mapping = option('--mapping') ? JSON.parse(await readFile(option('--mapping'), 'utf8')) : {};
    console.log(JSON.stringify(await transferParentData(db, { apply: args.includes('--apply'), mapping, backup: option('--backup'), backupKey: process.env.STUDENT_TRANSFER_BACKUP_KEY })));
  } finally { await db.$disconnect(); }
}
