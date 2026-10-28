/** Coalesce background reads and avoid invalidation/refetch feedback loops. */
export function createReadRefresh(now = Date.now, cooldownMs = 2000) {
  const attempts = new Map<string, { at: number; running: boolean }>();
  return (key: string, refresh: () => Promise<void>) => {
    const previous = attempts.get(key);
    if (previous && (previous.running || now() - previous.at < cooldownMs)) return;
    const attempt = { at: now(), running: true };
    attempts.set(key, attempt);
    // Bound metadata in long-running desktop sessions. Never evict active work.
    if (attempts.size > 500) for (const [oldKey, value] of attempts) {
      if (!value.running && now() - value.at >= cooldownMs) attempts.delete(oldKey);
    }
    void Promise.resolve().then(refresh).catch(() => undefined).finally(() => {
      attempt.running = false; attempt.at = now();
    });
  };
}
