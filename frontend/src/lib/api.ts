import axios, { AxiosError, AxiosRequestConfig } from 'axios';
import { Capacitor } from '@capacitor/core';
import { shouldRetryReadRequest, readRetryDelayMs } from './offline/retry-policy.js';
import { configureOffline, accountId, settleLocalWrite, reconcileAfterNetworkWrite } from './offline-engine';
import { db } from './db';
import { localRead, localWrite, rememberRead, responseKey } from './local-api';
import { prefetchSections, readPrefetched } from './offline-prefetch';

const IS_NATIVE = Capacitor.isNativePlatform();
const CONFIGURED_API_URL = import.meta.env.VITE_API_URL?.trim();
// Android APKs must never send relative /api requests to the WebView's local
// origin. Keep the deployed API as the native default while allowing builds to
// override it explicitly. Browser development continues to use Vite's proxy.
const NATIVE_API_URL = 'https://quran-memorization-circles.onrender.com/api';
const BASE_URL = CONFIGURED_API_URL || (IS_NATIVE ? NATIVE_API_URL : '/api');

export const ACCESS_TOKEN_KEY = 'qc.accessToken';
export const REFRESH_TOKEN_KEY = 'qc.refreshToken';

export const tokenStore = {
  access: () => localStorage.getItem(ACCESS_TOKEN_KEY),
  refresh: () => localStorage.getItem(REFRESH_TOKEN_KEY),
  set(access: string, refresh: string) {
    localStorage.setItem(ACCESS_TOKEN_KEY, access);
    localStorage.setItem(REFRESH_TOKEN_KEY, refresh);
  },
  clear() {
    localStorage.removeItem(ACCESS_TOKEN_KEY);
    localStorage.removeItem(REFRESH_TOKEN_KEY);
  },
};

export const api = axios.create({
  baseURL: BASE_URL,
  headers: { 'Content-Type': 'application/json' },
  timeout: 45000,
});

const networkAdapter = axios.getAdapter(api.defaults.adapter!);
configureOffline(async (method, path, data) => {
  const response = await api.request({ method, url: path, data, adapter: networkAdapter });
  return response.data;
}, () => {
  try { return JSON.parse(localStorage.getItem('qc.offlineUser') || 'null')?.id || ''; } catch { return ''; }
}, async (account, changedEntities) => {
  const user = JSON.parse(localStorage.getItem('qc.offlineUser') || 'null');
  await prefetchSections(async (method, path, headers) => (await api.request({ method, url: path, headers, adapter: networkAdapter })).data,
    account, () => { try { return JSON.parse(localStorage.getItem('qc.offlineUser') || 'null')?.id || ''; } catch { return ''; } }, user?.role || '', changedEntities);
});
api.defaults.adapter = async (config) => {
  const path = config.url || ''; const method = (config.method || 'get').toLowerCase();
  // Authentication and sync are network boundaries, never optimistic local successes.
  if (method === 'get' && path === '/auth/me' && !navigator.onLine) {
    const user = JSON.parse(localStorage.getItem('qc.offlineUser') || 'null');
    if (user) return { data: user, status: 200, statusText: 'Local', headers: {}, config };
  }
  if (/^\/(auth|sync|offline-sync)(\/|\?|$)/.test(path) || path.startsWith('/sync-all') || path.startsWith('/registry') && !path.startsWith('/registry/admin/')) return networkAdapter(config);
  let account: string;
  try { account = accountId(); } catch { return networkAdapter(config); }
  const response = (data: any) => ({ data, status: 200, statusText: 'Local', headers: {}, config });
  if (method !== 'get' && !(config.data instanceof FormData) && config.responseType !== 'blob') {
    const payload = typeof config.data === 'string' ? JSON.parse(config.data) : config.data;
    const local = await localWrite(method, path, payload);
    if (local !== undefined) return response(await settleLocalWrite(local));
  }
  if (method === 'get' && config.responseType !== 'blob') {
    const downloaded = await db.meta.get(`${account}:downloadedAt`);
    const localTable = path.split('/').filter(Boolean)[0];
    const hasPending = db.tables.some(table => table.name === localTable) &&
      await db.table(localTable).where('accountId').equals(account).filter((row: any) => row.synced === 0).count() > 0;
    if (downloaded || !navigator.onLine || hasPending) {
      const local = await localRead(path, { ...config.params });
      if (local !== undefined) return response(local);
      const cached = await db.responses.get(responseKey(account, path, config.params));
      if (cached && !navigator.onLine) return response(cached.data);
      if (!navigator.onLine) {
        const url = new URL(path, 'https://local.invalid');
        const params = { ...Object.fromEntries(url.searchParams), ...config.params };
        const prefetched = await readPrefetched(account, url.pathname, params);
        if (prefetched !== undefined) return response(prefetched);
      }
    }
    const result = await networkAdapter(config);
    let data = result.data;
    if (typeof data === 'string') { try { data = JSON.parse(data); } catch { /* Non-JSON responses are preserved verbatim. */ } }
    await rememberRead(path, config.params, data);
    return result;
  }
  const result = await networkAdapter(config);
  if (['post', 'patch', 'put', 'delete'].includes(method)) {
    void reconcileAfterNetworkWrite().catch(() => undefined);
  }
  return result;
};

api.interceptors.request.use((config) => {
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
  tokenStore.set(data.accessToken, data.refreshToken);
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
          tokenStore.clear();
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
