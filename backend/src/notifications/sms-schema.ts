import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PrismaClient } from '@prisma/client';

/** Explicit opt-in repair for deployments which intentionally bypass Migrate. */
export async function recoverSmsSchema(prisma: PrismaClient, enabled: boolean) {
  if (!enabled) return false;
  const source = readFileSync(join(__dirname, '../../prisma/recovery/add-sms-tables.sql'), 'utf8');
  const statement = source.match(/DO \$sms_recovery\$[\s\S]*?\$sms_recovery\$;/)?.[0];
  if (!statement) throw new Error('SMS recovery SQL is missing');
  await prisma.$transaction(async tx => {
    await tx.$executeRawUnsafe("SET LOCAL lock_timeout = '10s'");
    await tx.$executeRawUnsafe("SET LOCAL statement_timeout = '60s'");
    await tx.$executeRawUnsafe(statement);
  }, { timeout: 65000, maxWait: 10000 });
  return true;
}
