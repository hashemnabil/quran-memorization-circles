import { dehydrate, hydrate, type DehydratedState } from '@tanstack/react-query';
import { queryClient } from '@/lib/queryClient';

const DB_NAME = 'quran-circles-query-cache';
const STORE = 'snapshots';
const MAX_AGE = 7 * 24 * 60 * 60 * 1000;

type Snapshot = { accountId: string; savedAt: number; state: DehydratedState };

function openDb(): Promise<IDBDatabase> {
  if (typeof indexedDB === 'undefined') return Promise.reject(new Error('IndexedDB unavailable'));
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE)) {
        request.result.createObjectStore(STORE, { keyPath: 'accountId' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Could not open query cache'));
  });
}

export async function restoreQueryCache(accountId: string): Promise<boolean> {
  if (!accountId) return false;
  const db = await openDb();
  try {
    const snapshot = await new Promise<Snapshot | undefined>((resolve, reject) => {
      const request = db.transaction(STORE, 'readonly').objectStore(STORE).get(accountId);
      request.onsuccess = () => resolve(request.result as Snapshot | undefined);
      request.onerror = () => reject(request.error ?? new Error('Could not read query cache'));
    });
    if (!snapshot || snapshot.accountId !== accountId) return false;
    if (Date.now() - snapshot.savedAt > MAX_AGE) { await clearPersistedQueryCache(accountId); return false; }
    hydrate(queryClient, snapshot.state);
    return true;
  } finally { db.close(); }
}

export async function persistQueryCache(accountId: string): Promise<void> {
  if (!accountId) return;
  const state = dehydrate(queryClient, { shouldDehydrateQuery: (query) => query.state.status === 'success' && query.state.data !== undefined });
  const snapshot: Snapshot = { accountId, savedAt: Date.now(), state };
  const db = await openDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(snapshot);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error('Could not save query cache'));
      tx.onabort = () => reject(tx.error ?? new Error('Query cache save aborted'));
    });
  } finally { db.close(); }
}

export async function clearPersistedQueryCache(accountId: string): Promise<void> {
  if (!accountId || typeof indexedDB === 'undefined') return;
  const db = await openDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).delete(accountId);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error('Could not clear query cache'));
    });
  } finally { db.close(); }
}
