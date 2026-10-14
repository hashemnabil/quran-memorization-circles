# Offline-first implementation status and release gates

This document is intentionally explicit: offline support is not complete merely because the application shell or one data bundle loads offline.

## Currently implemented paths

- Account-scoped persistence of successful React Query results in IndexedDB (7-day maximum age).
- Role-aware initial bootstrap for circles and students, with bounded pagination and server-side access checks.
- Incremental student/circle change feed with independent cursors and student deletion tombstones.
- Initial attendance roster download for ADMIN, SUPERVISOR, and TEACHER roles.
- Durable outbox/replay framework with a deliberately narrow attendance-write handler.
- Best-effort refresh when connectivity returns, the window gains focus, or the periodic sync runs.

## Known gaps — do not represent as finished

- Bootstrap does **not** download every resource needed by every screen. It covers circles/students, and the attendance bundle covers the roster; the rest of the query cache only contains queries the user has already opened successfully.
- Incremental change feed currently covers only students and circles. Changes to other resources are not replicated through this feed.
- Offline write/replay is not a general-purpose write path. Only the explicitly accepted attendance operation is replayed; other writes must remain online until they have domain-specific validation, conflict rules, and idempotency.
- There is no server-side durable idempotency ledger for attendance replay request IDs.
- A passing build or unit test is not proof of end-to-end offline behavior on web, Android, and iOS.

## Required work before claiming production-ready offline operation

1. Define a server-owned resource manifest per role, including field-level data minimization, row-level ACL, maximum payload sizes, and whether a resource is readable or writable offline.
2. Implement bounded, resumable bootstrap and incremental changes for each approved resource, including deletion/access-revocation handling. Do not dump whole database tables or trust a client-supplied role.
3. Add a screen-to-resource inventory and proactively fetch every approved dataset after authentication; show download progress, partial failures, and the last successful sync time.
4. Route each supported offline mutation through a durable outbox with a stable operation ID, server-enforced idempotency, authorization re-checks, and explicit conflict/rejection UI.
5. Verify account switching, role downgrade, logout, expired credentials, interrupted downloads, storage quota, schema upgrades, duplicate replay, and reconnect races.
6. Run backend and frontend test suites plus real browser/device tests with network disabled and restored. Record actual results and only then enable the feature for production.

## Release safety

- Keep changes on a review branch until CI and the release gates above pass.
- Never log or commit credentials. If credentials were ever committed, rotate/revoke them; deleting a file from the latest revision does not erase repository history.
- Do not advertise "all screens and all data work offline" until each supported role/resource/screen has been verified.
