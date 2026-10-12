import {
  blockOfflineOperation,
  listOfflineOperations,
  removeOfflineOperation,
  type OutboxOperation,
} from './outbox';

export type ReplayResult =
  | { kind: 'applied' }
  | { kind: 'retry'; reason: string }
  | { kind: 'conflict'; reason: string }
  | { kind: 'rejected'; reason: string };

export type ReplayHandler = (operation: OutboxOperation) => Promise<ReplayResult>;

export type SyncReport = {
  applied: number;
  retried: number;
  blocked: number;
  stopped: boolean;
};

/**
 * Sequential, account-scoped outbox drain.
 *
 * This intentionally does not replay arbitrary HTTP requests. Callers must
 * supply a domain handler that understands idempotency and conflict rules for
 * each operation type. Until a server endpoint has those guarantees, do not
 * enqueue writes for it or register it with this runner.
 */
let activeRun: Promise<SyncReport> | null = null;

export function syncOfflineOperations(
  accountId: string,
  replay: ReplayHandler,
): Promise<SyncReport> {
  if (activeRun) return activeRun;
  activeRun = drain(accountId, replay).finally(() => {
    activeRun = null;
  });
  return activeRun;
}

async function drain(accountId: string, replay: ReplayHandler): Promise<SyncReport> {
  const report: SyncReport = { applied: 0, retried: 0, blocked: 0, stopped: false };
  if (!accountId.trim() || typeof navigator !== 'undefined' && !navigator.onLine) {
    report.stopped = true;
    return report;
  }

  const operations = await listOfflineOperations(accountId);
  for (const operation of operations) {
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      report.stopped = true;
      break;
    }
    if (operation.state === 'blocked') {
      report.blocked += 1;
      continue;
    }

    let result: ReplayResult;
    try {
      result = await replay(operation);
    } catch (error) {
      // A network interruption is retryable; leave the item in the queue.
      report.retried += 1;
      report.stopped = true;
      break;
    }

    if (result.kind === 'applied') {
      await removeOfflineOperation(operation.id, accountId);
      report.applied += 1;
      continue;
    }
    if (result.kind === 'retry') {
      report.retried += 1;
      report.stopped = true;
      break;
    }

    await blockOfflineOperation(operation.id, accountId, result.reason);
    report.blocked += 1;
    // Preserve ordering: later operations may depend on this failed operation.
    report.stopped = true;
    break;
  }
  return report;
}
