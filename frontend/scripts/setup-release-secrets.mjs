// Local release setup only. Signing material is never added to Git or printed.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const folder = path.join(root, '.release-signing');
const sodium = createRequire(import.meta.url)(path.join(folder, 'tools/node_modules/libsodium-wrappers'));
await sodium.ready;
const repo = 'hashemnabil/quran-memorization-circles';
let token = process.env.GH_TOKEN || process.env.GITHUB_TOKEN;
if (!token) {
  const credential = execFileSync('git', ['credential', 'fill'], {
    input: 'protocol=https\nhost=github.com\n\n', encoding: 'utf8',
    env: { ...process.env, GCM_INTERACTIVE: 'Never', GIT_TERMINAL_PROMPT: '0' }, stdio: ['pipe', 'pipe', 'pipe'],
  });
  token = credential.split(/\r?\n/).find(line => line.startsWith('password='))?.slice(9);
}
if (!token) throw new Error('GitHub authentication unavailable; no secrets uploaded.');
async function request(route, method = 'GET', body) {
  const response = await fetch(`https://api.github.com${route}`, { method,
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(30000) });
  if (!response.ok) throw new Error(`GitHub ${method} ${route}: HTTP ${response.status}`);
  return response.status === 204 || response.status === 201 ? null : response.json();
}
const publicKey = await request(`/repos/${repo}/actions/secrets/public-key`);
const config = JSON.parse(fs.readFileSync(path.join(folder, 'credentials.json'), 'utf8'));
const values = {
  ANDROID_KEYSTORE_BASE64: fs.readFileSync(path.join(folder, config.keystore)).toString('base64'),
  ANDROID_KEYSTORE_PASSWORD: config.storePassword,
  ANDROID_KEY_ALIAS: config.alias,
  ANDROID_KEY_PASSWORD: config.keyPassword,
};
for (const [name, value] of Object.entries(values)) {
  const encrypted = sodium.crypto_box_seal(sodium.from_string(value), sodium.from_base64(publicKey.key, sodium.base64_variants.ORIGINAL));
  await request(`/repos/${repo}/actions/secrets/${name}`, 'PUT', { encrypted_value: sodium.to_base64(encrypted, sodium.base64_variants.ORIGINAL), key_id: publicKey.key_id });
  console.log(`Configured encrypted repository secret: ${name}`);
}
if (process.argv.includes('--dispatch')) {
  await request(`/repos/${repo}/actions/workflows/mobile-build.yml/dispatches`, 'POST', { ref: 'feature/offline-support', inputs: { release: true, version_name: '1.0.0', version_code: '2' } });
  console.log('Signed production build requested; no release was published.');
}
