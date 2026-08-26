import { tokenStore } from '@/lib/api';

/**
 * "Log the user out one minute after the browser is closed."
 *
 * There is no browser event for "closed" that can be trusted — `beforeunload`
 * fires on a refresh and on following a link, and does not fire at all when the
 * tab is killed or the machine sleeps. So instead of trying to catch the close,
 * an open tab writes a heartbeat every few seconds; on the next start-up, the
 * gap since the last beat says how long the app was not running.
 *
 * A gap longer than the grace period means the browser really was closed, and
 * the stored session is discarded before it is ever used. A refresh, or opening
 * a link in a new tab, produces a gap of milliseconds and is unaffected.
 */
const HEARTBEAT_KEY = 'qc.lastSeen';
const HEARTBEAT_INTERVAL_MS = 5_000;
const GRACE_MS = 60_000;

function writeHeartbeat() {
  try {
    localStorage.setItem(HEARTBEAT_KEY, String(Date.now()));
  } catch {
    // Private mode or a full quota: the session simply stops expiring early.
  }
}

export function clearHeartbeat() {
  try {
    localStorage.removeItem(HEARTBEAT_KEY);
  } catch {
    /* ignore */
  }
}

/**
 * Called once before the session is restored. Returns true when the stored
 * tokens were dropped because the browser had been closed for too long.
 */
export function expireStaleSession(): boolean {
  let lastSeen: number | null = null;
  try {
    const raw = localStorage.getItem(HEARTBEAT_KEY);
    lastSeen = raw ? Number(raw) : null;
  } catch {
    return false;
  }

  // No heartbeat at all: either a first visit or a session from before this
  // feature existed. Nothing to judge, so the session is left alone.
  if (!lastSeen || Number.isNaN(lastSeen)) {
    writeHeartbeat();
    return false;
  }

  if (Date.now() - lastSeen > GRACE_MS) {
    tokenStore.clear();
    clearHeartbeat();
    return true;
  }

  writeHeartbeat();
  return false;
}

/** Keeps the heartbeat fresh while any tab is open. Returns a cleanup function. */
export function startHeartbeat(): () => void {
  writeHeartbeat();
  const timer = window.setInterval(writeHeartbeat, HEARTBEAT_INTERVAL_MS);

  // Coming back to a backgrounded tab should refresh the beat immediately
  // rather than waiting for the next tick.
  const onVisible = () => {
    if (document.visibilityState === 'visible') writeHeartbeat();
  };
  document.addEventListener('visibilitychange', onVisible);

  return () => {
    window.clearInterval(timer);
    document.removeEventListener('visibilitychange', onVisible);
  };
}
