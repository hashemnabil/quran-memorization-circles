/**
 * Keep a lightweight heartbeat for lifecycle diagnostics, but do not treat a
 * closed browser tab as an explicit logout. Offline-first use must survive an
 * app restart; a network request is not available to validate a session while
 * offline. When online, the API remains authoritative and expired/revoked
 * tokens are handled by the normal authentication flow.
 *
 * Logout locks encrypted local data and removes the active session. Only the
 * separate explicit device-removal action erases the offline account copy.
 */
const HEARTBEAT_KEY = 'qc.lastSeen';
const HEARTBEAT_INTERVAL_MS = 5_000;

function writeHeartbeat() {
  try {
    localStorage.setItem(HEARTBEAT_KEY, String(Date.now()));
  } catch {
    // Diagnostics are optional if storage is unavailable.
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
 * Kept for compatibility with the session bootstrap. A browser/app restart is
 * not proof that the user intended to log out, especially when offline.
 * Explicit logout clears tokens but retains the encrypted offline account copy.
 */
export function expireStaleSession(): boolean {
  writeHeartbeat();
  return false;
}

/** Keeps the heartbeat fresh while any tab is open. Returns a cleanup function. */
export function startHeartbeat(): () => void {
  writeHeartbeat();
  const timer = window.setInterval(writeHeartbeat, HEARTBEAT_INTERVAL_MS);

  const onVisible = () => {
    if (document.visibilityState === 'visible') writeHeartbeat();
  };
  document.addEventListener('visibilitychange', onVisible);

  return () => {
    window.clearInterval(timer);
    document.removeEventListener('visibilitychange', onVisible);
  };
}
