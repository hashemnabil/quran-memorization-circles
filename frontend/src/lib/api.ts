import axios, { AxiosError, AxiosRequestConfig } from 'axios';
import { Capacitor } from '@capacitor/core';

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
    const method = (original?.method ?? 'get').toLowerCase();
    const status = error.response?.status;
    const retryable = error.code !== 'ERR_CANCELED' && (!error.response || status === 408 || status === 429 || (status !== undefined && status >= 500));
    const retries = original?._networkRetryCount ?? 0;
    if (original && method === 'get' && retryable && retries < 2) {
      original._networkRetryCount = retries + 1;
      await new Promise((resolve) => setTimeout(resolve, 500 * 2 ** retries));
      return api(original);
    }

    const isAuthCall = original?.url?.includes('/auth/login') || original?.url?.includes('/auth/refresh');

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
  if (axios.isAxiosError(error)) {
    const data = error.response?.data as { message?: string | string[] } | undefined;
    if (data?.message) return Array.isArray(data.message) ? data.message[0] : data.message;
    if (error.code === 'ECONNABORTED') return 'انتهت مهلة الاتصال بالخادم';
    if (!error.response) return 'تعذر الاتصال بالخادم، تحقق من الاتصال';
  }
  return fallback;
}
