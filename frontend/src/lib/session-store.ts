export interface AsyncCredentials { get(key: string): Promise<string | null>; set(key: string, value: string): Promise<void>; remove(key: string): Promise<unknown>; }
type Tokens = { accessToken: string; refreshToken: string; accountId?: string };
const SESSION_KEY = 'server-session-v2';
export function createSessionStore(storage: AsyncCredentials, legacy: Pick<Storage, 'getItem' | 'removeItem'>) {
  let tokens: Tokens | null = null; let loading: Promise<void> | undefined; let local = false;
  let generation = 0; let writes = Promise.resolve(); let closing = false;
  const enqueue = (run: () => Promise<void>) => { const operation = writes.then(run, run); writes = operation.catch(() => undefined); return operation; };
  const store = {
    ready(): Promise<void> {
      return loading ||= (async () => {
        const started = generation;
        const saved = await storage.get(SESSION_KEY);
        if (saved) { const parsed = JSON.parse(saved); if (started === generation && typeof parsed.accessToken === 'string' && typeof parsed.refreshToken === 'string') tokens = parsed; }
        else {
          const accessToken = legacy.getItem('qc.accessToken'), refreshToken = legacy.getItem('qc.refreshToken');
          let accountId: string | undefined;
          try { accountId = JSON.parse(legacy.getItem('qc.offlineUser') || 'null')?.id; } catch { /* Old identity may be absent. */ }
          if (accessToken && started === generation) { const migrated = { accessToken, refreshToken: refreshToken || '', accountId }; await storage.set(SESSION_KEY, JSON.stringify(migrated)); if (started === generation) tokens = migrated; }
        }
        legacy.removeItem('qc.accessToken'); legacy.removeItem('qc.refreshToken');
      })().catch(error => { tokens = null; loading = undefined; throw error; });
    },
    access: () => local ? null : tokens?.accessToken || null,
    refresh: () => tokens?.refreshToken || null,
    owner: () => tokens?.accountId || null,
    isLocal: () => local,
    isClosing: () => closing,
    setClosing: (value: boolean) => { closing = value; },
    setLocal: (value: boolean) => { local = value; },
    async set(accessToken: string, refreshToken: string, accountId?: string) {
      const current = ++generation;
      await store.ready();
      await enqueue(async () => {
        if (current !== generation) return;
        await storage.set(SESSION_KEY, JSON.stringify({ accessToken, refreshToken, accountId }));
        if (current === generation) { tokens = { accessToken, refreshToken, accountId }; local = false; }
      });
    },
    async clear() {
      ++generation;
      tokens = null; local = false;
      legacy.removeItem('qc.accessToken'); legacy.removeItem('qc.refreshToken');
      await loading?.catch(() => undefined);
      await enqueue(async () => { await storage.remove(SESSION_KEY); });
    },
  };
  return store;
}
