import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto';

// Temporary passwords are reversible only for the administration workflow, and
// are encrypted at rest with a key derived from the deployment's JWT secret.
function encryptionKey(): Buffer {
  const secret = process.env.JWT_ACCESS_SECRET || (process.env.NODE_ENV === 'test' ? 'test-only-temporary-password-key' : '');
  if (!secret) throw new Error('JWT_ACCESS_SECRET is required to encrypt temporary student passwords');
  return createHash('sha256').update(secret).digest();
}

export function encryptTemporaryPassword(password: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(password, 'utf8'), cipher.final()]);
  return [iv.toString('base64url'), cipher.getAuthTag().toString('base64url'), ciphertext.toString('base64url')].join('.');
}

export function decryptTemporaryPassword(value: string): string {
  const [ivText, tagText, ciphertextText] = value.split('.');
  if (!ivText || !tagText || !ciphertextText) throw new Error('Invalid encrypted temporary password');
  const decipher = createDecipheriv('aes-256-gcm', encryptionKey(), Buffer.from(ivText, 'base64url'));
  decipher.setAuthTag(Buffer.from(tagText, 'base64url'));
  return Buffer.concat([decipher.update(Buffer.from(ciphertextText, 'base64url')), decipher.final()]).toString('utf8');
}
