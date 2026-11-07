import Dexie, { type Table } from 'dexie';
import { installLocalEncryption, dataKey, encryptedAccount } from './local-encryption';

export const entityTables = ['students', 'circles', 'teachers', 'attendance', 'staffAttendance', 'courseAttendance', 'recitations', 'exams', 'behaviors', 'notifications', 'courses', 'examRequests', 'mediaPlans', 'teacherDuties', 'dutyTeachers', 'users', 'studentAccounts', 'profileReviews', 'transfers', 'suspensions', 'meetings', 'examCommittees', 'absencePermissions', 'guardianSummons', 'preparations', 'surahCompletions', 'announcements', 'mediaActivities', 'certificateRequests', 'certificates', 'certificateTemplates', 'schoolSettings', 'chatMessages', 'communityPosts', 'communityComments', 'accountPreferences', 'supportTickets', 'chatConversations'] as const;
export type EntityTable = typeof entityTables[number];
export type LocalRow = Record<string, any> & { id: string; accountId: string; synced: number; updatedAt: string; pendingDelete?: number };
export type QueuedWrite = { id?: number; accountId: string; opId: string; table: EntityTable; action: string; entityId: string; data: Record<string, any>; createdAt: string; error?: string };
class HalaqatDatabase extends Dexie {
  students!: Table<LocalRow, [string, string]>;
  circles!: Table<LocalRow, [string, string]>;
  teachers!: Table<LocalRow, [string, string]>;
  attendance!: Table<LocalRow, [string, string]>;
  recitations!: Table<LocalRow, [string, string]>;
  exams!: Table<LocalRow, [string, string]>;
  behaviors!: Table<LocalRow, [string, string]>;
  notifications!: Table<LocalRow, [string, string]>;
  courses!: Table<LocalRow, [string, string]>;
  examRequests!: Table<LocalRow, [string, string]>;
  queue!: Table<QueuedWrite, number>;
  meta!: Table<{ key: string; value: any }, string>;
  responses!: Table<{ key: string; accountId: string; data: any }, string>;
  constructor() {
    super('halaqatFull');
    installLocalEncryption(this);
    // Compound primary keys prevent one account reading another account's data.
    const schema: Record<string, string> = {};
    for (const table of entityTables) schema[table] = '[accountId+id], accountId, circleId, studentId, updatedAt, synced, pendingDelete';
    this.version(1).stores({ ...schema, queue: '++id, accountId, opId, table', meta: 'key', responses: 'key, accountId' });
    this.version(2).stores({ mediaPlans: '[accountId+id], accountId, date, synced', teacherDuties: '[accountId+id], accountId, date, synced', dutyTeachers: '[accountId+id], accountId' });
    this.version(3).stores({ users: '[accountId+id], accountId, synced', studentAccounts: '[accountId+id], accountId, synced', credentialKeys: 'accountId' })
      .upgrade(tx => tx.table('meta').filter(row => /:(downloadedAt|deltaCursor)$/.test(row.key)).delete().then(() => undefined));
    this.version(4).stores({ profileReviews: '[accountId+id], accountId, kind, status, requesterId, synced' })
      .upgrade(async tx => {
        for (const row of await tx.table('meta').filter(row => row.key.endsWith(':downloadedAt') && (!encryptedAccount(row.key.split(':')[0]) || !!dataKey(row.key.split(':')[0]))).toArray()) {
          await tx.table('meta').put({ key: row.key.replace(/:downloadedAt$/, ':needsProfileReviewsBootstrap'), value: true });
        }
      });
    this.version(5).stores(Object.fromEntries(['transfers', 'suspensions', 'meetings', 'examCommittees'].map(table => [table, '[accountId+id], accountId, studentId, status, updatedAt, synced'])))
      .upgrade(async tx => {
        for (const row of await tx.table('meta').filter(row => row.key.endsWith(':downloadedAt') && (!encryptedAccount(row.key.split(':')[0]) || !!dataKey(row.key.split(':')[0]))).toArray()) {
          await tx.table('meta').put({ key: row.key.replace(/:downloadedAt$/, ':needsSchoolOperationsBootstrap'), value: true });
        }
      });
    this.version(6).stores({ absencePermissions: '[accountId+id], accountId, studentId, status, date, updatedAt, synced', guardianSummons: '[accountId+id], accountId, studentId, createdAt, updatedAt, synced' })
      .upgrade(async tx => {
        for (const row of await tx.table('meta').filter(row => row.key.endsWith(':downloadedAt') && (!encryptedAccount(row.key.split(':')[0]) || !!dataKey(row.key.split(':')[0]))).toArray()) {
          await tx.table('meta').put({ key: row.key.replace(/:downloadedAt$/, ':needsAbsenceWorkflowBootstrap'), value: true });
        }
      });
    this.version(7).stores({ preparations: '[accountId+id], accountId, studentId, dueDate, completedAt, updatedAt, synced', surahCompletions: '[accountId+id], accountId, studentId, surah, updatedAt, synced' })
      .upgrade(async tx => {
        for (const row of await tx.table('meta').filter(row => row.key.endsWith(':downloadedAt') && (!encryptedAccount(row.key.split(':')[0]) || !!dataKey(row.key.split(':')[0]))).toArray()) {
          await tx.table('meta').put({ key: row.key.replace(/:downloadedAt$/, ':needsLearningWorkflowsBootstrap'), value: true });
        }
      });
    this.version(8).stores({ announcements: '[accountId+id], accountId, isActive, publishedAt, updatedAt, synced', mediaActivities: '[accountId+id], accountId, type, activityDate, updatedAt, synced' })
      .upgrade(async tx => {
        for (const row of await tx.table('meta').filter(row => row.key.endsWith(':downloadedAt') && (!encryptedAccount(row.key.split(':')[0]) || !!dataKey(row.key.split(':')[0]))).toArray()) {
          await tx.table('meta').put({ key: row.key.replace(/:downloadedAt$/, ':needsContentBootstrap'), value: true });
        }
      });
    this.version(9).stores({ certificateRequests: '[accountId+id], accountId, studentId, status, createdAt, synced', certificates: '[accountId+id], accountId, studentId, issuedAt, synced', certificateTemplates: '[accountId+id], accountId, kind, isActive, synced' })
      .upgrade(async tx => {
        for (const row of await tx.table('meta').filter(row => row.key.endsWith(':downloadedAt') && (!encryptedAccount(row.key.split(':')[0]) || !!dataKey(row.key.split(':')[0]))).toArray()) {
          await tx.table('meta').put({ key: row.key.replace(/:downloadedAt$/, ':needsCertificatesBootstrap'), value: true });
        }
      });
    this.version(10).stores({ staffAttendance: '[accountId+id], accountId, userId, date, status, updatedAt, synced', courseAttendance: '[accountId+id], accountId, courseId, studentId, date, status, updatedAt, synced' })
      .upgrade(async tx => {
        for (const row of await tx.table('meta').filter(row => row.key.endsWith(':downloadedAt') && (!encryptedAccount(row.key.split(':')[0]) || !!dataKey(row.key.split(':')[0]))).toArray()) {
          await tx.table('meta').put({ key: row.key.replace(/:downloadedAt$/, ':needsAttendanceBootstrap'), value: true });
        }
      });
    this.version(11).stores({ schoolSettings: '[accountId+id], accountId, updatedAt, synced' });
    this.version(12).stores({ chatMessages: '[accountId+id], accountId, conversationId, createdAt, synced', communityPosts: '[accountId+id], accountId, authorId, createdAt, synced', communityComments: '[accountId+id], accountId, postId, createdAt, synced', accountPreferences: '[accountId+id], accountId, synced' }).upgrade(async tx => {
      for (const row of await tx.table('meta').filter(row => row.key.endsWith(':downloadedAt') && (!encryptedAccount(row.key.split(':')[0]) || !!dataKey(row.key.split(':')[0]))).toArray()) await tx.table('meta').put({ key: row.key.replace(/:downloadedAt$/, ':needsCommunicationBootstrap'), value: true });
    });
    this.version(13).stores({ supportTickets: '[accountId+id], accountId, status, updatedAt, synced' }).upgrade(async tx => {
      for (const row of await tx.table('meta').filter(row => row.key.endsWith(':downloadedAt') && (!encryptedAccount(row.key.split(':')[0]) || !!dataKey(row.key.split(':')[0]))).toArray())
        await tx.table('meta').put({ key: row.key.replace(/:downloadedAt$/, ':needsSupportBootstrap'), value: true });
    });
    this.version(14).stores({ chatConversations: '[accountId+id], accountId, type, updatedAt, synced' });
  }
}
export const db = new HalaqatDatabase();

