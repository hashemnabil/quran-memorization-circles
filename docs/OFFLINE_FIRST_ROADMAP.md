# Offline-first implementation plan

## Goal

Keep PostgreSQL and the existing REST API as the authoritative shared system. Each device should automatically download the current user's permitted working set, retain it durably for offline use, queue supported edits, and synchronize safely when connectivity returns.

## Current implementation audit (2026-10-13)

### Implemented

- Successful React Query data is persisted in IndexedDB in an account-scoped snapshot, with a seven-day age limit.
- The app restores a cached session on launch without connectivity when a prior session/token and cached identity remain. Explicit logout clears that identity and the account's persisted query snapshot; offline login after explicit logout is intentionally not supported.
- Automatic sync runs after cache restoration, on reconnect/focus, and periodically. It refreshes queries already registered in the current app session.
- `GET /offline-sync/bootstrap` returns a versioned, cursor-paginated core dataset scoped from the authenticated identity and server-side access-control rules.
- The frontend downloads and stores the complete bootstrap snapshot per account, and the students/circles screens use it as a first-page fallback on network failure. Those screens show a warning because the bootstrap intentionally omits some fields and filtered/later pages are not fully offline-capable.
- Staff attendance roles can automatically download a permission-scoped attendance roster bundle.
- An IndexedDB outbox persists attendance-sheet submissions. Replay is limited to `POST /attendance`, validates the payload, runs sequentially per account, retries transient failures, and blocks conflicts/rejections rather than silently dropping them.

### Not yet full offline-first

- This is not a complete dataset for every screen. Query refresh only covers queries already registered by the app, and the bootstrap only includes a minimal set of circles/students.
- Most filtered searches, detail views, reports, history pages, and other domains remain online-only unless their successful query data was previously cached.
- Offline writes beyond attendance are not enabled. Attendance replay relies on existing server-side duplicate/conflict behavior; generalized client-generated operation IDs and durable server-side idempotency records have not been implemented.
- There is no general authorized change-feed cursor/tombstone mechanism yet, so other users' changes are not guaranteed to propagate incrementally to every device.
- Automated authorization/pagination coverage for the bootstrap and comprehensive offline end-to-end tests remain outstanding.

## Rollout phases

### Phase 1 — make offline behavior explicit and safe

- [x] Separate app restart/offline restoration from explicit logout.
- [x] Avoid persisting raw passwords or treating a cached role as server authorization for writes.
- [x] Keep pending writes account-scoped and never replay them under another account.
- [x] Warn users when student/circle fallback data may be incomplete.
- [ ] Show reliable cache freshness and download completeness for every offline-capable screen.

### Phase 2 — permission-scoped initial download

- [x] Add `GET /offline-sync/bootstrap`, using the authenticated server identity and existing access-control service.
- [x] Download and persist the complete paginated bootstrap snapshot per account.
- [x] Use the snapshot as a limited fallback in the students/circles screens.
- [ ] Add automated backend tests for role scopes, inaccessible cursors, page boundaries, and complete pagination.
- [ ] Extend the bootstrap in small domain-specific slices (for example, recitation lists/progress and the detail data required by each role).
- [ ] Avoid placeholder values being treated as real domain values; prefer explicit offline view models and UI fields that are unavailable in the snapshot.
- [ ] Add an incremental refresh contract so the app need not repeatedly download every bootstrap record.

### Phase 3 — durable writes and idempotent replay

- [x] Provide a durable IndexedDB outbox for attendance writes with strict endpoint allowlisting and payload validation.
- [x] Replay queued attendance writes sequentially, account-scoped, and preserve transient failures/conflicts.
- [ ] Add client-generated operation IDs and server-side idempotency records; ensure each mutation and its idempotency result commit transactionally.
- [ ] Add outbox inspection/status so users can identify pending, retrying, and blocked edits.
- [ ] Only then enable offline corrections, recitation, or other writes, each with validation, authorization, duplicate handling, and conflict rules.
- [ ] Test the ambiguous case where the server commits a write but the response is lost before the client receives it.

### Phase 4 — incremental sync and cross-user updates

- [ ] Add a server change feed/cursor for records the authenticated user is allowed to see.
- [ ] Include tombstones/deletions as well as inserts/updates.
- [ ] Pull authorized changes after successful outbox replay and on reconnect/app focus.
- [ ] Use Socket.IO as a notification that changes may exist; fetch authorized records through the API instead of broadcasting private data to broad rooms.
- [ ] Add bounded pagination, backoff, schema versioning, and telemetry without logging sensitive student data.

### Phase 5 — verification

- [ ] Test airplane-mode launch, expired/revoked sessions, explicit logout, account switching, storage quota errors, interrupted downloads/writes, duplicate retries, concurrent edits, and reconnect.
- [ ] Verify teacher/parent/student accounts receive only the data they may view online.
- [ ] Run frontend typecheck/build, offline tests, backend tests, and database migration checks before merging.

## Security and product decisions

- A cached role is only for rendering the previously signed-in app shell; every synchronized write must still be authenticated and authorized by the server.
- Never cache passwords or reuse one account's pending writes under another account.
- "Close the app and reopen offline" differs from "explicitly log out, then sign in offline." Offline login after explicit logout requires a separately designed local unlock mechanism and shared-device data-retention policy; do not solve it by keeping server tokens alive or storing passwords.
- Do not advertise full offline capability until the relevant data is downloaded, freshness is visible, and edits have domain-specific idempotency/conflict handling.

## Recommended next engineering slice

Before enabling additional offline writes, add automated backend tests for the existing bootstrap endpoint and make its pagination/role-scope contract robust. Then implement server-side idempotency for attendance retries, followed by a small additional read-only domain bundle. This reduces the risk of data leakage or duplicate records while expanding offline coverage.


## Security and generalized-sync status (verified 2026-10-14)

The checklist above describes a mixture of existing capabilities and unfinished target work. Do not infer that the generalized implementation is complete from this roadmap.

- The current API client timeout is 45 seconds.
- The current outbox is intentionally restricted to attendance-sheet `POST /attendance`; other mutation types are rejected.
- The existing incremental feed covers students and circles only. It is not a PostgreSQL-wide `SyncChange` feed and does not provide the target transactionally durable operation ledger.
- Generalized snapshot/push endpoints, database triggers and retention, durable per-operation idempotency, full cross-domain local storage, realtime sync invalidation, and comprehensive end-to-end tests remain release blockers unless separately implemented and verified.
- `docs/OFFLINE_FIRST_SECURITY_AND_RELEASE_CHECKLIST.md` records the required credential response and safe production rollout gates.
- Do not run reset, wipe, seed, or destructive migration commands against production. Preserve `/offline-sync/bootstrap` and `POST /attendance` for existing mobile clients.
- Credential rotation and Git-history cleanup are owner actions; no credentials should be printed in a PR, and no history rewrite should happen without owner approval.
