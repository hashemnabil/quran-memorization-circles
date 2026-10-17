import { dehydrate, hydrate, type DehydratedState } from '@tanstack/react-query';
import { queryClient } from '../queryClient';
import { db as localDb } from '../db';

const DB_NAME = 'quran-circles-query-cache';
const STORE = 'snapshots';

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
  const local = await localDb.meta.get(`${accountId}:querySnapshot`);
  if (local?.value?.accountId === accountId) { hydrate(queryClient, local.value.state); return true; }
  const db = await openDb();
  try {
    const snapshot = await new Promise<Snapshot | undefined>((resolve, reject) => {
      const request = db.transaction(STORE, 'readonly').objectStore(STORE).get(accountId);
      request.onsuccess = () => resolve(request.result as Snapshot | undefined);
      request.onerror = () => reject(request.error ?? new Error('Could not read query cache'));
    });
    if (!snapshot || snapshot.accountId !== accountId) return false;
    // Migrate only after the encrypted replacement is durable. Cache age never
    // disables offline access; live authorization remains the server's job.
    await localDb.meta.put({ key: `${accountId}:querySnapshot`, value: snapshot });
    await clearLegacySnapshot(accountId);
    hydrate(queryClient, snapshot.state);
    return true;
  } finally { db.close(); }
}

export async function persistQueryCache(accountId: string): Promise<void> {
  if (!accountId) return;
  const state = dehydrate(queryClient, { shouldDehydrateQuery: (query) => query.state.status === 'success' && query.state.data !== undefined });
  const snapshot: Snapshot = { accountId, savedAt: Date.now(), state };
  await localDb.meta.put({ key: `${accountId}:querySnapshot`, value: snapshot });
  await clearLegacySnapshot(accountId);
}

export async function clearPersistedQueryCache(accountId: string): Promise<void> {
  if (accountId) await localDb.meta.delete(`${accountId}:querySnapshot`);
  await clearLegacySnapshot(accountId);
}
async function clearLegacySnapshot(accountId: string): Promise<void> {
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

export async function migrateLegacyQueryCache(accountId: string) {
  const database = await openDb();
  try {
    const snapshot = await new Promise<Snapshot | undefined>((resolve, reject) => {
      const read = database.transaction(STORE).objectStore(STORE).get(accountId);
      read.onsuccess = () => resolve(read.result); read.onerror = () => reject(read.error);
    });
    if (snapshot?.accountId === accountId) {
      if (!(await localDb.meta.get(`${accountId}:querySnapshot`))) await localDb.meta.put({ key: `${accountId}:querySnapshot`, value: snapshot });
      await clearLegacySnapshot(accountId);
    }
  } finally { database.close(); }
}
