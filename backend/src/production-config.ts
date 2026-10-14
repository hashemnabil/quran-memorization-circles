/** Fail startup on unsafe production configuration without logging secret values. */
export function validateEnvironment(env: Record<string, unknown>) {
  if (env.NODE_ENV !== 'production') return env;
  for (const key of ['DATABASE_URL', 'DIRECT_URL', 'JWT_ACCESS_SECRET', 'CORS_ORIGINS', 'PUBLIC_URL']) {
    if (typeof env[key] !== 'string' || !(env[key] as string).trim()) throw new Error(`Production requires ${key}`);
  }
  const secret = env.JWT_ACCESS_SECRET as string;
  if (secret.length < 32 || /change-me|example|default|password/i.test(secret)) throw new Error('JWT_ACCESS_SECRET must be a strong unique production secret');
  for (const key of ['DATABASE_URL', 'DIRECT_URL']) {
    const url = new URL(env[key] as string);
    if (!['postgres:', 'postgresql:'].includes(url.protocol) || !url.hostname || !url.pathname.slice(1)) throw new Error(`${key} must be a PostgreSQL URL`);
  }
  const publicUrl = new URL(env.PUBLIC_URL as string);
  if (publicUrl.protocol !== 'https:') throw new Error('PUBLIC_URL must use HTTPS in production');
  const origins = (env.CORS_ORIGINS as string).split(',').map((origin) => origin.trim());
  for (const origin of origins) {
    if (!origin || origin === '*') throw new Error('CORS_ORIGINS requires explicit origins');
    const url = new URL(origin);
    const native = ['capacitor://localhost', 'ionic://localhost', 'http://localhost', 'https://localhost'].includes(origin);
    if (!native && (url.protocol !== 'https:' || url.origin !== origin)) throw new Error('Production browser CORS origins must be exact HTTPS origins');
  }
  return env;
}
