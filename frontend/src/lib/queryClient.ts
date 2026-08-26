import { QueryClient } from '@tanstack/react-query';

/**
 * The app's single query cache.
 *
 * It lives here rather than inside `main.tsx` so the auth store can empty it
 * when the account changes. Every cached answer belongs to whoever was signed
 * in when it was fetched — the announcements addressed to them, their students,
 * their conversations — so carrying it across a sign-in shows one user another
 * user's data until the entry goes stale.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: (failureCount, error: any) => {
        // Never retry auth / permission failures.
        const status = error?.response?.status;
        if (status === 401 || status === 403 || status === 404) return false;
        return failureCount < 2;
      },
      staleTime: 30_000,
      refetchOnWindowFocus: false,
    },
  },
});

/** Drops everything the previous account had loaded. */
export function resetQueryCache() {
  queryClient.clear();
}
