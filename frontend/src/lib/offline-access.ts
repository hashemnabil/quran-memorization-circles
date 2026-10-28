import { db } from './db';
import { withinOfflineWindow } from './offline-access-policy';
export async function recordServerVerification(account: string) {
  await db.meta.put({ key: `${account}:serverVerifiedAt`, value: Date.now() });
}
export async function offlineAccessAllowed(account: string) {
  let at = (await db.meta.get(`${account}:serverVerifiedAt`))?.value;
  if (at === undefined) {
    // One-time upgrade grace for previously encrypted, authenticated installations.
    const key = `${account}:offlinePolicyGrace`;
    at = (await db.meta.get(key))?.value;
    if (at === undefined) { at = Date.now(); await db.meta.put({ key, value: at }); }
  }
  return withinOfflineWindow(at);
}
