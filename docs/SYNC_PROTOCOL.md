# Sync protocol (design and rollout status)

## Authority and trust boundary

PostgreSQL and the authenticated NestJS REST API are the only authority. IndexedDB is a per-account cache and durable outbox, never an authorization source. A cached role is presentation-only. The server must derive account identity and role from the authenticated request and apply the existing AccessControlService scopes on every read and write. Unknown entities, invalid cursors, inaccessible records, and unsupported operations fail closed.

## Proposed feed contract

- `GET /sync/snapshot?entity=&cursor=&limit=`: return full permitted records in bounded pages and a stable `snapshotSeq` captured before pagination starts. The client must persist all pages before advancing its feed cursor to that snapshot sequence.
- `GET /sync/changes?since=&limit=`: return ordered feed entries after the cursor, with full permitted records for UPSERT and identifiers for DELETE tombstones. Include `nextSeq` and `hasMore`. A cursor older than retained history must return `410 RESYNC_REQUIRED`.
- `POST /sync/push`: accept ordered operations with client-generated UUID `opId`. Store the operation result atomically with the domain write under a unique `(accountId, opId)` constraint. A retry of a committed operation must return the stored result.

These endpoints are a target contract, not a claim that the complete server implementation is already deployed. Existing `/offline-sync/bootstrap` and `POST /attendance` remain available for installed clients.

## Conflict policy

- Attendance: PRESENT wins over a non-PRESENT value, preserving the existing domain rule.
- Recitations and other append-only records: do not overwrite an existing record; represent each submission as a distinct operation and reject invalid duplicate identities.
- Student and circle profile fields: server `updatedAt` is authoritative for last-write-wins. For explicitly sensitive fields, compare `baseVersion` and return a conflict if the server record changed since the client base.
- A conflict must preserve both local and server versions. Never silently discard a queued local edit. A blocked operation prevents later operations in the same account queue from overtaking it.

## Visibility changes and tombstones

Feed entries must be filtered using server-side access control, not client-provided roles or IDs. If a previously visible record becomes inaccessible (for example, a student is transferred to another circle), the old scope must receive a tombstone so its local cache cannot retain stale access. Payloads on realtime notifications should contain no record data; clients should use the authenticated changes endpoint to fetch authorized updates.

## Retention and recovery

Retain feed history and idempotency records for a documented bounded period (proposed: 90 days). If the client's cursor predates the retained feed, require a complete snapshot. A network timeout is transient: retain queued operations and retry with exponential backoff; do not report synchronization as permanently failed solely because a hosted service was cold-starting.

## Local storage and account isolation

Use separate local records keyed by authenticated account ID, and never replay one account's queue under another account. Explicit logout should clear that account's local database and queued operations. IndexedDB is not encrypted by default; shared-device retention and sensitive-data policy require an owner decision.

## Manual acceptance scenario

1. Sign in as an authorized teacher on device A and device B; wait for a complete initial download on both.
2. Put device A offline, create a student or record attendance, and confirm the UI marks the operation pending.
3. Restore connectivity on A. Confirm the queue is pushed before the feed is pulled and the pending count decreases only after a server result is recorded.
4. Keep B open. Confirm a realtime `sync:changes-available` notification causes B to pull the feed and render the change without a reload.
5. Repeat with a transfer between circles and verify the former teacher's local cache receives a tombstone and cannot view the moved student's data.

This scenario is a test plan; it must be executed against two real sessions before declaring end-to-end sync complete.
