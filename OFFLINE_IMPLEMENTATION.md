# Offline implementation status

This repository uses React/Vite and NestJS, not Next.js. The executable equivalents
of the requested files are in `frontend/src/lib`, `frontend/src/pages`, and
`backend/src/offline-sync`. The existing Capacitor build uses `dist`, not `out`.
`next-pwa` and Next.js route files are not used.

## Implemented

- Account-isolated `halaqatFull` Dexie database with entity tables, durable ordered
  queue, reference metadata, response cache, and cached image blobs.
- Local-first basic CRUD for students, circles, teachers, recitations, courses;
  attendance sheets and corrections; exam requests and exam updates/results;
  student notes and notification read/delete operations.
- Local list search, filters, sorting and pagination without a pre-cached query.
- Local attendance sheets, attendance/recitation day history and day details.
- Full download of authorized core records, including student/circle/teacher
  details, course rosters/attendance, exam references, and student photo caching.
- Local core dashboard statistics and all report types, including XLSX export.
- Backup/import of account records, queue, references, ID mappings, cached reads
  and image blobs. Imports merge rather than discard newer local work.
- `/settings/offline` counts, download, backup, import and cache management.
- Connectivity banner, queue count, last synchronization and manual sync.
- Authenticated `GET/POST /api/sync-all`, DTO validation, explicit domain/role
  allowlist, existing domain access control, and account-scoped operation receipts.
  A domain mutation and its receipt commit in the same PostgreSQL transaction.
  Dependent local IDs resolve through committed receipts. Rejections preserve
  the remaining queue and stop later operations.
- PWA shell precache, manifest and image caching; external Google Fonts removed.
- Android project created under `frontend/android`, with Network and Preferences.

## Scope still requiring implementation before claiming 100% offline

This is **not yet a complete offline conversion of every page and button**.
Operations outside the explicit local adapter still use their existing online
APIs. Cached reads may be available offline, but that is not full offline support.

Remaining workflows include chat, transfers and suspensions, user/staff/supervisor
administration and staff attendance, settings/profile changes, registry, media and
schedules, announcements, support workflows, certificates/student files, file
uploads and Excel imports, course enrollment/attendance editing, exam scheduling,
rejection/cancellation and milestone editing, student evaluation/preparation/surah
completion workflows, and some nested detail/reference endpoints.

Student exam eligibility/milestones and historical profile metadata are downloaded
snapshots; their full business rules are not yet recalculated after every local
edit. Student/parent/support portals do not have complete entity replication.
The dashboard's core academic counts are local; unreplicated administrative counts
are not supplied as fabricated zeroes.

The push contract uses `{operations}` rather than raw unrestricted table upserts
so existing authorization, validation, dependent IDs and idempotency are retained.
Pull currently downloads full paginated snapshots, not a 30-day incremental feed;
it removes missing synced records while preserving pending local edits.
Large deployments should add consistent snapshot cursors and domain change feeds.
Uploads need a separate durable binary transfer protocol.

First sign-in and initial download require connectivity. Existing offline sessions
can restart without a connection. Server authorization is rechecked during replay.
Signing out preserves the new account-isolated queue; it does not expose that
account's records to another login. Device/browser storage deletion still erases
local work, so export backups before clearing application/browser data.

## Verification

Verified in this workspace: both production builds; 16 new frontend tests,
28 existing frontend offline tests, 5 new backend receipt tests, and 15 existing
sync protocol tests. One Chrome test passes cold offline navigation through
students, circles, teachers, attendance, recitations, reports, offline settings,
and dashboard, followed by an uncached local search. This browser test uses
mocked authorized API fixtures for initial download, not a live database.

The browser test exposed and verified a service-worker fix for `Vary: Origin`:
module-script requests and worker precache requests can have different Origin
headers. Public immutable shell assets now match despite that header difference.

From `frontend`:

```powershell
npm.cmd run build
npm.cmd run test:full-offline
npm.cmd run test:offline
npm.cmd run test:e2e:offline
npm.cmd run mobile:sync
```

From `backend`:

```powershell
npm.cmd run build
npm.cmd run test:full-offline
npm.cmd run test:sync-protocol
```

The server receipt tests use a fake transaction boundary. A live PostgreSQL
integration test is still needed for concurrent receipts, rollback and domain
side effects. Android source preparation does not produce a signed APK: Android
SDK/JDK/Gradle and signing configuration are needed for APK compilation.
