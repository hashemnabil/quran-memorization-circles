import axios, { AxiosError, AxiosRequestConfig } from 'axios';
import { schoolName } from '../config/branding';
import { Capacitor } from '@capacitor/core';
import { shouldRetryReadRequest, readRetryDelayMs } from './offline/retry-policy.js';
import { configureOffline, accountId, settleLocalWrite, reconcileAfterNetworkWrite } from './offline-engine';
import { db } from './db';
import { localRead, localWrite, rememberRead, responseKey } from './local-api';
import { prefetchSections, readPrefetched } from './offline-prefetch';
import { credentialStorage } from './credential-storage';
import { createSessionStore } from './session-store';
import { assertNoPendingWrites } from './account-cleanup';
import { readActiveIdentity } from './active-identity';
import { syncPendingAvatar } from './pending-avatar';
import { createReadRefresh } from './read-refresh';
import { syncStudentPhotos } from './pending-student-photos';
import { localConversation } from './local-conversations';

const IS_NATIVE = Capacitor.isNativePlatform();
const CONFIGURED_API_URL = import.meta.env?.VITE_API_URL?.trim();
// Android APKs must never send relative /api requests to the WebView's local
// origin. Keep the deployed API as the native default while allowing builds to
// override it explicitly. Browser development continues to use Vite's proxy.
const NATIVE_API_URL = 'https://quran-memorization-circles.onrender.com/api';
const BASE_URL = CONFIGURED_API_URL || (IS_NATIVE ? NATIVE_API_URL : '/api');

export const ACCESS_TOKEN_KEY = 'qc.accessToken';
export const REFRESH_TOKEN_KEY = 'qc.refreshToken';

export const tokenStore = createSessionStore(credentialStorage, localStorage);

export const api = axios.create({
  baseURL: BASE_URL,
  headers: { 'Content-Type': 'application/json' },
  timeout: 45000,
});

const networkAdapter = axios.getAdapter(api.defaults.adapter!);
const refreshRead = createReadRefresh();
export async function syncQueuedStudentPhotos() {
  const account = accountId();
  if (!navigator.onLine || tokenStore.isLocal()) return;
  await syncStudentPhotos(account, {
    currentAccount: () => readActiveIdentity()?.id || '',
    upload: async blob => {
      const body = new FormData(); body.append('file', blob, 'student.' + ({ 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif' }[blob.type] || 'jpg'));
      return (await api.post('/uploads/avatar', body, { headers: { 'Content-Type': 'multipart/form-data' }, _expectedAccount: account } as any)).data.url;
    },
    // Bypass optimistic adapters: deletion of a file draft requires server acknowledgement.
    update: async (student, photoUrl) => { await api.patch(`/students/${student}/photo`, { photoUrl }, { adapter: networkAdapter, _expectedAccount: account } as any); },
  });
}
export async function syncQueuedAvatar() {
  const account = accountId();
  if (!navigator.onLine || tokenStore.isLocal()) return;
  await syncPendingAvatar(account, {
    currentAccount: () => readActiveIdentity()?.id || '',
    upload: async blob => {
      const body = new FormData();
      body.append('file', blob, 'avatar.' + (blob.type === 'image/png' ? 'png' : blob.type === 'image/webp' ? 'webp' : 'jpg'));
      const { data } = await api.post('/uploads/avatar', body, { headers: { 'Content-Type': 'multipart/form-data' }, _expectedAccount: account } as any);
      return data.url;
    },
    update: async avatarUrl => { await api.patch('/auth/profile', { avatarUrl }, { _expectedAccount: account } as any); },
  });
}
configureOffline(async (method, path, data) => {
  if (tokenStore.isLocal()) throw new Error('افتح الجلسة على الخادم قبل المزامنة؛ تعديلاتك محفوظة محليًا');
  const response = await api.request({ method, url: path, data, adapter: networkAdapter });
  return response.data;
}, () => {
  try { return readActiveIdentity()?.id || ''; } catch { return ''; }
}, async (account, changedEntities) => {
  const user = readActiveIdentity();
  await prefetchSections(async (method, path, headers) => (await api.request({ method, url: path, headers, adapter: networkAdapter })).data,
    account, () => { try { return readActiveIdentity()?.id || ''; } catch { return ''; } }, user?.role || '', changedEntities);
});
api.defaults.adapter = async (config) => {
  const path = config.url || ''; const method = (config.method || 'get').toLowerCase();
  if (path === '/settings/public' && method === 'get') {
    // This endpoint is intentionally public: its cache contains school details,
    // never an account snapshot or locally unapproved settings edits.
    const key = `public:school-settings:${BASE_URL}`;
    const cached = await db.meta.get(key).catch(() => undefined);
    const fetchPublic = async () => {
      const result = await networkAdapter(config);
      let data = result.data;
      if (typeof data === 'string') { try { data = JSON.parse(data); } catch { return result; } }
      if (data && typeof data === 'object' && !Array.isArray(data)) {
        data.name = schoolName(data.name);
        result.data = data;
        await db.meta.put({ key, value: data }).catch(() => undefined);
        if (cached && JSON.stringify(data) !== JSON.stringify(cached.value)) window.dispatchEvent(new Event('halaqat:changed'));
      }
      return result;
    };
    if (cached) {
      if (navigator.onLine) refreshRead(key, async () => { await fetchPublic(); });
      return { data: { ...cached.value, name: schoolName(cached.value?.name) }, status: 200, statusText: 'Local', headers: {}, config };
    }
    if (!navigator.onLine) throw new Error('لا توجد بيانات مدرسة محفوظة بعد؛ يلزم الاتصال لتنزيلها أول مرة');
    return fetchPublic();
  }
  if (path === '/auth/change-password') await assertNoPendingWrites(accountId());
  // Authentication and sync are network boundaries, never optimistic local successes.
  if (method === 'get' && path === '/auth/me' && (!navigator.onLine || tokenStore.isLocal())) {
    const user = readActiveIdentity();
    if (user) return { data: user, status: 200, statusText: 'Local', headers: {}, config };
  }
  if (/^\/(auth|sync|offline-sync)(\/|\?|$)/.test(path) || path.startsWith('/sync-all') || path.startsWith('/registry') && !path.startsWith('/registry/admin/')) return networkAdapter(config);
  let account: string;
  try { account = accountId(); } catch { return networkAdapter(config); }
  const stillCurrent = () => {
    let current = ''; try { current = accountId(); } catch { /* Logged out while reading. */ }
    if (current !== account) throw new axios.CanceledError('Account changed during request');
  };
  const response = (data: any) => { stillCurrent(); return { data, status: 200, statusText: 'Local', headers: {}, config }; };
  if (method !== 'get' && !(config.data instanceof FormData) && config.responseType !== 'blob') {
    const payload = typeof config.data === 'string' ? JSON.parse(config.data) : config.data;
    const local = await localWrite(method, path, payload);
    if (local !== undefined) return response(await settleLocalWrite(local));
  }
  if (method === 'get' && config.responseType !== 'blob') {
    if (/^\/(?:students|courses|circles|teachers|exams|recitations|transfers|suspensions|preparations)\/[0-9a-f-]{36}(?:\?|$)/i.test(path)) {
      const draft = await localRead(path, { ...config.params });
      if (draft?.synced === 0) return response(draft);
    }
    if (/^\/chat\/conversations\/[^/]+$/.test(path)) {
      const draft = await localConversation(path);
      if (draft?.synced === 0) return response(draft);
    }
    if (/^\/support\/[^/]+$/.test(path) && !['/support/staff', '/support/stats'].includes(path)) {
      const pendingTicket = await localRead(path, { ...config.params });
      if (pendingTicket?.synced === 0) return response(pendingTicket);
    }
    // Only serve a response actually downloaded for this exact account/path/
    // parameter set. An unbootstrapped local table can look like an empty list.
    // Pending writes keep the existing reconciliation path authoritative.
    const scopedConversation = path.match(/^\/chat\/conversations\/([0-9a-f-]{36})(?:\/messages)?$/i)?.[1];
    const conversationCacheAllowed = !scopedConversation || !(await db.meta.get(`${account}:conversationListKnown`))?.value || !!(await localConversation(`/chat/conversations/${scopedConversation}`));
    if (navigator.onLine && !tokenStore.isLocal() && !(config as any)._backgroundRead
      && conversationCacheAllowed && !(await db.queue.where('accountId').equals(account).count())) {
      const key = responseKey(account, path, config.params);
      const cached = await db.responses.get(key);
      const cachedData = ['/profile-reviews/me', '/attendance/absence-permissions'].includes(path) || path.startsWith('/support') || /^\/chat\/conversations(?:\/[^/]+)?$/.test(path) ? await localRead(path, { ...config.params }) : cached?.data;
      stillCurrent();
      if (cached && cachedData !== undefined && !(cached as any).__lockedLocal) {
        refreshRead(key, async () => {
          stillCurrent();
          try {
            // Use the full client so token refresh and server rejections retain
            // their normal handling. Do not inherit a completed view's signal.
            const fresh = await api.request({ ...config, signal: undefined, adapter: api.defaults.adapter, _backgroundRead: true, _expectedAccount: account } as any);
            stillCurrent();
            if (JSON.stringify(fresh.data) !== JSON.stringify(cachedData)) window.dispatchEvent(new Event('halaqat:changed'));
          } catch (error) {
            stillCurrent();
            if (axios.isAxiosError(error) && [403, 404].includes(error.response?.status || 0)) {
              await db.responses.delete(key);
              window.dispatchEvent(new Event('halaqat:changed'));
            }
            throw error;
          }
        });
        return response(cachedData);
      }
    }
    const localTable = path.split('?')[0] === '/support' ? 'supportTickets' : path.startsWith('/exams/requests') ? 'examRequests' : path === '/attendance/absence-permissions' ? 'absencePermissions' : path === '/attendance/summons' ? 'guardianSummons' : path.split('/').filter(Boolean)[0];
    if (!navigator.onLine || tokenStore.isLocal()) {
      const conversationId = path.match(/^\/chat\/conversations\/([0-9a-f-]{36})(?:\/messages)?$/i)?.[1];
      if (conversationId && (await db.meta.get(`${account}:conversationListKnown`))?.value && !(await localConversation(`/chat/conversations/${conversationId}`))) throw new Error('لم تعد المحادثة ضمن القائمة المسموح بها لهذا الحساب');
      const local = await localRead(path, { ...config.params });
      if (local !== undefined) return response(local);
      if (/^\/support(?:\/[0-9a-f-]{36})?(?:\?|$)/i.test(path)) throw new Error('طلب الدعم غير محفوظ أو لم يعد ضمن صلاحيات الحساب');
      const cached = await db.responses.get(responseKey(account, path, config.params));
      if (cached && (!navigator.onLine || tokenStore.isLocal())) return response(cached.data);
      if (!navigator.onLine || tokenStore.isLocal()) {
        const url = new URL(path, 'https://local.invalid');
        const params = { ...Object.fromEntries(url.searchParams), ...config.params };
        const prefetched = await readPrefetched(account, url.pathname, params);
        if (prefetched !== undefined) return response(prefetched);
      }
    }
    let result;
    try { result = await networkAdapter(config); }
    catch (error) {
      if (axios.isAxiosError(error) && !error.response) {
        const conversationId = path.match(/^\/chat\/conversations\/([0-9a-f-]{36})(?:\/messages)?$/i)?.[1];
        if (conversationId && (await db.meta.get(`${account}:conversationListKnown`))?.value && !(await localConversation(`/chat/conversations/${conversationId}`))) throw error;
        const local = await localRead(path, { ...config.params });
        if (local !== undefined) return response(local);
        if (/^\/support(?:\/[0-9a-f-]{36})?(?:\?|$)/i.test(path)) throw error;
        const cached = await db.responses.get(responseKey(account, path, config.params));
        if (cached) return response(cached.data);
        const url = new URL(path, 'https://local.invalid');
        const prefetched = await readPrefetched(account, url.pathname, { ...Object.fromEntries(url.searchParams), ...config.params });
        if (prefetched !== undefined) return response(prefetched);
      }
      throw error;
    }
    let data = result.data;
    if (typeof data === 'string') { try { data = JSON.parse(data); } catch { /* Non-JSON responses are preserved verbatim. */ } }
    stillCurrent();
    await rememberRead(path, config.params, data);
    // A read started before submission can finish after the outbox commits.
    // Reconcile requests from the durable replica so that stale responses cannot
    // hide a queued or acknowledged request while its profile awaits approval.
    if (['/profile-reviews/me', '/attendance/absence-permissions'].includes(path)) data = await localRead(path, { ...config.params }) ?? data;
    if (path.split('?')[0] === '/media-activities' && Array.isArray(data)) {
      const dirty = await db.table('mediaActivities').where('accountId').equals(account).filter(row => row.synced === 0).toArray();
      if (dirty.length) {
        const local = await localRead(path, { ...config.params }) || [];
        const changedIds = new Set(dirty.map(row => row.id));
        data = [...data.filter((row: any) => !changedIds.has(row.id)), ...local.filter((row: any) => changedIds.has(row.id))]
          .sort((a: any, b: any) => String(b.activityDate).localeCompare(String(a.activityDate)) || String(b.createdAt).localeCompare(String(a.createdAt)));
      }
    }
    if (path === '/chat/conversations' && Array.isArray(data)) data = await localConversation(path) ?? data;
    if (path === '/community/feed' || /^\/chat\/conversations\/[^/]+\/messages$/.test(path)) data = await localRead(path, { ...config.params }) ?? data;
    if (path.startsWith('/community/users/') && path.endsWith('/' + account)) data = { ...data, ...(await localRead(path, { ...config.params })) };
    // Keep pending offline-created rows visible in server-backed collection views.
    // The remote response remains authoritative for every row already on the server.
    if (Array.isArray(data?.data) && db.tables.some(table => table.name === localTable)) {
      const pending = await db.table(localTable).where('accountId').equals(account)
        .filter((row: any) => row.synced === 0 && !row.pendingDelete).toArray();
      const rows = [...data.data]; const seen = new Set(rows.map((row: any) => row.id));
      for (const row of pending) if (!seen.has(row.id)) rows.push(row);
      if (rows.length !== data.data.length) data = { ...data, data: rows, meta: data.meta ? { ...data.meta, total: Math.max(data.meta.total || 0, rows.length) } : data.meta };
    }
    if (path === '/attendance/sheet' && data?.students) {
      const pending = await db.students.where('accountId').equals(account)
        .filter((row: any) => row.synced === 0 && !row.pendingDelete && (row.circleId || row.circle?.id) === config.params?.circleId).toArray();
      const roster = [...data.students]; const seen = new Set(roster.map((row: any) => row.id));
      for (const student of pending) if (!seen.has(student.id)) roster.push({ ...student, attendance: null });
      if (roster.length !== data.students.length) data = { ...data, students: roster };
    }
    result.data = data;
    return result;
  }
  const result = await networkAdapter(config);
  if (['post', 'patch', 'put', 'delete'].includes(method)) {
    void reconcileAfterNetworkWrite().catch(() => undefined);
  }
  return result;
};

api.interceptors.request.use(async (config) => {
  // Public school settings (including donations) must load without a login,
  // local account initialization, or an expired authorization token.
  if (config.url === '/settings/public' && (config.method || 'get').toLowerCase() === 'get') {
    config.timeout = 90000; // Render free instances may take >50s to wake.
    if (config.headers) delete config.headers.Authorization;
    return config;
  }
  await tokenStore.ready();
  if (config.url && /^\/(?:students|courses|circles|teachers|exams|recitations|media-activities|transfers|suspensions|preparations)\/[0-9a-f-]{36}(?:\/.*)?$/i.test(config.url)) {
    const owner = readActiveIdentity()?.id;
    if (owner) {
      const localId = config.url.split('/')[2];
      const mapped = (await db.meta.get(`${owner}:id:${localId}`))?.value;
      if (typeof mapped === 'string') config.url = config.url.replace(localId, mapped);
      if (readActiveIdentity()?.id !== owner) throw new axios.CanceledError('Account changed during entity request');
    }
  }
  if (config.url && /^\/chat\/conversations\/[0-9a-f-]{36}(?:\/.*)?$/i.test(config.url)) {
    const owner = readActiveIdentity()?.id;
    if (owner) {
      const localId = config.url.split('/')[3];
      const mapped = (await db.meta.get(`${owner}:id:${localId}`))?.value;
      if (typeof mapped === 'string') config.url = config.url.replace(localId, mapped);
      if (readActiveIdentity()?.id !== owner) throw new axios.CanceledError('Account changed during conversation request');
    }
  }
  if (config.url && /^\/support\/[0-9a-f-]{36}(?:\/reply)?$/i.test(config.url)) {
    const owner = readActiveIdentity()?.id;
    if (owner) {
      const localId = config.url.split('/')[2];
      const mapped = (await db.meta.get(`${owner}:id:${localId}`))?.value;
      if (typeof mapped === 'string') config.url = config.url.replace(localId, mapped);
      if (readActiveIdentity()?.id !== owner) throw new axios.CanceledError('Account changed during support request');
    }
  }
  if ((config as any)._expectedAccount && (config as any)._expectedAccount !== readActiveIdentity()?.id) {
    throw new axios.CanceledError('Account changed before request');
  }
  if (tokenStore.isClosing() && !['get', 'head'].includes(config.method || 'get') && config.url !== '/auth/logout' && !config.url?.startsWith('/push/devices')) {
    throw Object.assign(new Error('تسجيل الخروج قيد التنفيذ؛ انتظر قبل إجراء تعديل جديد'), { localWriteRejected: true });
  }
  const token = tokenStore.access();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// --- refresh handling -------------------------------------------------------
// A single in-flight refresh is shared by every request that got a 401, so a
// burst of parallel calls does not trigger a burst of refreshes.
let refreshPromise: Promise<string> | null = null;

async function refreshAccessToken(): Promise<string> {
  const refreshToken = tokenStore.refresh();
  if (!refreshToken) throw new Error('no refresh token');

  const { data } = await axios.post(`${BASE_URL}/auth/refresh`, { refreshToken }, { timeout: 45000 });
  const owner = tokenStore.owner();
  if (owner && data.user?.id !== owner) { await tokenStore.clear(); throw new Error('Refresh account mismatch'); }
  await tokenStore.set(data.accessToken, data.refreshToken, data.user?.id);
  window.dispatchEvent(new CustomEvent('qc:tokens-updated', { detail: data.user }));
  return data.accessToken;
}

api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const original = error.config as AxiosRequestConfig & { _retried?: boolean; _networkRetryCount?: number };

    // Read-only requests can safely retry transient transport/server failures.
    // Never automatically retry writes: a timed-out POST may already have
    // committed on the server and must be replayed through the offline outbox.
    const retries = original?._networkRetryCount ?? 0;
    if (original && shouldRetryReadRequest({
      method: original.method,
      status: error.response?.status,
      hasResponse: Boolean(error.response),
      code: error.code,
      attempts: retries,
    })) {
      original._networkRetryCount = retries + 1;
      await new Promise((resolve) => setTimeout(resolve, readRetryDelayMs(retries)));
      return api(original);
    }

    const isAuthCall = original?.url?.includes('/auth/login') || original?.url?.includes('/auth/refresh');
    const status = error.response?.status;

    if (status === 401 && original && !original._retried && !isAuthCall) {
      original._retried = true;
      if (!tokenStore.refresh()) {
        await tokenStore.clear(); window.dispatchEvent(new Event('qc:session-rejected'));
        return Promise.reject(error);
      }
      try {
        refreshPromise = refreshPromise ?? refreshAccessToken().finally(() => (refreshPromise = null));
        const token = await refreshPromise;
        original.headers = { ...original.headers, Authorization: `Bearer ${token}` };
        return api(original);
      } catch (refreshError) {
        // A timeout or network outage must not erase the offline session.
        // Clear it only when the refresh endpoint explicitly rejects the token.
        const refreshStatus = axios.isAxiosError(refreshError) ? refreshError.response?.status : undefined;
        if (refreshStatus === 400 || refreshStatus === 401 || refreshStatus === 403) {
          await tokenStore.clear();
          window.dispatchEvent(new Event('qc:session-rejected'));
          if (!window.location.pathname.startsWith('/login')) {
            window.location.href = '/login';
          }
        }
        // Preserve a transport failure from refresh so offline outbox replay
        // can retry instead of misclassifying the original 401 as a permanent
        // authorization rejection. Explicit refresh-token rejection still
        // returns the original 401 after clearing the local session above.
        if (axios.isAxiosError(refreshError) && !refreshError.response) {
          return Promise.reject(refreshError);
        }
        return Promise.reject(error);
      }
    }

    return Promise.reject(error);
  },
);

/** Extracts the Arabic message the API returns, with a sensible fallback. */
export function apiError(error: unknown, fallback = 'حدث خطأ، يرجى المحاولة مرة أخرى'): string {
  if (error instanceof Error && ((error as any).localWriteRejected || (error as any).offlineLoginError)) return error.message;
  if (axios.isAxiosError(error)) {
    const data = error.response?.data as { message?: string | string[] } | undefined;
    if (data?.message) return Array.isArray(data.message) ? data.message[0] : data.message;
    if (error.code === 'ECONNABORTED') return 'انتهت مهلة الاتصال بالخادم';
    if (!error.response) return 'تعذر الاتصال بالخادم، تحقق من الاتصال';
  }
  return fallback;
}
