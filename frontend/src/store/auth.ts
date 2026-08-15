import { create } from 'zustand';
import { api, tokenStore } from '@/lib/api';
import type { AuthUser, Role } from '@/types';

interface AuthState {
  user: AuthUser | null;
  status: 'idle' | 'loading' | 'authenticated' | 'unauthenticated';
  login: (email: string, password: string) => Promise<AuthUser>;
  logout: () => Promise<void>;
  loadSession: () => Promise<void>;
  setUser: (user: AuthUser) => void;
  hasRole: (...roles: Role[]) => boolean;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  status: 'idle',

  async login(email, password) {
    const { data } = await api.post('/auth/login', { email, password });
    return adoptSession(data, set);
  },

  async logout() {
    try {
      await api.post('/auth/logout', { refreshToken: tokenStore.refresh() });
    } catch {
      // Logging out locally matters more than the server acknowledging it.
    }
    tokenStore.clear();
    set({ user: null, status: 'unauthenticated' });
  },

  async loadSession() {
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
  tokenStore.set(data.accessToken, data.refreshToken);
  // /auth/me returns the richer profile (teacher / parent links, counts).
  const me = await api.get('/auth/me');
  set({ user: me.data, status: 'authenticated' });
  return me.data as AuthUser;
}
