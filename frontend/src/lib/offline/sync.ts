import {
  blockOfflineOperation,
  listOfflineOperations,
  removeOfflineOperation,
  recordOfflineRetry,
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
const activeRuns = new Map<string, Promise<SyncReport>>();

export function syncOfflineOperations(
  accountId: string,
  replay: ReplayHandler,
): Promise<SyncReport> {
  const existing = activeRuns.get(accountId);
  if (existing) return existing;
  const run = drain(accountId, replay).finally(() => {
    activeRuns.delete(accountId);
  });
  activeRuns.set(accountId, run);
  return run;
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
      // Do not apply later operations that may depend on this blocked change.
      report.stopped = true;
      break;
    }

    let result: ReplayResult;
    try {
      result = await replay(operation);
    } catch {
      // A network interruption is retryable; leave the item in the queue.
      await recordOfflineRetry(operation.id, accountId, 'تعذر الاتصال أثناء المزامنة');
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
      await recordOfflineRetry(operation.id, accountId, result.reason);
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
