import axios, { AxiosError, AxiosRequestConfig } from 'axios';

const BASE_URL = import.meta.env.VITE_API_URL || '/api';

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
  timeout: 30000,
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

  const { data } = await axios.post(`${BASE_URL}/auth/refresh`, { refreshToken });
  tokenStore.set(data.accessToken, data.refreshToken);
  return data.accessToken;
}

api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const original = error.config as AxiosRequestConfig & { _retried?: boolean };
    const status = error.response?.status;

    const isAuthCall = original?.url?.includes('/auth/login') || original?.url?.includes('/auth/refresh');

    if (status === 401 && original && !original._retried && !isAuthCall) {
      original._retried = true;
      try {
        refreshPromise = refreshPromise ?? refreshAccessToken().finally(() => (refreshPromise = null));
        const token = await refreshPromise;
        original.headers = { ...original.headers, Authorization: `Bearer ${token}` };
        return api(original);
      } catch {
        tokenStore.clear();
        // Full reload so every store and query cache is dropped.
        if (!window.location.pathname.startsWith('/login')) {
          window.location.href = '/login';
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
