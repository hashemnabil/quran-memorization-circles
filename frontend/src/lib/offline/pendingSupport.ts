// A small persistent store for support requests submitted from the login page
// when the device is offline. These are lightweight objects and will be
// retried when connectivity returns.

type PendingSupport = {
  id: string;
  contactName: string;
  contactPhone?: string | null;
  contactEmail?: string | null;
  subject: string;
  description: string;
  createdAt: number;
};

const DB_NAME = 'quran-circles-pending-support';
const DB_VERSION = 1;
const STORE = 'pendingSupport';

function openDb(): Promise<IDBDatabase> {
  if (typeof indexedDB === 'undefined') return Promise.reject(new Error('IndexedDB unavailable'));
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'id' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('Could not open pending support DB'));
  });
}

function makeId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export async function savePendingSupport(payload: Omit<PendingSupport, 'id' | 'createdAt'>): Promise<PendingSupport> {
  const item: PendingSupport = { ...payload, id: makeId(), createdAt: Date.now() };
  const db = await openDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).add(item);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error('Could not save pending support'));
    });
    return item;
  } finally { db.close(); }
}

export async function listPendingSupport(): Promise<PendingSupport[]> {
  const db = await openDb();
  try {
    return await new Promise((resolve, reject) => {
      const req = db.transaction(STORE, 'readonly').objectStore(STORE).getAll();
      req.onsuccess = () => resolve(req.result as PendingSupport[] || []);
      req.onerror = () => reject(req.error ?? new Error('Could not read pending support'));
    });
  } finally { db.close(); }
}

export async function removePendingSupport(id: string): Promise<void> {
  const db = await openDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error('Could not remove pending support'));
    });
  } finally { db.close(); }
}

import axios from 'axios';
import { api } from '@/lib/api';

export async function syncPendingSupport(): Promise<{ applied: number; retried: number }>
{
  const all = await listPendingSupport();
  let applied = 0;
  let retried = 0;
  for (const item of all) {
    try {
      await api.post('/support/public', {
        contactName: item.contactName,
        contactPhone: item.contactPhone || undefined,
        contactEmail: item.contactEmail || undefined,
        subject: item.subject,
        description: item.description,
      });
      await removePendingSupport(item.id);
      applied += 1;
    } catch (err) {
      // If network error, stop and retry later.
      if (!axios.isAxiosError(err) || !err.response) {
        retried += 1;
        break;
      }
      // For server errors, also stop and leave it for manual inspection.
      break;
    }
  }
  return { applied, retried };
}
