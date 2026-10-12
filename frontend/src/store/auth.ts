import { create } from 'zustand';
import axios from 'axios';
import { api, tokenStore } from '@/lib/api';
import { clearHeartbeat, expireStaleSession } from '@/lib/session';
import { resetQueryCache } from '@/lib/queryClient';
import { clearPersistedQueryCache } from '@/lib/offline/queryCache';
import type { AuthUser, Role } from '@/types';

const OFFLINE_USER_KEY = 'qc.offlineUser';
const allowedRoles: Role[] = ['ADMIN', 'SUPERVISOR', 'TEACHER', 'EXAM_COMMITTEE', 'PARENT', 'STUDENT', 'SUPPORT'];

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
  loadSession: () => Promise<void>;
  setUser: (user: AuthUser) => void;
  hasRole: (...roles: Role[]) => boolean;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  status: 'idle',

  async login(username, password) {
    const { data } = await api.post('/auth/login', { username, password });
    return adoptSession(data, set);
  },

  async logout() {
    const accountId = get().user?.id ?? '';
    try {
      await api.post('/auth/logout', { refreshToken: tokenStore.refresh() });
    } catch {
      // Logging out locally matters more than the server acknowledging it.
    }
    tokenStore.clear();
    clearHeartbeat();
    try { localStorage.removeItem(OFFLINE_USER_KEY); } catch { /* ignore unavailable storage */ }
    // Nothing the previous account loaded may survive into the next session.
    resetQueryCache();
    set({ user: null, status: 'unauthenticated' });
    // Explicit logout removes cached private reads for this account from this device.
    await clearPersistedQueryCache(accountId).catch(() => undefined);
  },

  async loadSession() {
    // A session left behind by a closed browser is discarded before it is used.
    expireStaleSession();
    if (!tokenStore.access()) {
      set({ status: 'unauthenticated', user: null });
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
        // Allow cached reads to render while offline. Protected writes still go
        // through the API and must pass normal server-side authentication.
        set({ user: offlineUser, status: 'authenticated' });
        return;
      }
      tokenStore.clear();
      try { localStorage.removeItem(OFFLINE_USER_KEY); } catch { /* ignore */ }
      set({ user: null, status: 'unauthenticated' });
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
  data: { accessToken: string; refreshToken: string },
  set: (partial: Partial<AuthState>) => void,
) {
  // Signing in on a tab that already held a session must not inherit its
  // cache: an admin's announcement list, for one, has none of the notices
  // addressed to the parent who just signed in.
  resetQueryCache();
  tokenStore.set(data.accessToken, data.refreshToken);
  // /auth/me returns the richer profile (teacher / parent links, counts).
  const me = await api.get('/auth/me');
  cacheOfflineUser(me.data as AuthUser);
  set({ user: me.data, status: 'authenticated' });
  return me.data as AuthUser;
}
