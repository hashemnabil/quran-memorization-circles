import { create } from 'zustand';
import axios from 'axios';
import { api, tokenStore } from '@/lib/api';
import { clearHeartbeat, expireStaleSession } from '@/lib/session';
import { resetQueryCache, queryClient } from '@/lib/queryClient';
import { clearPersistedQueryCache } from '@/lib/offline/queryCache';
import { clearOfflineOperations } from '@/lib/offline/outbox';
import { clearOfflineReplica } from '@/lib/offline/changeFeed';
import type { AuthUser, Role } from '@/types';
import { rememberOfflineLogin, unlockOfflineLogin, forgetOfflineLogin, forgetAccountOfflineLogin } from '@/lib/offline-login';
import { assertNoPendingWrites, clearAccountData } from '@/lib/account-cleanup';
import { disconnectSocket } from '@/lib/socket';
import { credentialStorage } from '@/lib/credential-storage';

const OFFLINE_USER_KEY = 'qc.offlineUser';
const allowedRoles: Role[] = ['ADMIN', 'SUPERVISOR', 'TEACHER', 'EXAM_COMMITTEE', 'STUDENT', 'SUPPORT'];

function cacheOfflineUser(user: AuthUser) {
  // Store only the minimum identity needed to render the signed-in shell offline.
  // Private profile/contact fields remain in the account-scoped query cache.
  try {
    localStorage.setItem(OFFLINE_USER_KEY, JSON.stringify({
      id: user.id, username: user.username, fullName: user.fullName,
      role: user.role, isActive: user.isActive,
      mustChangePassword: user.mustChangePassword ?? false,
    }));
  } catch { /* Offline identity is best-effort when storage is unavailable. */ }
}

function readOfflineUser(): AuthUser | null {
  try {
    const raw = localStorage.getItem(OFFLINE_USER_KEY);
    if (!raw) return null;
    const user = JSON.parse(raw) as Partial<AuthUser>;
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
        resetQueryCache();
        await tokenStore.ready();
        if (tokenStore.owner() && tokenStore.owner() !== session.user.id) await tokenStore.clear();
        tokenStore.setLocal(true);
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
      if (axios.isAxiosError(error) && [401, 403].includes(error.response?.status || 0)) forgetOfflineLogin(username);
      throw error;
    }
    const user = await adoptSession(data, set);
    await rememberOfflineLogin(username, password, user, data).catch(() => undefined);
    return user;
  },

  async logout() {
    const accountId = get().user?.id ?? '';
    const previous = get().user;
    tokenStore.setClosing(true);
    set({ status: 'loading' });
    try {
    await queryClient.cancelQueries();
    await assertNoPendingWrites(accountId);
    // Invalidate account-scoped background writers before clearing their stores.
    localStorage.removeItem(OFFLINE_USER_KEY);
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
    clearHeartbeat();
    try { localStorage.removeItem(OFFLINE_USER_KEY); } catch { /* ignore unavailable storage */ }
    // Nothing the previous account loaded may survive into the next session.
    resetQueryCache();
    set({ user: null, status: 'unauthenticated' });
    // Explicit logout removes cached private reads for this account from this device.
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
    expireStaleSession();
    const accessToken = tokenStore.access();
    if (!accessToken) {
      const local = readOfflineUser();
      if (!navigator.onLine && local && sessionStorage.getItem('qc.localUnlocked') === local.id) {
        tokenStore.setLocal(true); set({ user: local, status: 'authenticated' }); return;
      }
      set({ status: 'unauthenticated', user: null });
      return;
    }

    // On a cold launch in airplane mode, restore the previously authenticated
    // identity immediately. Do not wait for an impossible /auth/me request.
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      const offlineUser = readOfflineUser();
      set(offlineUser
        ? { user: offlineUser, status: 'authenticated' }
        : { user: null, status: 'unauthenticated' });
      return;
    }

    set({ status: 'loading' });
    try {
      const { data } = await api.get('/auth/me');
      cacheOfflineUser(data as AuthUser);
      set({ user: data, status: 'authenticated' });
    } catch (error) {
      const isAxios = axios.isAxiosError(error);
      const status = isAxios ? error.response?.status : undefined;
      const isTemporaryFailure = !isAxios || !error.response || status === 408 || status === 429 || (status !== undefined && status >= 500);
      const offlineUser = isTemporaryFailure ? readOfflineUser() : null;
      if (offlineUser) {
        // Cached reads may render offline; writes still require server authorization.
        set({ user: offlineUser, status: 'authenticated' });
        return;
      }
      // Preserve tokens after temporary network failures; only an explicit
      // authentication rejection should force a fresh sign-in.
      if (status === 401 || status === 403) {
        const previous = readOfflineUser(); if (previous) forgetAccountOfflineLogin(previous.id, previous.username);
        await tokenStore.clear(); localStorage.removeItem(OFFLINE_USER_KEY);
      }
      set({ user: null, status: 'unauthenticated' });
    }
  },

  lock() {
    disconnectSocket(); resetQueryCache(); sessionStorage.removeItem('qc.localUnlocked');
    tokenStore.setLocal(true); localStorage.removeItem(OFFLINE_USER_KEY);
    set({ user: null, status: 'unauthenticated' });
  },
  async resumeOnline() {
    if (!navigator.onLine || !get().user) return;
    const account = get().user!.id;
    try {
    if (tokenStore.isLocal()) {
      const refreshToken = tokenStore.refresh();
      if (!refreshToken) throw new Error('سجّل الدخول مع الإنترنت لتفعيل المزامنة؛ بياناتك المحلية محفوظة');
      const { data } = await api.post('/auth/refresh', { refreshToken });
      if (get().user?.id !== account || data.user?.id !== account) throw new Error('تغيّر الحساب أثناء التحقق من الجلسة');
      await tokenStore.set(data.accessToken, data.refreshToken, data.user.id);
    }
    const { data } = await api.get('/auth/me');
    if (get().user?.id === account) { cacheOfflineUser(data); set({ user: data }); }
    } catch (error) {
      if (axios.isAxiosError(error) && [400, 401, 403].includes(error.response?.status || 0)) {
        await tokenStore.clear(); window.dispatchEvent(new Event('qc:session-rejected'));
      }
      throw error;
    }
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
  localStorage.removeItem(OFFLINE_USER_KEY);
  resetQueryCache();
  await tokenStore.set(data.accessToken, data.refreshToken, data.user?.id);
  sessionStorage.removeItem('qc.localUnlocked');
  const me = await api.get('/auth/me');
  cacheOfflineUser(me.data as AuthUser);
  set({ user: me.data, status: 'authenticated' });
  return me.data as AuthUser;
}

window.addEventListener('qc:session-rejected', () => {
  const user = useAuthStore.getState().user;
  if (user) forgetAccountOfflineLogin(user.id, user.username);
  localStorage.removeItem(OFFLINE_USER_KEY); sessionStorage.removeItem('qc.localUnlocked');
  disconnectSocket(); resetQueryCache();
  useAuthStore.setState({ user: null, status: 'unauthenticated' });
});
window.addEventListener('qc:tokens-updated', ((event: CustomEvent<AuthUser>) => {
  const current = useAuthStore.getState().user;
  if (!current || event.detail?.id !== current.id) return;
  disconnectSocket(); cacheOfflineUser(event.detail);
  useAuthStore.setState({ user: event.detail });
}) as EventListener);
