import { QueryCache, QueryClient } from '@tanstack/react-query';

let queryClient: QueryClient;

/**
 * Preserve an already-cached result when a request fails without a network
 * response. This lets screens continue rendering their last successful read
 * instead of replacing it with an error screen while the device is offline.
 * Mutations are not affected and must never be treated as successful offline.
 */
const queryCache = new QueryCache({
  onError: (error, query) => {
    const hasCachedData = query.state.data !== undefined;
    const noNetworkResponse = typeof navigator !== 'undefined' && (
      !navigator.onLine || !(error as { response?: unknown } | null)?.response
    );
    if (hasCachedData && noNetworkResponse) {
      const key = query.queryKey;
      const cachedData = query.state.data;
      queueMicrotask(() => {
        // Only restore if this query still exists and still has cached data.
        if (queryClient.getQueryData(key) !== undefined) {
          queryClient.setQueryData(key, cachedData);
        }
      });
    }
  },
});

queryClient = new QueryClient({
  queryCache,
  defaultOptions: {
    queries: {
      networkMode: 'always',
      retry: (failureCount, error: any) => {
        // Never retry auth / permission failures.
        const status = error?.response?.status;
        if (status === 401 || status === 403 || status === 404) return false;
        return failureCount < 2;
      },
      staleTime: 30_000,
      // Keep inactive query definitions available for background offline refresh.
      gcTime: 7 * 24 * 60 * 60 * 1000,
      refetchOnWindowFocus: false,
    },
    mutations: { networkMode: 'always' },
  },
});

/** Drops everything the previous account had loaded. */
export function resetQueryCache() {
  queryClient.clear();
}

export { queryClient };
