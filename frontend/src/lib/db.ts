import Dexie, { type Table } from 'dexie';

export const entityTables = ['students', 'circles', 'teachers', 'attendance', 'recitations', 'exams', 'behaviors', 'notifications', 'courses', 'examRequests'] as const;
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
    // Compound primary keys prevent one account reading another account's data.
    const schema: Record<string, string> = {};
    for (const table of entityTables) schema[table] = '[accountId+id], accountId, circleId, studentId, updatedAt, synced, pendingDelete';
    this.version(1).stores({ ...schema, queue: '++id, accountId, opId, table', meta: 'key', responses: 'key, accountId' });
  }
}
export const db = new HalaqatDatabase();
