import { readFile } from 'node:fs/promises';
import { createDecipheriv } from 'node:crypto';
import { pathToFileURL } from 'node:url';

export async function verifyStudentTransferBackup(path, keyHex) {
  if (!/^[a-f0-9]{64}$/i.test(keyHex || '')) throw new Error('A 32-byte backup key is required');
  const envelope = JSON.parse(await readFile(path, 'utf8'));
  if (envelope.version !== 1 || !/^[a-f0-9]{24}$/i.test(envelope.iv || '') || !/^[a-f0-9]{32}$/i.test(envelope.tag || '')) throw new Error('Invalid backup envelope');
  const decipher = createDecipheriv('aes-256-gcm', Buffer.from(keyHex, 'hex'), Buffer.from(envelope.iv, 'hex'));
  decipher.setAuthTag(Buffer.from(envelope.tag, 'hex'));
  const plaintext = Buffer.concat([decipher.update(Buffer.from(envelope.ciphertext, 'base64')), decipher.final()]);
  const snapshot = JSON.parse(plaintext.toString('utf8'));
  const tables = ['parents', 'notifications', 'members', 'permissions', 'announcements', 'refreshTokens', 'tickets'];
  if (snapshot.version !== 1 || tables.some(table => !Array.isArray(snapshot[table]))) throw new Error('Incomplete transfer backup');
  return { verified: true, createdAt: snapshot.createdAt, counts: Object.fromEntries(tables.map(table => [table, snapshot[table].length])) };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const position = process.argv.indexOf('--backup');
  if (position < 0 || !process.argv[position + 1]) throw new Error('Usage: node scripts/verify-student-transfer-backup.mjs --backup <file>');
  console.log(JSON.stringify(await verifyStudentTransferBackup(process.argv[position + 1], process.env.STUDENT_TRANSFER_BACKUP_KEY)));
}
