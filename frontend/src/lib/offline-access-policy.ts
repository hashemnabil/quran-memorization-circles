export const OFFLINE_ACCESS_DAYS = 30;
export function withinOfflineWindow(verifiedAt: number, now = Date.now()) {
  return Number.isFinite(verifiedAt) && verifiedAt > 0 && now >= verifiedAt && now - verifiedAt < OFFLINE_ACCESS_DAYS * 86400000;
}
