import { useEffect, useState } from 'react';
import { liveQuery } from 'dexie';
import { get } from '@/lib/offline-engine';
import type { EntityTable, LocalRow } from '@/lib/db';
import { useAuthStore } from '@/store/auth';
export function useLiveData(table: EntityTable) {
  const [data, setData] = useState<LocalRow[]>([]);
  const account = useAuthStore((state) => state.user?.id);
  useEffect(() => {
    setData([]);
    if (!account) return;
    const subscription = liveQuery(() => get(table)).subscribe({ next: setData, error: console.error });
    return () => subscription.unsubscribe();
  }, [table, account]);
  return data;
}
