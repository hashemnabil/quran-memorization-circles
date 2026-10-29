import { api } from '@/lib/api';
import type { AuthUser } from '@/types';
import { useAuthStore } from '@/store/auth';
import { queryClient } from '@/lib/queryClient';
import { clearPersistedQueryCache } from './queryCache';
import { clearReplica, readReplica, pullReplica } from './feed-replica';
export type OfflineResource = 'student' | 'circle';
export const listOfflineSnapshot = readReplica;
export const clearOfflineReplica = clearReplica;
export async function pullOfflineChanges(accountId: string, maxPages = 25) {
  if (!navigator.onLine) return { pages: 0, rows: 0, complete: false };
  return pullReplica(accountId, async (path, params) => (await api.get(path, { params })).data,
    () => useAuthStore.getState().user?.id || '', async () => {
      const { data: user } = await api.get<AuthUser>('/auth/me');
      if (useAuthStore.getState().user?.id !== accountId || user.id !== accountId) return;
      useAuthStore.getState().setUser(user);
      await queryClient.cancelQueries();
      if (useAuthStore.getState().user?.id !== accountId) return;
      void queryClient.resetQueries().catch(() => undefined);
      await clearPersistedQueryCache(accountId);
    }, maxPages);
}
