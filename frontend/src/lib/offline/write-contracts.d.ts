import type { OutboxOperation } from './outbox';
export function offlineOperationSpec(op: Pick<OutboxOperation, 'resource' | 'method' | 'path' | 'payload' | 'baseUpdatedAt'>): { entity: string; kind: string; data: unknown; baseUpdatedAt?: string };
