import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';
const target = new URL(process.env.DATABASE_URL || '');
assert(['localhost', '127.0.0.1'].includes(target.hostname) && target.pathname === '/quran_test', 'Runtime rehearsal requires the disposable local quran_test database');
const env = { ...process.env, NODE_ENV: 'production', PORT: '4197', JWT_ACCESS_SECRET: 'runtime-rehearsal-only-not-a-production-secret-123456789', RENDER_EXTERNAL_URL: 'https://runtime-test.onrender.com', CORS_ORIGINS: 'https://frontend.example' };
delete env.DIRECT_URL;
delete env.PUBLIC_URL;
const child = spawn(process.execPath, ['scripts/start-production.mjs'], { env, stdio: ['ignore', 'pipe', 'pipe'] });
let output = '';
for (const stream of [child.stdout, child.stderr]) stream.on('data', data => { output = (output + data.toString()).slice(-5000); });
try {
  let healthy = false;
  const deadline = Date.now() + 20000;
  while (Date.now() < deadline && child.exitCode === null) {
    try {
      const response = await fetch('http://127.0.0.1:4197/api/health', { signal: AbortSignal.timeout(1000) });
      if (response.ok && (await response.json()).status === 'ok') { healthy = true; break; }
    } catch { /* startup is asynchronous */ }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  assert(healthy, `Production runtime did not become healthy without DIRECT_URL: ${output}`);
  assert.equal((await fetch('http://127.0.0.1:4197/api/docs')).status, 404);
  console.log('Production runtime without DIRECT_URL/PUBLIC_URL: HTTP health and database query succeeded; docs remain disabled.');
} finally {
  child.kill('SIGTERM');
  await new Promise(resolve => {
    if (child.exitCode !== null) return resolve();
    const timer = setTimeout(() => { child.kill('SIGKILL'); resolve(); }, 5000);
    child.once('exit', () => { clearTimeout(timer); resolve(); });
  });
}
