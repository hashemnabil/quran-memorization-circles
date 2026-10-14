import type { OutboxOperation } from './outbox';
import type { ReplayResult } from './sync';
export function replayAttendanceOperation(operation: OutboxOperation, currentAccountId: string, post: (path: string, body: unknown) => Promise<{ data: unknown }>): Promise<ReplayResult>;
export const replayOfflineWrite: typeof replayAttendanceOperation;
