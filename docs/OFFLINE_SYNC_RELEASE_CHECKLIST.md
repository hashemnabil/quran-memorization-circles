# Offline-first sync release checklist

This checklist is intentionally conservative. The feature branch is a staged foundation, not authorization to enable full offline writes in production.

## Before any deployment

- [ ] Rotate the database credential and Cloudinary API key/secret that were present in the previously tracked environment file. Do not paste credentials into issues, pull requests, CI logs, or chat.
- [ ] Coordinate repository-history cleanup for the removed environment file. Removing a file from the current tree does not remove it from old commits; use a reviewed history rewrite and coordinate the required force-push with repository owners.
- [ ] Confirm production backups and a tested restore procedure.
- [ ] Review role scopes and the exact student/circle fields allowed in an offline replica with the data owner.
- [ ] Do not run migrations, seeds, resets, destructive scripts, or data cleanup against production as part of this PR.

## Required engineering gates before enabling sync

- [ ] Replace the current timestamp/id query feed with a durable, transactionally written change log or equivalent checkpointed feed. A mutable-row query can miss updates that happen behind an already-advanced cursor and cannot reliably report hard deletes or records that leave a user's access scope.
- [ ] Add a server-side idempotency ledger keyed by authenticated account + client operation ID. Persist the operation result atomically with the domain write; define retention, payload-hash mismatch behavior, and concurrent duplicate handling.
- [ ] Define and test deletion and access-revocation semantics. A client must not retain rows after a user loses access to a student or circle.
- [ ] Add explicit conflict responses and a user-visible resolution flow; do not silently overwrite newer server data.
- [ ] Wire IndexedDB snapshots to the relevant read screens with loading/error states and ensure account changes cannot show another account's cached data.
- [ ] Keep offline write queueing allowlisted per endpoint. Do not queue arbitrary POST/PATCH/PUT/DELETE requests.
- [ ] Add integration tests against an isolated disposable database for duplicate delivery, concurrent replay, revoked access, deletion, and rollback. Do not point test suites at production.
- [ ] Perform a two-device acceptance test: device A offline edits, device B changes the same record online, device A reconnects, app restarts mid-sync, and the user logs out/in to another account.

## CI and review

- [ ] Require backend/frontend build and unit tests plus Android/iOS build checks to pass for the final PR head.
- [ ] Review all dependency-lock changes and confirm clean install from lockfiles.
- [ ] Review the final diff for credentials and personally identifiable data.
- [ ] Keep the PR draft until the gates above are addressed and a maintainer explicitly approves promotion. Do not merge automatically.

## Current scope in this branch

Implemented: bounded permission-scoped student/circle bootstrap and incremental query endpoint, IndexedDB replica/cursors, an allowlisted attendance outbox, account-scoped local cleanup on logout, tests, and documentation.

Not yet implemented: durable append-only change feed, server-side request idempotency ledger, complete offline screen integration, generalized offline write support, robust access-revocation tombstones, and two-device acceptance coverage. Treat the current change feed as an initial sync foundation, not a lossless replication protocol.
