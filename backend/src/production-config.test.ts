import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateEnvironment } from './production-config';
const production = {
  NODE_ENV: 'production', DATABASE_URL: 'postgresql://user@db.internal/quran', DIRECT_URL: 'postgresql://user@db.internal/quran',
  JWT_ACCESS_SECRET: 'a'.repeat(64), CORS_ORIGINS: 'https://school.example,capacitor://localhost,http://localhost', PUBLIC_URL: 'https://api.school.example',
};
test('production accepts explicit HTTPS origins and native localhost origins', () => {
  assert.deepEqual(validateEnvironment(production), production);
});
test('development stays backwards compatible', () => { assert.deepEqual(validateEnvironment({}), {}); });
test('production rejects missing secrets, weak secrets, wildcard CORS and insecure browser origins', () => {
  for (const changes of [
    { JWT_ACCESS_SECRET: undefined }, { JWT_ACCESS_SECRET: 'change-me-access-secret' }, { DATABASE_URL: 'https://db.example/quran' },
    { DIRECT_URL: '' }, { PUBLIC_URL: 'http://api.school.example' }, { CORS_ORIGINS: '*' },
    { CORS_ORIGINS: 'http://school.example' }, { CORS_ORIGINS: 'https://school.example/path' },
  ]) assert.throws(() => validateEnvironment({ ...production, ...changes }));
});
