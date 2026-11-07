# Production deployment and rollback

This runbook does not certify the hosted application. Use a staging database restored from a verified backup before releasing. Never run `seed`, `db:fresh`, `db:wipe`, `db:reset` or `prisma migrate dev` against production.

## Build the existing project

Use Node 22 (the supported package range is 22–24) and the committed lockfiles:

```sh
npm ci --prefix backend
npm ci --prefix frontend
npm --prefix backend run build
npm --prefix frontend run test:offline
npm --prefix backend run test:security
npm --prefix frontend run build
```

Compile with development dependencies installed; `nest`, TypeScript and the Prisma CLI are build tools. If pruning dev dependencies from the runtime image, generate Prisma first and retain a separate migration job/image with the Prisma CLI. The runtime is `node backend/dist/main.js` with working directory/environment chosen consistently for uploads.

### Offline communication/support release ordering (2026-10-28)

Deploy the updated backend before the new web/APK client. Support snapshots use `GET /sync-all?table=supportTickets`; incremental support data is opt-in through `support=1` on the delta endpoint, preserving responses for already published clients. Existing domain authorization still applies to ticket creation/replies, internal notes and reserved account-deletion/password-reset requests.

The current client upgrades IndexedDB to version 14 without clearing account data or pending operations. Rehearse upgrades from versions 12 and 13 with encrypted saved accounts. Do not clear IndexedDB to roll back a client with pending work; an older client whose maximum schema version is below 14 cannot safely reopen a version-14 database. Keep the backend backward compatible while preparing a client fix.

Version 14 adds durable conversation drafts. Publish backend handling for `chatConversations/create` before the client. Existing conversation lists and prefetched detail snapshots refresh the scoped local conversation cache; the delta endpoint does not send an unknown new conversation table to older clients. Rehearse a new offline group with dependent messages, rejection after contact permissions change, reuse of an existing direct thread, and replay after a lost acknowledgement. Support status/assignment replay also requires this backend: it atomically checks the server's `updatedAt` baseline before changing the ticket.

Before releasing this feature, run `npm --prefix frontend run test:local-security`, `npm --prefix frontend run test:full-offline`, `npm --prefix backend run test:full-offline` and `npm --prefix backend run test:domain-safety`, followed by the builds above. Test ticket creation offline, a dependent reply before creation is acknowledged, lost-response replay, cross-account access and customer exclusion of internal notes against isolated PostgreSQL. Passing mocked/unit tests does not replace that staging exercise.

## Required configuration

Set `NODE_ENV=production`, direct and pooled PostgreSQL URLs, a unique random `JWT_ACCESS_SECRET` of at least 32 characters, exact HTTPS browser `CORS_ORIGINS`, and HTTPS `PUBLIC_URL` for generated upload links. Do not commit secrets. Capacitor clients may additionally require `capacitor://localhost`, `ionic://localhost`, `http://localhost` or `https://localhost` depending on the native build. No wildcard origin is accepted. API docs are off in production unless explicitly enabled with `ENABLE_API_DOCS=true` behind restricted ingress.

Refresh tokens are opaque; `JWT_REFRESH_SECRET` is retained in the sample for compatibility but does not sign these tokens. Access tokens are bound to persisted refresh-session IDs. Legacy access tokens need one refresh (handled by the current frontend) or a new login. Password resets revoke persisted sessions, including access-token validation. Parent login stays disabled by the owner's decision; students use their own portal.

Serve `frontend/dist` behind HTTPS with SPA fallback, proxy `/api`, `/socket.io` (WebSocket upgrade) and `/uploads` to the backend. Preserve upload CSP headers. Use a persistent volume for `UPLOAD_DIR` when Cloudinary is not configured. Generated local URLs require `PUBLIC_URL` to point to the actual API. Configure an external login/refresh rate limit at ingress; the repository does not yet provide a distributed brute-force limiter.

## Backup and restore rehearsal

Use PostgreSQL client tools at least as new as the server. The scripts pass database credentials through child environment variables, not process arguments, and never print connection URLs.

```sh
# Set BACKUP_DATABASE_URL using the hosting secret store (direct connection).
cd backend
npm run backup -- --output /secure-backups/quran-release-YYYYMMDD --uploads /persistent/uploads
```

The directory is private and contains a custom-format dump, optional upload archive and SHA-256 manifest. A failed command has no completion manifest and is not a valid backup. Copy completed backups to encrypted off-host storage with a documented retention policy.

Create an **empty isolated** restore database; set `RESTORE_DATABASE_URL` through the secret store:

```sh
npm run restore -- --backup /secure-backups/quran-release-YYYYMMDD --confirm-database quran_restore_test
```

Restore verifies the dump digest, refuses databases containing application tables, and uses a single transaction. It never drops existing data. Verify the upload archive digest against the manifest, extract into a separate staging volume, and compare record counts, student/circle assignments, attendance, exams, certificates and session behavior. Backup creation alone is not proof of recoverability. CI rehearses backup and restoration against a disposable PostgreSQL database and checks record counts and refusal to overwrite existing tables. These scripts have not been run against the production host.

## Migration/release order

1. Verify a complete backup and rehearse restore; record the current release commit and hosting configuration.
2. Inspect `prisma migrate status` using `DIRECT_URL`. Compare existing migration checksums and any manually created schema changes. Do not rewrite migration history or resolve a failed migration without investigating it.
3. Apply the committed migration history to the restored staging database using `npm run prisma:deploy`. CI also applies the history to an empty disposable PostgreSQL database, but that cannot detect production drift.
4. Run the API and UI acceptance checks on staging for admin, supervisor, teacher, exam committee, support and student. Verify airplane-mode/reconnect on actual Android/iOS devices.
5. Deploy only a tested commit. Apply approved migrations through a separate controlled migration job before starting code that depends on them. No deploy hook is added that blindly resets/seeds/migrates production.
6. Check HTTPS, CORS (including native origins), database readiness at `/api/health`, authenticated reads/writes, uploads and notification delivery. Compare the hosting release SHA to the approved commit; a successful health response alone does not prove that commit is live.

## Rollback

Keep the previous immutable API/frontend artifacts and configuration. Roll back application artifacts first when the schema remains backwards compatible. Stop new writes before a database restore. Restore to a **new** database and validate it before switching traffic; never restore directly over production data or automatically run down-migrations. Reconcile uploads and any writes made after the backup with the operator. Production restore, destructive migration and traffic cutover need explicit owner approval.

## Gates still required

- Hosting access and verified release SHA/environment; production migration drift review.
- A witnessed backup/restore rehearsal and secure off-host retention.
- Full browser/real-device workflow acceptance, including network interruption and account switching.
- Typed offline handlers/local screens for domains beyond attendance; conflict review UI for corrections.
- Commit-ordered global sync journal, historic hard-delete handling, and cache invalidation after access revocation.
- Dependency vulnerability remediation, ingress rate limiting and performance checks under realistic school data volume.

### Runtime configuration compatibility

DIRECT_URL is required for migration commands when the provider uses a separate direct connection, not for application startup. Do not substitute pooled migration connections blindly. DATABASE_URL and a strong JWT_ACCESS_SECRET remain required at runtime. Supplied URLs and CORS origins remain validated. Render uploads fall back to RENDER_EXTERNAL_URL when PUBLIC_URL is absent. Missing CORS configuration keeps the existing restrictive localhost defaults; configure the actual HTTPS frontend origin for browser access. This fix does not run migrations or modify production data.
