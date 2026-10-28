import { create } from 'zustand';
import { offlineAccessAllowed, recordServerVerification } from '@/lib/offline-access';
import axios from 'axios';
import { api, tokenStore } from '@/lib/api';
import { clearHeartbeat, expireStaleSession } from '@/lib/session';
import { resetQueryCache, queryClient } from '@/lib/queryClient';
import { clearPersistedQueryCache, persistQueryCache, restoreQueryCache } from '@/lib/offline/queryCache';
import { clearOfflineOperations } from '@/lib/offline/outbox';
import { clearOfflineReplica } from '@/lib/offline/changeFeed';
import type { AuthUser, Role } from '@/types';
import { rememberOfflineLogin, unlockOfflineLogin, forgetAccountOfflineLogin } from '@/lib/offline-login';
import { assertNoPendingWrites, clearAccountData } from '@/lib/account-cleanup';
import { disconnectSocket } from '@/lib/socket';
import { credentialStorage } from '@/lib/credential-storage';
import { cacheActiveIdentity, clearActiveIdentity, readActiveIdentity } from '@/lib/active-identity';
import { persistDataSession, restoreDataSession, lockDataSession, protectLocalAccount } from '@/lib/local-data-session';
import { db } from '@/lib/db';
import { forgetEncryptionMarker } from '@/lib/local-encryption';
import { cacheReconnectCredentials, restoreReconnectCredentials, clearReconnectCredentials, type ReconnectCredentials } from '@/lib/reconnect-credentials';

const OFFLINE_USER_KEY = 'qc.offlineUser';
const allowedRoles: Role[] = ['ADMIN', 'SUPERVISOR', 'TEACHER', 'EXAM_COMMITTEE', 'STUDENT', 'PARENT', 'SUPPORT'];
// Supplied password stays in RAM plus encrypted tab storage until verification;
// it is never included in tokens, IndexedDB, localStorage, exports or logs.
let reconnectCredentials: ReconnectCredentials | undefined;
let onlineVerification: Promise<void> | undefined;

function cacheOfflineUser(user: AuthUser) {
  // Store only the minimum identity needed to render the signed-in shell offline.
  // Private profile/contact fields remain in the account-scoped query cache.
  try {
    cacheActiveIdentity(user);
  } catch { /* Offline identity is best-effort when storage is unavailable. */ }
}

function readOfflineUser(): AuthUser | null {
  try {
    const user = readActiveIdentity() as Partial<AuthUser> | null;
    if (!user) return null;
    if (typeof user.id !== 'string' || typeof user.username !== 'string' ||
        typeof user.fullName !== 'string' || !allowedRoles.includes(user.role as Role) ||
        user.isActive !== true) return null;
    return { id: user.id, username: user.username, fullName: user.fullName,
      role: user.role as Role, isActive: true, mustChangePassword: !!user.mustChangePassword };
  } catch { return null; }
}

interface AuthState {
  user: AuthUser | null;
  status: 'idle' | 'loading' | 'authenticated' | 'unauthenticated';
  login: (username: string, password: string) => Promise<AuthUser>;
  logout: () => Promise<void>;
  forgetDevice: () => Promise<void>;
  lock: () => void;
  resumeOnline: () => Promise<void>;
  loadSession: () => Promise<void>;
  setUser: (user: AuthUser) => void;
  hasRole: (...roles: Role[]) => boolean;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  status: 'idle',

  async login(username, password) {
    const unlock = async () => {
      try {
        const session = await unlockOfflineLogin(username, password);
        await protectLocalAccount(session.user.id);
        if (!await offlineAccessAllowed(session.user.id)) throw new Error('يلزم الاتصال للتحقق من الحساب كل 30 يومًا؛ بياناتك وتعديلاتك المحلية محفوظة');
        await persistDataSession(session.user.id).catch(() => undefined);
        resetQueryCache();
        await tokenStore.ready().catch(() => undefined);
        if (tokenStore.owner() && tokenStore.owner() !== session.user.id) await tokenStore.clear().catch(() => undefined);
        tokenStore.setLocal(true);
        reconnectCredentials = { account: session.user.id, username: username.trim().toLowerCase(), password };
        cacheReconnectCredentials(reconnectCredentials);
        sessionStorage.setItem('qc.localUnlocked', session.user.id);
        cacheOfflineUser(session.user);
        set({ user: session.user, status: 'authenticated' });
        return session.user;
      } catch (error) { throw Object.assign(error as Error, { offlineLoginError: true }); }
    };
    if (!navigator.onLine) return unlock();
    let data;
    try { ({ data } = await api.post('/auth/login', { username, password })); }
    catch (error) {
      if (axios.isAxiosError(error) && !error.response) return unlock();
      throw error;
    }
    await restoreDataSession(data.user.id).catch(() => undefined);
    let localStage = 'حفظ الدخول دون إنترنت';
    try {
      await rememberOfflineLogin(username, password, data.user, data);
      localStage = 'فتح وتشفير بيانات الحساب المحلية';
      await protectLocalAccount(data.user.id);
      localStage = 'حفظ جلسة الحساب المحلية';
      await persistDataSession(data.user.id);
    } catch (cause) {
      const name = cause instanceof Error ? cause.name : 'UnknownError';
      const detail = cause instanceof Error && cause.name === 'Error' ? cause.message : name;
      throw Object.assign(new Error(`نجح التحقق من الحساب، وتعذر ${localStage}: ${detail}`), { offlineLoginError: true });
    }
    const user = await adoptSession(data, set);
    await import('@/lib/local-lock').then(module => module.resetLockAfterOnlineLogin(user.id));
    reconnectCredentials = undefined;
    clearReconnectCredentials();
    return user;
  },

  async logout() {
    const user = get().user;
    tokenStore.setClosing(true); set({ status: 'loading' });
    try {
      await queryClient.cancelQueries();
      if (user) await persistQueryCache(user.id);
      await import('@/lib/native-push').then(module => module.disableNativePush()).catch(() => undefined);
      if (navigator.onLine) await api.post('/auth/logout', { refreshToken: tokenStore.refresh() }, { timeout: 5000 }).catch(() => undefined);
    } finally {
      // A storage/plugin error must never restore an authenticated shell after
      // its key was locked. Each cleanup runs even if an earlier one fails.
      try { await tokenStore.clear(); }
      finally {
        try { await lockDataSession(user?.id); }
        finally {
          reconnectCredentials = undefined; clearReconnectCredentials(); disconnectSocket();
          clearActiveIdentity(); sessionStorage.removeItem('qc.localUnlocked');
          clearHeartbeat(); resetQueryCache(); set({ user: null, status: 'unauthenticated' });
          tokenStore.setClosing(false);
        }
      }
    }
  },

  async forgetDevice() {
    const accountId = get().user?.id ?? '';
    const previous = get().user;
    tokenStore.setClosing(true);
    set({ status: 'loading' });
    try {
    await queryClient.cancelQueries();
    await assertNoPendingWrites(accountId);
    // Invalidate account-scoped background writers before clearing their stores.
    clearActiveIdentity();
    await clearAccountData(accountId);
    if (typeof caches !== 'undefined') await caches.delete('quran-circles-images');
    await import('@/lib/native-push').then(module => module.disableNativePush()).catch(() => undefined);
    try {
      if (navigator.onLine) await api.post('/auth/logout', { refreshToken: tokenStore.refresh() });
    } catch {
      // Logging out locally matters more than the server acknowledging it.
    }
    await tokenStore.clear();
    await credentialStorage.remove('registry.accessToken'); localStorage.removeItem('registry.accessToken');
    disconnectSocket();
    sessionStorage.removeItem('qc.localUnlocked');
    if (get().user?.username) forgetAccountOfflineLogin(accountId, get().user!.username);
    await lockDataSession(accountId); forgetEncryptionMarker(accountId);
    reconnectCredentials = undefined; clearReconnectCredentials(); clearActiveIdentity();
    clearHeartbeat();
    try { localStorage.removeItem(OFFLINE_USER_KEY); } catch { /* ignore unavailable storage */ }
    // Nothing the previous account loaded may survive into the next session.
    resetQueryCache();
    set({ user: null, status: 'unauthenticated' });
    // Explicit device removal, unlike ordinary logout, erases private local reads.
    await Promise.all([
      clearPersistedQueryCache(accountId),
      clearOfflineOperations(accountId),
      clearOfflineReplica(accountId),
    ]);
    } catch (error) {
      if (get().user) {
        if (previous) cacheOfflineUser(previous);
        set({ user: previous, status: previous ? 'authenticated' : 'unauthenticated' });
      }
      throw error;
    } finally { tokenStore.setClosing(false); }
  },

  async loadSession() {
    try { await tokenStore.ready(); } catch { set({ status: 'unauthenticated', user: null }); return; }
    const owner = tokenStore.owner();
    let offlineAllowed = true;
    if (owner) {
      try {
        await restoreDataSession(owner);
        offlineAllowed = await offlineAccessAllowed(owner);
        const identity = (await db.meta.get(`${owner}:identity`))?.value;
        if (identity?.id === owner) cacheOfflineUser(identity);
      } catch { set({ status: 'unauthenticated', user: null }); return; }
    }
    expireStaleSession();
    const accessToken = tokenStore.access();
    if (!accessToken) {
      const local = readOfflineUser();
      if (local && sessionStorage.getItem('qc.localUnlocked') === local.id) {
        try {
          await restoreDataSession(local.id);
          if (!await offlineAccessAllowed(local.id)) throw new Error('يلزم التحقق من الخادم بعد 30 يومًا');
          reconnectCredentials = restoreReconnectCredentials(local.id);
          if (reconnectCredentials) {
            tokenStore.setLocal(true); set({ user: local, status: 'authenticated' }); return;
          }
        } catch { /* The local password can unlock again without a network request. */ }
      }
      set({ status: 'unauthenticated', user: null });
      return;
    }

    // On a cold launch in airplane mode, restore the previously authenticated
    // identity immediately. Do not wait for an impossible /auth/me request.
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      const offlineUser = readOfflineUser();
      set(offlineUser && offlineAllowed
        ? { user: offlineUser, status: 'authenticated' }
        : { user: null, status: 'unauthenticated' });
      return;
    }

    const cachedIdentity = readOfflineUser();
    if (cachedIdentity && cachedIdentity.id === owner && offlineAllowed) {
      await restoreQueryCache(owner, () => tokenStore.owner() === owner).catch(() => false);
      if (tokenStore.owner() !== owner) return;
      set({ user: cachedIdentity, status: 'authenticated' });
    } else set({ status: 'loading' });
    try {
      const { data } = await api.get('/auth/me');
      if (tokenStore.owner() !== owner) return;
      await recordServerVerification(data.id);
      cacheOfflineUser(data as AuthUser);
      set({ user: data, status: 'authenticated' });
    } catch (error) {
      if (tokenStore.owner() !== owner) return;
      const isAxios = axios.isAxiosError(error);
      const status = isAxios ? error.response?.status : undefined;
      const isTemporaryFailure = !isAxios || !error.response || status === 408 || status === 429 || (status !== undefined && status >= 500);
      const offlineUser = isTemporaryFailure && offlineAllowed ? readOfflineUser() : null;
      if (offlineUser) {
        // Cached reads may render offline; writes still require server authorization.
        set({ user: offlineUser, status: 'authenticated' });
        return;
      }
      // Preserve tokens after temporary network failures; only an explicit
      // authentication rejection should force a fresh sign-in.
      if (status === 401 || status === 403) {
        await tokenStore.clear(); clearActiveIdentity();
      }
      set({ user: null, status: 'unauthenticated' });
    }
  },

  lock() {
    disconnectSocket(); resetQueryCache(); sessionStorage.removeItem('qc.localUnlocked');
    reconnectCredentials = undefined;
    clearReconnectCredentials();
    void lockDataSession(get().user?.id).catch(() => undefined);
    void tokenStore.clear().catch(() => undefined); tokenStore.setLocal(true); clearActiveIdentity();
    set({ user: null, status: 'unauthenticated' });
  },
  async resumeOnline() {
    if (!navigator.onLine || !get().user) return;
    if (onlineVerification) return onlineVerification;
    const account = get().user!.id;
    onlineVerification = (async () => { try {
    if (tokenStore.isLocal()) {
      const refreshToken = tokenStore.refresh();
      let data;
      if (reconnectCredentials?.account === account) {
        ({ data } = await api.post('/auth/login', { username: reconnectCredentials.username, password: reconnectCredentials.password }));
      } else {
        if (!refreshToken) throw new Error('أدخل كلمة المرور لإعادة التحقق؛ بياناتك المحلية محفوظة');
        ({ data } = await api.post('/auth/refresh', { refreshToken }));
      }
      if (get().user?.id !== account || data.user?.id !== account) throw new Error('تغيّر الحساب أثناء التحقق من الجلسة');
      await tokenStore.set(data.accessToken, data.refreshToken, data.user.id);
    }
    const { data } = await api.get('/auth/me');
    if (get().user?.id === account) {
      await db.meta.put({ key: `${account}:identity`, value: data });
      await recordServerVerification(account);
      if (get().user?.id === account) { cacheOfflineUser(data); set({ user: data }); reconnectCredentials = undefined; clearReconnectCredentials(); }
    }
    } catch (error) {
      if (axios.isAxiosError(error) && [400, 401, 403].includes(error.response?.status || 0)) {
        await tokenStore.clear(); window.dispatchEvent(new Event('qc:session-rejected'));
      }
      throw error;
    } })().finally(() => { onlineVerification = undefined; });
    return onlineVerification;
  },

  setUser(user) {
    cacheOfflineUser(user);
    set({ user });
  },

  hasRole(...roles) {
    const role = get().user?.role;
    return !!role && roles.includes(role);
  },
}));

/** Stores the freshly issued tokens and loads the richer /auth/me profile. */
async function adoptSession(
  data: { accessToken: string; refreshToken: string; user?: AuthUser },
  set: (partial: Partial<AuthState>) => void,
) {
  // Signing in on a tab that already held a session must not inherit its cache.
  await queryClient.cancelQueries();
  clearActiveIdentity();
  resetQueryCache();
  await tokenStore.set(data.accessToken, data.refreshToken, data.user?.id);
  sessionStorage.removeItem('qc.localUnlocked');
  const me = await api.get('/auth/me');
  cacheOfflineUser(me.data as AuthUser);
  await db.meta.put({ key: `${me.data.id}:identity`, value: me.data });
  await recordServerVerification(me.data.id);
  set({ user: me.data, status: 'authenticated' });
  return me.data as AuthUser;
}

window.addEventListener('qc:session-rejected', () => {
  const account = useAuthStore.getState().user?.id;
  void lockDataSession(account).catch(() => undefined);
  reconnectCredentials = undefined;
  clearReconnectCredentials();
  clearActiveIdentity(); sessionStorage.removeItem('qc.localUnlocked');
  disconnectSocket(); resetQueryCache();
  useAuthStore.setState({ user: null, status: 'unauthenticated' });
});
window.addEventListener('qc:tokens-updated', ((event: CustomEvent<AuthUser>) => {
  const current = useAuthStore.getState().user;
  if (!current || event.detail?.id !== current.id) return;
  disconnectSocket(); cacheOfflineUser(event.detail);
  useAuthStore.setState({ user: event.detail });
}) as EventListener);
