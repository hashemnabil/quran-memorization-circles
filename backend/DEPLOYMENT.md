# Production database updates

## Existing unmanaged database (P3005)

Do not mark all historical migrations applied based only on a list of columns.
The supplied production metadata contains 39 application tables and 442 columns,
with six newer tables absent and no Prisma migration history. For this specific
state, `prisma/recovery/add-missing-offline-tables.sql` creates those six tables
and the journal functions/triggers in one transaction. Its guards reject a
partially repaired or different schema. It does not change existing application
rows or manufacture Prisma migration records.

Run that entire file in the Neon SQL Editor against the application's branch.
After successful commit, temporarily use `node dist/main.js` as the backend
Start Command and redeploy. This bypasses `migrate deploy` while the database
remains unmanaged; it does not fix migration history. Future schema changes
require explicit SQL deployment or a separately reviewed baseline covering
constraints, indexes, enum values and data transformations as well as columns.
Do not switch back to automatic migration startup until adoption is complete.

CI rehearses recovery in a new disposable local database, preserves an existing
student, checks the six tables, and verifies journal/operation-receipt writes.
It does not connect to Neon.

Run the backend using `npm run start:prod` from `backend/` (or `npm run start:prod` from the repository root). This applies committed Prisma migrations before starting the API. It does not seed or reset the database, and migration failure prevents API startup.

For Render, set the backend service Start Command to `npm run start:prod` when its Root Directory is `backend`; the repository root command also delegates to this entry point. A custom `node dist/main.js` command bypasses the migration step.

Use the direct PostgreSQL connection in `DIRECT_URL` when `DATABASE_URL` is a transaction-pooler endpoint. Without a separate direct URL, startup uses `DATABASE_URL` for migrations too.

## Repair an existing deployment with a missing processed_operations table

In the backend service's Render Shell, from `backend/`, apply the committed migrations against that service's configured database:

```sh
DIRECT_URL="${DIRECT_URL:-$DATABASE_URL}" npx prisma migrate deploy
```

Confirm that the command succeeds. If it fails, resolve the reported migration error before starting another deployment. Do not replace it with `db:setup` (which seeds demo data), `migrate reset`, or `db push --accept-data-loss`.

The schema migration `20261014090000_general_sync_journal` creates both `processed_operations` and `sync_changes`. The API's offline write path requires these tables. Cached pending operations should be retained and retried after the database repair.

The production-start unit tests use an injected migration runner, without touching a database. CI also rehearses this startup entry point against its disposable PostgreSQL database.
