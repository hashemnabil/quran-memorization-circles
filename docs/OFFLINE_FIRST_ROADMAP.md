# Offline-first implementation plan

## Goal

Keep the existing PostgreSQL database and REST API as the authoritative shared system. Each device stores a permission-scoped local working set, records supported offline edits in a durable outbox, and synchronizes when the server is reachable.

## Current implementation audit (2026-10)

- The frontend persists successful React Query data in IndexedDB, scoped by account ID, with a seven-day snapshot age limit.
- The download dialog can refresh and persist only queries already registered by pages visited in the current session. It is not a full-site download.
- An IndexedDB outbox exists, but automatic replay is intentionally restricted to POST /attendance and validates its payload.
- Attendance replay relies on the server's existing duplicate-sheet protection; conflicting sheets are blocked for review.
- Socket.IO currently documents its scope as chat and notifications, not general CRUD invalidation.
- Explicit logout removes the offline identity, tokens, in-memory query cache, and that account's persisted query snapshot. Therefore a user cannot safely expect to sign in again while offline after explicit logout.
- The backend already has role/access-control checks and must remain the authority for every synchronized write.

## Rollout phases

### Phase 1 — make offline behavior explicit and safe
- Keep PostgreSQL and existing API contracts intact.
- Separate app restart/offline restoration from explicit logout.
- Do not persist raw passwords or treat a cached role as server authorization.
- Preserve account-scoped pending writes until the same account can safely reconcile them; never replay one account's writes under another account.
- Make download status accurately distinguish downloaded data from pages not yet visited.

### Phase 2 — permission-scoped initial download
- [In progress] Add `GET /offline-sync/bootstrap`, a versioned, cursor-paginated core-data bundle derived from the authenticated user and existing access-control service. The first slice returns permitted circles for staff roles and a minimal student working set for admin/staff, parent, and student roles; it deliberately excludes exam-committee/support browsing and does not yet cover every domain.
- Remaining: connect the frontend to consume and persist this bundle, add automated authorization/pagination tests, and extend it domain-by-domain.
- Build the bundle from existing services/access-control rules, not from client-supplied role or user IDs.
- Paginate/chunk large datasets and expose a server cursor/version.
- Store normalized domain records in IndexedDB, rather than relying only on React Query snapshots.
- Do not cache secrets, refresh tokens, or data the user cannot view online.

### Phase 3 — durable writes and idempotent replay
- Add client-generated operation IDs and server-side idempotency records for each supported mutation.
- Start with attendance, then add recitation and other domains only after each has validation, permission checks, duplicate handling, and conflict behavior.
- Keep rejected/conflicting operations visible for manual resolution; never silently discard them.
- Make each domain write transactional on the server.

### Phase 4 — incremental sync and cross-user updates
- Add a server change feed/cursor for records the authenticated user is allowed to see.
- Return tombstones/deletions as well as inserts/updates.
- Pull changes after successful outbox replay and on reconnect/app focus.
- Use Socket.IO as a notification that new changes may exist; fetch authorized changes over the API rather than broadcasting private records to broad rooms.
- Add backoff, pagination, schema versioning, and telemetry without logging sensitive student data.

### Phase 5 — verification
- Test airplane-mode launch, expired/revoked sessions, explicit logout, account switching, storage quota errors, interrupted writes, duplicate retries, concurrent edits, and reconnect.
- Verify that teacher/parent/student accounts receive only their permitted data.
- Run frontend typecheck/build, offline tests, backend tests, and database migration checks before merging.

## Important authentication decision

"Close the app and reopen offline" and "explicitly log out, then sign in offline" are different security actions. The current explicit logout intentionally clears the local identity and private cache. Supporting offline sign-in after logout needs a separately designed local unlock credential (for example, an opt-in device PIN/passkey) and a clear shared-device data-retention policy. It must not be implemented by keeping server tokens alive or storing the user's password.

## Current status

This document is a rollout plan, not a claim that full offline-first synchronization is already implemented. The bootstrap API is only the first backend slice; the client does not yet consume it automatically, it is not an incremental change feed, and it is not a complete offline dataset.
