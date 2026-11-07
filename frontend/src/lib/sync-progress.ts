export type SyncProgress = { account: string; active: boolean; percent: number };
let state: SyncProgress = { account: '', active: false, percent: 0 };
export function getSyncProgress() { return state; }
function publish() { window.dispatchEvent(new Event('halaqat:sync-progress')); }
export function startSyncProgress(account: string) {
  state = { account, active: true, percent: 0 }; publish();
}
export function reportSyncProgress(account: string, percent: number) {
  if (state.account !== account || !state.active) return;
  const next = Math.max(state.percent, Math.min(99, Math.floor(percent)));
  if (next !== state.percent) { state = { ...state, percent: next }; publish(); }
}
export function finishSyncProgress(account: string, success: boolean) {
  if (state.account !== account) return;
  state = { ...state, active: false, percent: success ? 100 : state.percent }; publish();
}
