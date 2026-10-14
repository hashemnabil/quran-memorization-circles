import { useEffect } from 'react';
import { queryClient } from '@/lib/queryClient';
import { persistQueryCache } from '@/lib/offline/queryCache';
import { syncOfflineOperations, type ReplayResult } from '@/lib/offline/sync';
import { api } from '@/lib/api';
import type { Role } from '@/types';

const AUTO_SYNC_INTERVAL = 5 * 60 * 1000;
const ATTENDANCE_ROLES = new Set(['ADMIN', 'SUPERVISOR', 'TEACHER']);

async function refreshKnownQueries(): Promise<void> {
  const queries = queryClient.getQueryCache().getAll();
  for (const query of queries) {
    if (!query.options.queryFn || query.state.fetchStatus === 'fetching' || query.state.status === 'pending') continue;
    if (typeof navigator !== 'undefined' && !navigator.onLine) return;
    try {
      await query.fetch();
    } catch {
      // Keep the last successful result for offline use; retry on the next trigger.
    }
  }
}


// These stable, list-level queries are fetched even when their screens have
// never been opened. API authorization remains the source of truth for access.
async function preloadOfflineNavigation(role: Role, accountId: string): Promise<void> {
  const common: Array<{ key: readonly unknown[]; path: string; select?: (data: any) => unknown }> = [
    // The dashboard is the landing screen for most roles; preloading it means
    // an account can reopen the app offline without first visiting the page online.
    { key: ['dashboard', 'overview'], path: '/dashboard/overview' },
    { key: ['settings', 'public'], path: '/settings/public' },
    { key: ['announcements', 'active'], path: '/announcements/active' },
    { key: ['notifications', 'unread'], path: '/notifications/unread-count', select: (data: any) => data.count },
    { key: ['chat', 'unread'], path: '/chat/unread-count', select: (data: any) => data.count },
    // Seed the first notifications page using the exact key/shape consumed by
    // NotificationsPage. The API still scopes results to the authenticated user.
    { key: ['notifications', { tab: 'all', page: 1 }], path: '/notifications?limit=25&page=1' },
    { key: ['notifications', { tab: 'unread', page: 1 }], path: '/notifications?limit=25&page=1&unreadOnly=true' },
  ];
  const staff = ['ADMIN', 'SUPERVISOR', 'TEACHER'].includes(role);
  const management = ['ADMIN', 'SUPERVISOR'].includes(role);
  const admin = role === 'ADMIN';
  const resources: Array<{ key: readonly unknown[]; path: string; select?: (data: any) => unknown }> = [
    ...common,
    ...(staff ? [
      { key: ['circles', 'options'], path: '/circles/options' },
      // Match the default list query keys so the main screens can render their
      // first page immediately after an offline reload, without visiting online.
      { key: ['circles', { page: 1, debouncedSearch: '', isActive: '' }], path: '/circles?page=1&limit=12' },
      { key: ['students', { page: 1, debouncedSearch: '', status: '', evaluation: '', circleId: '', track: '' }], path: '/students?page=1&limit=20' },
      // Match CoursesPage's exact default query key and role-scoped request.
      { key: ['courses', { debounced: '', type: '', page: 1 }], path: role === 'ADMIN' ? '/courses?page=1&limit=12' : `/courses?page=1&limit=12&instructorId=${encodeURIComponent(accountId)}` },
      { key: ['reports', 'circles-options'], path: '/circles/options' },
      { key: ['reports', 'courses-options'], path: '/courses?limit=200' },
      { key: ['recitations', 'surahs'], path: '/recitations/surahs' },
      { key: ['suspensions', 'active'], path: '/suspensions/active' },
    ] : []),
    ...(management ? [
      { key: ['teachers', { limit: 100 }], path: '/teachers?limit=100&isActive=true', select: (data: any) => data.data },
      { key: ['media-activities'], path: '/media-activities' },
    ] : []),
    ...(role === 'STUDENT' ? [
      { key: ['student-files', 'requests'], path: '/certificates/requests/mine' },
      { key: ['student-files', 'certificates'], path: '/certificates/mine' },
    ] : []),
    ...(admin ? [
      { key: ['settings'], path: '/settings' },
      { key: ['users', 'stats'], path: '/users/stats' },
      { key: ['exams', 'stats'], path: '/exams/stats' },
      { key: ['courses', 'stats'], path: '/courses/stats' },
      { key: ['reports', 'students'], path: '/students?limit=100' },
      { key: ['reports', 'teachers'], path: '/teachers?limit=100', select: (data: any) => data.data },
    ] : []),
  ];
  for (const resource of resources) {
    if (!navigator.onLine) return;
    try {
      const response = await api.get(resource.path);
      queryClient.setQueryData(resource.key, resource.select ? resource.select(response.data) : response.data);
    } catch {
      // A missing permission or temporarily unavailable endpoint must not
      // prevent the remaining resources from being cached.
    }
  }
}

const BOOTSTRAP_REFRESH_AGE = 30 * 60 * 1000;

async function refreshOfflineBootstrap(accountId: string): Promise<void> {
  const key = ['offline', 'bootstrap', accountId] as const;
  const cached = queryClient.getQueryData<{ downloadedAt?: string; complete?: boolean }>(key);
  const cachedAt = cached?.downloadedAt ? Date.parse(cached.downloadedAt) : 0;
  if (cached?.complete && Number.isFinite(cachedAt) && Date.now() - cachedAt < BOOTSTRAP_REFRESH_AGE) return;

  const circles = new Map<string, Record<string, unknown> & { id: string }>();
  const students = new Map<string, Record<string, unknown> & { id: string }>();
  const seenCursors = new Set<string>();
  let cursor: string | undefined;
  let complete = false;

  for (let page = 0; page < 1000; page += 1) {
    if (typeof navigator !== 'undefined' && !navigator.onLine) return;
    const response = await api.get('/offline-sync/bootstrap', {
      params: { limit: 200, ...(cursor ? { cursor } : {}) },
    });
    const data = response.data as {
      version: number;
      accountId: string;
      circles?: Array<Record<string, unknown> & { id: string }>;
      students?: Array<Record<string, unknown> & { id: string }>;
      nextCursor: string | null;
      complete: boolean;
    };
    if (data.accountId !== accountId || data.version !== 1) {
      throw new Error('Offline bootstrap account or version mismatch');
    }
    for (const circle of data.circles ?? []) circles.set(circle.id, circle);
    for (const student of data.students ?? []) students.set(student.id, student);
    complete = data.complete === true;
    if (complete) break;
    if (!data.nextCursor || seenCursors.has(data.nextCursor)) {
      throw new Error('Invalid offline bootstrap cursor');
    }
    seenCursors.add(data.nextCursor);
    cursor = data.nextCursor;
  }

  if (!complete) throw new Error('Offline bootstrap pagination limit reached');
  queryClient.setQueryData(key, {
    version: 1,
    accountId,
    downloadedAt: new Date().toISOString(),
    circles: [...circles.values()],
    students: [...students.values()],
    complete: true,
  });
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
 * Automatically refreshes the offline bootstrap and the role-scoped data registered by the signed-in app and
 * the server-authorized attendance roster. It never fetches another account's
 * data and never treats a failed request as a successful write.
 */
export default function AutomaticOfflineSync({ accountId, role }: { accountId: string; role: Role }) {
  useEffect(() => {
    if (!accountId) return;
    let running = false;
    let disposed = false;
    let cacheReady = false;

    const synchronize = async () => {
      if (!cacheReady || running || disposed || (typeof navigator !== 'undefined' && !navigator.onLine)) return;
      running = true;
      try {
        // Replay durable local attendance writes before refreshing server reads.
        await syncOfflineOperations(accountId, async (operation): Promise<ReplayResult> => {
          if (operation.accountId !== accountId ||
              operation.resource !== 'attendance-sheet' ||
              operation.method !== 'POST' ||
              operation.path !== '/attendance') {
            return { kind: 'rejected', reason: 'نوع التعديل لا يطابق سياسة المزامنة الحالية' };
          }
          try {
            await api.post(operation.path, operation.payload);
            return { kind: 'applied' };
          } catch (error) {
            const status = (error as { response?: { status?: number } })?.response?.status;
            if (!status || status === 408 || status === 429 || status >= 500) {
              return { kind: 'retry', reason: 'تعذر الاتصال بالخادم؛ ستتم إعادة المحاولة تلقائياً' };
            }
            if (status === 409) {
              return { kind: 'conflict', reason: 'يوجد تعارض في كشف الحضور؛ يلزم مراجعته قبل المتابعة' };
            }
            return { kind: 'rejected', reason: 'رفض الخادم التعديل؛ راجع الصلاحيات والبيانات' };
          }
        });
        await refreshKnownQueries();
        if (!disposed) await preloadOfflineNavigation(role, accountId);
        if (!disposed) {
          try {
            await refreshOfflineBootstrap(accountId);
          } catch {
            // Keep the previous complete snapshot if the new download is interrupted.
          }
        }
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

    const onCacheRestored = (event: Event) => {
      const detail = (event as CustomEvent<{ accountId?: string }>).detail;
      if (detail?.accountId !== accountId) return;
      cacheReady = true;
      void synchronize();
    };
    const onOnline = () => { void synchronize(); };
    const onFocus = () => { void synchronize(); };
    window.addEventListener('qc:offline-cache-restored', onCacheRestored);
    window.addEventListener('online', onOnline);
    window.addEventListener('focus', onFocus);
    const interval = window.setInterval(() => { void synchronize(); }, AUTO_SYNC_INTERVAL);

    return () => {
      disposed = true;
      window.clearInterval(interval);
      window.removeEventListener('qc:offline-cache-restored', onCacheRestored);
      window.removeEventListener('online', onOnline);
      window.removeEventListener('focus', onFocus);
    };
  }, [accountId, role]);

  return null;
}
