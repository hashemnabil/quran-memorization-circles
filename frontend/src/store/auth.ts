import { create } from 'zustand';
import { api, tokenStore } from '@/lib/api';
import { clearHeartbeat, expireStaleSession } from '@/lib/session';
import { resetQueryCache } from '@/lib/queryClient';
import type { AuthUser, Role } from '@/types';

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
    try {
      await api.post('/auth/logout', { refreshToken: tokenStore.refresh() });
    } catch {
      // Logging out locally matters more than the server acknowledging it.
    }
    tokenStore.clear();
    clearHeartbeat();
    // Nothing the previous account loaded may survive into the next session.
    resetQueryCache();
    set({ user: null, status: 'unauthenticated' });
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
      set({ user: data, status: 'authenticated' });
    } catch {
      tokenStore.clear();
      set({ user: null, status: 'unauthenticated' });
    }
  },

  setUser(user) {
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
  set({ user: me.data, status: 'authenticated' });
  return me.data as AuthUser;
}
