# Offline-first rollout: security and production checklist

This document is an operational gate for the offline-first work. It does not claim that the target sync protocol is fully implemented.

## Immediate credential response

- [ ] Rotate the Neon PostgreSQL password and any Cloudinary API secret/key that may have been committed or exposed. Update deployment secrets only after confirming the new values work; do not paste credentials into issues, pull requests, chat, or logs.
- [ ] Audit repository history for accidentally committed environment files. Removing a file from the current tree does not remove it from Git history.
- [ ] After preserving an audit copy and coordinating with repository collaborators, use `git filter-repo` or BFG to remove exposed files from history. Force-push/history rewriting is an owner-approved operation and is intentionally not performed by this change.
- [ ] Revoke old credentials after verifying production has moved to the rotated values.
- [ ] Confirm `.gitignore` excludes `.env*` and `.evn`, while allowing only a deliberately sanitized `.env.example`.

## Production migration safety

- Back up the production database and verify that the backup can be restored before applying any schema migration.
- Review the generated SQL and test it against a disposable PostgreSQL database with a copy of the schema.
- Apply migrations through the deployment migration command only after review. Never use `prisma migrate reset`, seed, wipe, or fresh-database scripts against production.
- Keep the legacy `/offline-sync/bootstrap` and `POST /attendance` routes available until deployed mobile clients have a documented migration path.
- Do not enable a new offline write type until its server authorization, payload allowlist, durable idempotency, retry behavior, and conflict policy are implemented and tested.

## Release gate

A release is not complete merely because a design document or endpoint exists. Before marking full offline-first sync ready, record the actual result of:

- backend build and tests against PostgreSQL;
- migration deploy validation against a disposable database;
- frontend typecheck, build, and offline tests;
- account switching/logout and queue-isolation tests;
- duplicate operation replay after a simulated lost response;
- role/scope checks including transfer out of a previously accessible circle;
- two-device reconnect and realtime-triggered pull test.

Record failed, skipped, and unrun checks explicitly. Never report an unrun check as passing.
