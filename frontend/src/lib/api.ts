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
import { syncStudentPhotos } from './pending-student-photos';
import { localConversation } from './local-conversations';
import { dependsOnPendingWrite, remapWriteReferences, writeReferenceIds } from './primary-write-policy';

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
    const key=`public:school-settings:${BASE_URL}`;
    if(navigator.onLine){
      try{
        const result=await networkAdapter(config);
        let data=result.data;
        if(typeof data==='string'){try{data=JSON.parse(data);}catch{return result;}}
        if(data&&typeof data==='object'&&!Array.isArray(data)){
          result.data={...data,name:schoolName(data.name)};
          void db.meta.put({key,value:result.data}).catch(()=>undefined);
        }
        return result;
      }catch(error){if(!axios.isAxiosError(error)||error.response)throw error;}
    }
    const cached=await db.meta.get(key).catch(()=>undefined);
    if(cached)return {data:{...cached.value,name:schoolName(cached.value?.name)},status:200,statusText:'Local',headers:{},config};
    throw new Error('لا توجد بيانات مدرسة محفوظة بعد؛ يلزم الاتصال لتنزيلها أول مرة');
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
    // Online writes use the primary API. Existing queued operations retain their
    // original order, so an edit cannot overtake an offline-created dependency.
    let hasPending=true;
    if(navigator.onLine&&!tokenStore.isLocal()){
      const pending=await db.queue.where('accountId').equals(account).toArray().catch(()=>[]);
      const references=[...new Set([...writeReferenceIds(payload),...pending.map(operation=>operation.entityId)])];
      const mappings=references.length?await db.meta.bulkGet(references.map(id=>`${account}:id:${id}`)).catch(()=>[]):[];
      stillCurrent();
      const aliases=new Map<string,string>();
      mappings.forEach((row,index)=>{if(typeof row?.value==='string')aliases.set(references[index],row.value);});
      const canonical=remapWriteReferences(payload,aliases);
      hasPending=dependsOnPendingWrite(path,payload,pending)||dependsOnPendingWrite(path,canonical,pending.map(operation=>({...operation,entityId:aliases.get(operation.entityId)??operation.entityId})));
      if(!hasPending)config.data=typeof config.data==='string'?JSON.stringify(canonical):canonical;
    }
    const local = hasPending ? await localWrite(method, path, payload) : undefined;
    if (local !== undefined) return response(await settleLocalWrite(local));
  }
  if (method === 'get' && config.responseType !== 'blob') {
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
    if(!navigator.onLine||tokenStore.isLocal())throw new Error('هذه البيانات غير محفوظة على الجهاز بعد؛ اتصل بالخادم لتنزيلها.');
    let result;
    try { result = await networkAdapter(config); }
    catch (error) {
      stillCurrent();
      if(axios.isAxiosError(error)&&error.response?.status===404){
        const ids=new Set(path.split('?')[0].split('/').filter(Boolean));
        const draftCreate=await db.queue.where('accountId').equals(account).filter(op=>op.action==='create'&&!op.error&&ids.has(op.entityId)).first();
        if(draftCreate){const draft=await localRead(path,{...config.params});if(draft?.synced===0)return response(draft);}
      }
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
    // Do not expose a fresh online result before its offline replica is durable.
    // Otherwise an immediate airplane-mode reload can restore an older snapshot.
    await rememberRead(path, config.params, data).catch(() => undefined);
    stillCurrent();
    result.data = data;
    return result;
  }
  const result = await networkAdapter(config);
  if (['post', 'patch', 'put', 'delete'].includes(method)) {
    stillCurrent();
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
