import { test } from 'node:test';
import assert from 'node:assert/strict';
import { auditFounderSchema } from './audit-founder-schema.mjs';

test('unmanaged database is reported without baselining or schema mutations', async () => {
  const queries = [];
  const prisma = { $queryRaw: async strings => {
    const sql = strings.join(''); queries.push(sql);
    if (sql.includes('information_schema')) return [{ table_name: 'users', column_name: 'id', data_type: 'text' }, { table_name: 'announcements', column_name: 'id', data_type: 'text' }];
    if (sql.includes('pg_enum')) return [{ enumlabel: 'ADMIN' }];
    return [{ relation: null }];
  } };
  const result = await auditFounderSchema(prisma);
  assert.equal(result.applicationTablesPresent, true);
  assert.equal(result.migrationHistoryTablePresent, false);
  assert.equal(result.founderRolePresent, false);
  assert.ok(result.missing.includes('announcements.isPopup'));
  assert.ok(queries.every(sql => /^\s*SELECT\b/i.test(sql)));
});

test('unexpected existing column types are surfaced instead of accepted', async () => {
  const result = await auditFounderSchema({ $queryRaw: async strings => {
    const sql = strings.join('');
    if (sql.includes('information_schema')) return [{ table_name: 'founder_assets', column_name: 'content', data_type: 'text' }];
    if (sql.includes('pg_enum')) return [{ enumlabel: 'FOUNDER' }];
    return [{ relation: '_prisma_migrations' }];
  } });
  assert.equal(result.applicationTablesPresent, false);
  assert.deepEqual(result.mismatches, [{ column: 'founder_assets.content', expected: 'bytea', actual: 'text' }]);
});
