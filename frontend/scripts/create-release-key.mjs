import { generateKeyPairSync, randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const folder = path.join(root, '.release-signing');
const keystore = path.join(folder, 'halaqat-release.p12');
const credentials = path.join(folder, 'credentials.json');
if (existsSync(keystore) || existsSync(credentials)) throw new Error('Signing identity already exists. Refusing to replace it.');
const openssl = process.env.OPENSSL_PATH || 'openssl';
execFileSync(openssl, ['version'], { stdio: 'ignore' });
mkdirSync(folder, { recursive: true, mode: 0o700 });
const password = randomBytes(32).toString('base64url');
const alias = 'halaqat-release';
const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 3072 });
const pem = path.join(folder, 'temporary-encrypted-key.pem');
const certificate = path.join(folder, 'temporary-certificate.pem');
// OpenSSL receives an environment-variable reference, never a literal credential.
const secretEnvName = 'HALAQAT_KEY_PASSPHRASE';
const passphraseSource = `env:${secretEnvName}`;
const env = { ...process.env, [secretEnvName]: password };
try {
  writeFileSync(pem, privateKey.export({ type: 'pkcs8', format: 'pem', cipher: 'aes-256-cbc', passphrase: password }), { mode: 0o600, flag: 'wx' });
  execFileSync(openssl, ['req', '-new', '-x509', '-sha256', '-key', pem, '-passin', passphraseSource, '-out', certificate, '-days', '10000', '-subj', '/CN=Halaqat Release/O=Quran Circles'], { env, stdio: 'ignore' });
  execFileSync(openssl, ['pkcs12', '-export', '-inkey', pem, '-passin', passphraseSource, '-in', certificate, '-out', keystore, '-name', alias, '-passout', passphraseSource], { env, stdio: 'ignore' });
  writeFileSync(credentials, JSON.stringify({ keystore: 'halaqat-release.p12', alias, storePassword: password, keyPassword: password }, null, 2), { mode: 0o600, flag: 'wx' });
  console.log('Release identity created in .release-signing. Back up both files securely. No private values were printed.');
} finally {
  rmSync(pem, { force: true }); rmSync(certificate, { force: true });
}
