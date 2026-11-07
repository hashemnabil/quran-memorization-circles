/** Safe retry policy for idempotent reads only. Never retry mutations automatically. */
export function shouldRetryReadRequest({ method = 'get', status, hasResponse = status !== undefined, code, attempts = 0 } = {}) {
  if (String(method).toLowerCase() !== 'get' || attempts >= 2 || code === 'ERR_CANCELED') return false;
  return !hasResponse || status === 408 || status === 429 || (typeof status === 'number' && status >= 500);
}

export function readRetryDelayMs(attempts = 0) {
  return 500 * (2 ** Math.max(0, Math.min(1, attempts)));
}
