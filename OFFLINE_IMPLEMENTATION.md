# Offline implementation status

This repository uses React/Vite and NestJS, not Next.js. The executable equivalents
of the requested files are in `frontend/src/lib`, `frontend/src/pages`, and
`backend/src/offline-sync`. The existing Capacitor build uses `dist`, not `out`.
`next-pwa` and Next.js route files are not used.

## Implemented

- Supported online writes now wait for their own queue acknowledgement and return
  canonical server data; offline/transport failures retain the local result.
  Explicit validation rejections reach the form instead of showing server success.
  A rejected operation and its dependents remain queued, while unrelated later
  writes can proceed. Student edits normalize an empty optional birth date before
  validation. Pending local reads remain visible before bootstrap completes.

- Incremental core replication now uses a durable `sync_changes` sequence cursor.
  Bootstrap fences the journal before reading initial data. Later requests use
  `/sync-all/delta?since=...`; only affected domain rows are hydrated and sent.
  Authorized ID manifests reconcile deletion/scope changes without retransmitting
  unchanged record bodies. Dirty local rows are preserved. The cursor advances only
  after both core rows and related section snapshots are saved successfully.
  Existing installations need one baseline download to establish this cursor.
  Additional sections refresh only when their dependency tables changed. Their
  authenticated GET snapshots use account/endpoint-scoped tokens and row/object
  patches, preserving unchanged records locally. A bounded server cache (8 MB,
  1 MB per snapshot) falls back to a full affected section after eviction/restart
  or when no baseline token exists; this does not restart the entire application
  download. Scope/role assignment changes may require complete authorized rosters
  to backfill newly accessible records and remove revoked ones. Some server-side
  authorized list scans remain necessary for deletion manifests; the protocol
  optimizes hydration and transferred content, not every underlying SQL query.

- Boot download starts after the first screen can render. Automatic 30-second
  ticks only flush pending writes or retry incomplete/announced downloads. There
  is no periodic full download: after bootstrap, successful REST mutations publish
  an opaque revision over the authenticated realtime channel. Reconnect sends the
  current revision so clients can detect missed changes. Opening/reconnecting
  shares a silent watermark check; it does not reset progress or start a download
  if the durable cursor is unchanged. Concurrent triggers share one refresh run.
  The realtime revision is the durable journal sequence, not a fresh random token
  per HTTP response; repeated/no-op notifications cannot announce a false change.
  A completed pull records
  the revision seen at its start; events arriving during that pull remain pending.
  The revision survives server restarts. Multi-instance deployments still need a
  shared event bus to broadcast changes immediately across all socket instances.
  Changes written directly to the database outside REST are not covered by this
  interceptor. Section prefetch uses
  one request at a time and yields between resources. Pulls no longer invalidate
  every active query after each table; the UI refreshes once after the sync cycle.
  The compact indicator includes monotonic stage-weighted progress (not byte or
  time remaining); 100% is reported only after a successful synchronization cycle.

- Startup now downloads core entities and a role-specific catalogue of additional
  JSON reads without navigating to their pages. This includes support tickets and
  details, conversation metadata/messages, administrative directories, registry,
  announcements, certificate lists, preparation/evaluation records, transfer and
  suspension lists/details, circle histories and course/staff attendance history.
  Paginated resources are downloaded to completion; interrupted sections preserve
  their previous complete snapshot. Independent sections continue after failures,
  and the automatic synchronizer retries. Additional snapshots are account-scoped
  and support the explicitly listed local query filters in offline-prefetch.ts.
  Server authorization still applies to every request. This is read replication,
  not offline mutation support for every workflow. Binary attachments, arbitrary
  report date combinations, and unsupported query filters are not predownloaded.
  The current-day staff/course sheets and current-month certificate report are
  prefetched, not every hypothetical future date or parameter combination.
  Opening the app online starts this automatically; first download must complete
  before relying on it offline. The compact status shows connection and sync state.

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
administration and staff attendance, settings/profile changes, registry, media
activities, announcements, support workflows, certificates/student files, file
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
Initial pull downloads full paginated snapshots; subsequent pulls consume the
durable change cursor and reconcile IDs while preserving pending local edits.
Large deployments should further optimize authorized ID scans and share the
section snapshot cache across server instances.
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
