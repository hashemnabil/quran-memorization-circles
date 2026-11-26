/** Last seen comes from visible app interaction, never from message timestamps. */
export function publicActivity(activity: {hidden: boolean; lastActiveAt: Date | null} | null | undefined, connected: boolean, now = Date.now()) {
  if (!activity || activity.hidden) return {isOnline: false, lastActiveAt: null};
  const at = activity.lastActiveAt?.getTime();
  return {
    isOnline: connected && at !== undefined && Number.isFinite(at) && now - at < 90_000 && now >= at,
    lastActiveAt: activity.lastActiveAt,
  };
}
