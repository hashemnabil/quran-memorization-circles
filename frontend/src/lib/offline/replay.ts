import { api } from '@/lib/api';
import { useAuthStore } from '@/store/auth';
import type { OutboxOperation } from './outbox';
import type { ReplayResult } from './sync';
import { replayAttendanceOperation } from './replay-policy.js';

export function replayOfflineOperation(operation: OutboxOperation): Promise<ReplayResult> {
  return replayAttendanceOperation(operation, useAuthStore.getState().user?.id ?? '', (path, body) => api.post(path, body));
}
