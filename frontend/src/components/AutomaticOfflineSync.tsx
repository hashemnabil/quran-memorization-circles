import { useEffect } from 'react';
import { api } from '@/lib/api';
import { queryClient } from '@/lib/queryClient';
import { persistQueryCache } from '@/lib/offline/queryCache';
import type { Role } from '@/types';

const AUTO_SYNC_INTERVAL = 5 * 60 * 1000;
const ATTENDANCE_ROLES = new Set(['ADMIN', 'SUPERVISOR', 'TEACHER']);

async function refreshKnownQueries(): Promise<void> {
  const queries = queryClient.getQueryCache().getAll();
  for (const query of queries) {
    if (!query.options.queryFn || query.options.enabled === false || query.state.fetchStatus === 'fetching') continue;
    if (typeof navigator !== 'undefined' && !navigator.onLine) return;
    try {
      await query.fetch();
    } catch {
      // Keep the last successful result for offline use; retry on the next trigger.
    }
  }
}

async function refreshAttendanceBundle(accountId: string): Promise<void> {
  const circles = new Map<string, Record<string, unknown>>();
  const students = new Map<string, Record<string, unknown>>();
  const seenCursors = new Set<string>();
  let cursor: string | undefined;
  let complete = false;

  for (let page = 0; page < 1000; page += 1) {
    if (typeof navigator !== 'undefined' && !navigator.onLine) return;
    const response = await api.get('/attendance/offline-bundle', {
      params: { limit: 500, ...(cursor ? { cursor } : {}) },
    });
    const data = response.data as {
      accountId: string;
      circles?: Array<Record<string, unknown> & { id: string }>;
      students?: Array<Record<string, unknown> & { id: string }>;
      nextCursor: string | null;
      complete: boolean;
    };
    if (data.accountId !== accountId) throw new Error('Offline bundle account mismatch');
    for (const circle of data.circles ?? []) circles.set(circle.id, circle);
    for (const student of data.students ?? []) students.set(student.id, student);
    complete = data.complete === true;
    if (complete) break;
    if (!data.nextCursor || seenCursors.has(data.nextCursor)) throw new Error('Invalid offline bundle cursor');
    seenCursors.add(data.nextCursor);
    cursor = data.nextCursor;
  }

  if (!complete) throw new Error('Offline bundle pagination limit reached');
  queryClient.setQueryData(['offline', 'attendance-bundle', accountId], {
    version: 1,
    accountId,
    downloadedAt: new Date().toISOString(),
    circles: [...circles.values()],
    students: [...students.values()],
    complete: true,
  });
}

/**
 * Automatically refreshes data already registered by the signed-in app and
 * the server-authorized attendance roster. It never fetches another account's
 * data and never treats a failed request as a successful write.
 */
export default function AutomaticOfflineSync({ accountId, role }: { accountId: string; role: Role }) {
  useEffect(() => {
    if (!accountId) return;
    let running = false;
    let disposed = false;

    const synchronize = async () => {
      if (running || disposed || (typeof navigator !== 'undefined' && !navigator.onLine)) return;
      running = true;
      try {
        await refreshKnownQueries();
        if (!disposed && ATTENDANCE_ROLES.has(role)) {
          try {
            await refreshAttendanceBundle(accountId);
          } catch {
            // A transient error or a role without access must not break the app.
          }
        }
        if (!disposed) await persistQueryCache(accountId).catch(() => undefined);
      } finally {
        running = false;
      }
    };

    const onOnline = () => { void synchronize(); };
    const onFocus = () => { void synchronize(); };
    window.addEventListener('online', onOnline);
    window.addEventListener('focus', onFocus);
    void synchronize();
    const interval = window.setInterval(() => { void synchronize(); }, AUTO_SYNC_INTERVAL);

    return () => {
      disposed = true;
      window.clearInterval(interval);
      window.removeEventListener('online', onOnline);
      window.removeEventListener('focus', onFocus);
    };
  }, [accountId, role]);

  return null;
}
