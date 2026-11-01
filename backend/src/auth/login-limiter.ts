import { createHash } from 'node:crypto';
import type { Request, Response, NextFunction } from 'express';
/** Failure-only, bounded per-process limiter. Multi-replica deployments need a shared gateway limiter too. */
export function loginLimiter(now = () => Date.now()) {
  const entries = new Map<string, { failures: number; inflight: number; expires: number }>();
  return (req: Request, res: Response, next: NextFunction) => {
    if (!['POST', 'PATCH'].includes(req.method) || !/\/(auth\/login|auth\/change-password|registry\/access|support\/account-deletion|founder\/accounts(?:\/me)?)\/?$/.test(req.path)) return next();
    for (const [key, row] of entries) if (row.expires <= now() && row.inflight === 0) entries.delete(key);
    const identity = /\/founder\/accounts(?:\/me)?\/?$/.test(req.path) ? 'founder-account-management' : String(req.body?.username || req.body?.nationalId || '').trim().toLowerCase();
    const keys = [`ip:${req.ip}`, `identity:${req.ip}:${identity}`].map(value => createHash('sha256').update(value).digest('hex'));
    const rows = keys.map(key => entries.get(key) || { failures: 0, inflight: 0, expires: now() + 15 * 60 * 1000 });
    if (entries.size >= 10000 || rows.some((row, i) => row.failures + row.inflight >= (i === 0 ? 100 : 8))) {
      res.setHeader('Retry-After', '900'); return res.status(429).json({ statusCode: 429, message: 'محاولات كثيرة؛ حاول لاحقًا' });
    }
    rows.forEach((row, i) => { row.inflight++; entries.set(keys[i], row); });
    let finished = false;
    const finish = () => { if (finished) return; finished = true; for (const row of rows) { row.inflight--; if ([400, 401, 403, 404].includes(res.statusCode)) row.failures++; } };
    res.once('finish', finish); res.once('close', finish);
    next();
  };
}
