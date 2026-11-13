# SMS page returns 500 / Prisma P2021

The production log identified missing `public.sms_campaigns` and
`public.sms_templates` after publishing PR #346. Render uses
`node dist/main.js`, intentionally bypassing Prisma Migrate because this Neon
database has an unresolved legacy migration baseline (see
`P3005_RECOVERY_2026-10-29.md`). Setting an OfflineSMS API key cannot create tables.

Do not reset/seed production or mark all old migrations applied. Do not change
the existing migration SQL/checksums. Repair this feature's tables only.

## Explicit recovery deployment

1. Select the existing backend service and its existing application database.
   Preserve its current database URLs and API/encryption secrets.
2. Set backend environment variable `SMS_SCHEMA_RECOVERY=apply` and deploy the
   recovery commit. Its startup runs the committed
   `backend/prisma/recovery/add-sms-tables.sql` recovery block before listening.
   No other migration is applied. If any SQL operation or compatibility check
   fails, the transaction rolls back and the new process does not start.
3. Confirm `SMS schema verified; additive recovery complete` in startup logs.
   Verify `/api/sms/templates` and `/api/sms/campaigns` using an authenticated
   administration session. A public health check alone does not prove they work.
4. Remove `SMS_SCHEMA_RECOVERY` after successful verification. Repeat execution
   is safe: compatible tables and existing messages/templates are preserved.

Alternatively, execute the **entire** recovery SQL file in the correct Neon SQL
Editor database/branch. It is one transaction, including lock/statement timeouts,
an advisory lock, checks for existing application tables, and validation of SMS
columns/primary keys/idempotency uniqueness/campaign foreign key. It contains no
data deletion or alteration and does not modify `_prisma_migrations`.

The legacy migration baseline still needs its separate audit before switching to
`npm run start:prod`. Do not run the normal SMS migration on top of manually
recovered tables without reconciling that feature's audited migration history.

## Verification

- SMS unit tests verify recovery is disabled without explicit opt-in and that a
  rejected repair propagates without starting the HTTP server.
- CI's `sms-schema.integration.test.ts` creates a random disposable PostgreSQL
  database, reproduces missing SMS tables without migration history, verifies
  normal Prisma reads/writes and uniqueness, replays recovery without losing
  student/message/template data, and verifies a malformed schema rolls back.
- Schema recovery sends no SMS and does not change `OFFLINESMS_ENABLED`.
  Provider verification, a rotated key and `SMS_ENCRYPTION_KEY` are separate
  requirements described in `OFFLINESMS.md`.
