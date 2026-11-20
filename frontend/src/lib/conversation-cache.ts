import { db } from './db';
/** Complete lists are scoped by the server; remove obsolete clean memberships. */
export async function cacheConversations(account: string, rows: any[], complete = false) {
  await db.transaction('rw', db.table('chatConversations'), db.meta, async () => {
    for (const [index, row] of rows.entries()) {
      if (typeof row?.id !== 'string') continue;
      const previous = await db.table('chatConversations').get([account, row.id]);
      if (previous?.synced === 0) continue;
      await db.table('chatConversations').put({ ...previous, ...row, ...(complete ? { _listOrder: index } : {}), accountId: account, synced: 1, updatedAt: row.updatedAt || new Date().toISOString() });
    }
    if (complete) {
      const ids = new Set(rows.map(row => row.id));
      await db.table('chatConversations').where('accountId').equals(account).filter(row => row.synced === 1 && !ids.has(row.id)).delete();
      await db.meta.put({ key: `${account}:conversationListKnown`, value: true });
    }
  });
}
