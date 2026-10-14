import { api } from '@/lib/api';
import { useAuthStore } from '@/store/auth';
import type { OutboxOperation } from './outbox';
import type { ReplayResult } from './sync';
import { replayOfflineWrite } from './replay-policy.js';

export function replayOfflineOperation(operation: OutboxOperation): Promise<ReplayResult> {
  return replayOfflineWrite(operation, useAuthStore.getState().user?.id ?? '', (path, body) => api.post(path, body));
}
