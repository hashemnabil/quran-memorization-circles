import 'dotenv/config';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const expected = {
  announcements: { isPopup: 'boolean', popup: 'jsonb' },
  founder_assets: { id: 'text', title: 'character varying', kind: 'character varying', mime: 'character varying', content: 'bytea', size: 'integer', isActive: 'boolean', createdById: 'text', createdAt: 'timestamp without time zone' },
  announcement_receipts: { id: 'text', announcementId: 'text', subject: 'text', kind: 'text', eventKey: 'text', createdAt: 'timestamp without time zone' },
  presentation_choices: { id: 'text', userId: 'text', kind: 'text', assetId: 'text', updatedAt: 'timestamp without time zone' },
};

/** All queries are SELECTs; never baselines, alters, seeds or provisions users. */
export async function auditFounderSchema(prisma) {
  const columns = await prisma.$queryRaw`
    SELECT table_name, column_name, data_type FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name IN ('users', 'announcements', 'founder_assets', 'announcement_receipts', 'presentation_choices')`;
  const roles = await prisma.$queryRaw`
    SELECT e.enumlabel FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public' AND t.typname = 'Role'`;
  const history = await prisma.$queryRaw`SELECT to_regclass('public._prisma_migrations')::text AS relation`;
  const missing = [], mismatches = [];
  for (const [table, definitions] of Object.entries(expected)) {
    for (const [column, type] of Object.entries(definitions)) {
      const actual = columns.find(item => item.table_name === table && item.column_name === column);
      if (!actual) missing.push(`${table}.${column}`);
      else if (actual.data_type !== type) mismatches.push({ column: `${table}.${column}`, expected: type, actual: actual.data_type });
    }
  }
  return {
    applicationTablesPresent: ['users', 'announcements'].every(table => columns.some(item => item.table_name === table)),
    founderRolePresent: roles.some(item => item.enumlabel === 'FOUNDER'),
    migrationHistoryTablePresent: !!history[0]?.relation,
    missing, mismatches,
    note: 'Presence/type audit only. Does not validate indexes, constraints, migration checksums or data; not approval to baseline or deploy.',
  };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const connection = process.env.DIRECT_URL || process.env.DATABASE_URL;
  if (!connection) { console.error('Configure DIRECT_URL for the confirmed database locally. Do not paste credentials into chat.'); process.exitCode = 1; }
  else {
    const { PrismaClient } = await import('@prisma/client');
    const prisma = new PrismaClient({ datasources: { db: { url: connection } } });
    try {
      const result = await prisma.$transaction(tx => auditFounderSchema(tx), { isolationLevel: 'RepeatableRead', timeout: 30000 });
      console.log(JSON.stringify(result, null, 2));
    } catch { console.error('Schema audit failed. Check the confirmed connection and database access; no schema changes were issued.'); process.exitCode = 1; }
    finally { await prisma.$disconnect(); }
  }
}
