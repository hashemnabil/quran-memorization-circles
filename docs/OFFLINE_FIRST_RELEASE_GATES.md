# Offline-first implementation checklist and release gates

This checklist is the repository's source of truth. Checked means the code path exists; it does **not** mean end-to-end tests passed. Keep unchecked items open until verified.

## Foundation and data download

- [x] Persist successful React Query cache snapshots in account-scoped IndexedDB (7-day maximum age).
- [x] Restore the signed-in account's cached query data on app startup.
- [x] Bootstrap circles and students with bounded pagination, account/version validation, cursor-loop protection, and server-side access checks.
- [x] Replicate student/circle changes incrementally with independent cursors and deletion tombstones.
- [x] Download attendance roster bundle for ADMIN, SUPERVISOR, and TEACHER.
- [x] Replay durable outbox operations through the explicitly supported attendance-write handler.
- [x] Refresh cached queries when online, on focus, and periodically; persist the resulting cache.
- [x] Preload common dashboard, public settings, active announcements, unread counters, and first notifications pages.
- [x] Preload default first-page circles and students for staff roles.
- [x] Preload the exact default paginated courses query for staff, with the same query key and role-scoped instructor filter as CoursesPage.
- [x] Preload role-specific reference data already wired in AutomaticOfflineSync.
- [ ] Create a server-owned, versioned resource manifest per role with field minimization, row ACL, payload limits, and offline read/write policy.
- [ ] Add visible download progress, partial-failure reporting, and last-successful-sync time.

## Screens and read-only behavior

- [x] Dashboard retains cached overview data when a refresh fails.
- [x] Notifications retains cached list data when a refresh fails.
- [x] Courses retains cached list data when a refresh fails.
- [x] Students and circles have an offline fallback for their unfiltered first page.
- [x] Students and circles keep already-cached results visible when a background refresh fails, and show a stale-data warning.
- [x] Attendance has an offline roster/read path, including an explicit empty-roster state when the cached circle has no students.
- [ ] Audit exact query keys and response shapes for every preload against its consuming screen (the default CoursesPage key/request scope and attendance circles-options key have been checked; full screen-by-screen audit remains).
- [ ] Support offline search, filters, pagination, and detail pages with explicit limits and clear stale-data warnings.
- [ ] Add explicit offline data contracts/fallbacks for Users, Teachers, Parents, Transfers, Suspensions, Exams, Support, Chat, Settings, Announcements, Staff Attendance, Preparations, Registry, Reports, Certificates, and Media Activities.
- [ ] Verify each screen for each authorized role with network disabled; do not infer coverage from a cached app shell.

## Authentication, authorization, and privacy

- [x] Store minimal account identity after a successful online login to reopen the local app shell offline.
- [ ] Verify first login requires connectivity and that invalid/expired credentials cannot establish a new offline session.
- [ ] Test account switching, logout cache deletion, role downgrade, expired credentials, and re-login.
- [ ] Verify access revocation removes cached data that is no longer authorized.
- [ ] Verify every server sync endpoint re-checks authenticated identity and row-level access; never trust a client-supplied role.

## Writes, replay, and conflicts

- [x] Keep offline write support deliberately narrow; attendance is the only replay handler.
- [x] Persist queued operations locally and classify replay outcomes as applied, retry, conflict, or rejected.
- [ ] Add server-enforced durable idempotency for attendance operation IDs before relying on replay in production.
- [ ] Add conflict/rejection resolution UI and verify duplicate replay and reconnect races.
- [ ] Add domain-specific outbox contracts, validation, and conflict rules before enabling any other offline mutation.
- [ ] Extend incremental change feeds only for explicitly approved resources, including deletion and access-revocation semantics.

## Validation and release

- [x] Document offline-first gaps and release safety requirements.
- [x] PR #133 bootstrap-contract changes merged into main.
- [x] PR #134 preload/default-list changes merged into main.
- [x] PR #137 default CoursesPage query-key/request-scope fix merged into main.
- [x] GitHub Actions build workflow passed on PR #138 head: frontend offline tests/build and backend offline-sync, attendance replay, attendance lock integration tests/build.
- [x] GitHub Actions Android debug build passed on PR #138 head.
- [x] GitHub Actions iOS simulator build passed on PR #138 head.
- [ ] Test interrupted bootstrap, cursor loops, storage quota, schema upgrade, and partial network loss.
- [ ] Run browser tests with network disabled and restored.
- [ ] Run Android and iOS device acceptance tests with network disabled and restored (CI build success does not verify airplane-mode behavior).
- [ ] Close all role/screen/security gates before claiming production readiness.

## Known limitations

- The bootstrap covers circles/students; the attendance bundle covers the roster. Other preloaded resources are a bounded set of explicit queries, not a complete all-screen manifest.
- The change feed currently covers only students and circles.
- Offline write/replay is not general-purpose. Other writes must remain online until their domain-specific validation, conflict rules, and idempotency are implemented.
- There is no server-side durable idempotency ledger for attendance replay request IDs.
- A passing build or unit test is not proof of end-to-end offline behavior on web, Android, and iOS.

## Release safety

- Keep changes on a review branch until CI and the release gates above pass.
- Never log or commit credentials. If credentials were ever committed, rotate/revoke them; deleting a file from the latest revision does not erase repository history.
- Do not advertise "all screens and all data work offline" until each supported role/resource/screen has been verified.
