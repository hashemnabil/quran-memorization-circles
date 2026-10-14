# Sync protocol

## Invariants

- PostgreSQL is the source of truth. Clients synchronize only through authenticated REST endpoints; they never connect to the database.
- `GET /offline-sync/bootstrap`, `GET /offline-sync/changes`, and `POST /attendance` retain their existing contracts.
- A change cursor is a monotonically increasing `sync_changes.seq` value. Clients persist the last fully applied sequence per account and advance it only after a page is applied atomically.
- The change log is a transport journal, not an authorization boundary. Every API response must apply `AccessControlService` scopes and entity-specific field allowlists.
- Never replicate passwords, hashes, tokens, session material, private keys, or authentication secrets.
- `ProcessedOperation` keys idempotency by the pair `(accountId, opId)`; replays return the previously stored result instead of applying the mutation again.

## Change records

A change is either `UPSERT` with an allowlisted entity payload, or `DELETE` with no payload (tombstone). A page is ordered by `seq ASC` and bounded by a server-enforced limit. A student moved between circles must be authorized against both the old and new scope; clients must apply the resulting row/tombstone in sequence order.

## Push semantics

Each operation has a stable, client-generated `opId`, entity type, mutation kind, and validated payload. The server validates role/resource scope, validates only explicitly supported fields, and atomically records the domain mutation and idempotency result. Unknown entity types, fields, or mutation kinds fail closed. Network loss after commit is resolved by retrying the same `opId`.

## Conflicts and realtime

Realtime events carry only a hint such as `sync:changes-available` and a sequence watermark. They contain no student or circle records; clients pull authorized changes over REST. Conflicts are explicit states in the local outbox and must not silently overwrite newer server data.

## Supported push operations

`POST /sync/push` takes `{ operations: [...] }` (1–100 operations). Each operation has an ASCII `opId` (1–128 letters, digits, `_` or `-`), `entity: "attendance"` and one of:

- `kind: "record"`, `data: { circleId, date, entries: [{ studentId, status, note? }] }`. IDs must be UUID v4; date must be a real, non-future `YYYY-MM-DD`; entries are bounded to 1–500 distinct students; status is `PRESENT`, `ABSENT` or `EXCUSED`; notes are at most 300 characters. The existing PRESENT-wins / otherwise-first-saved policy applies. The response includes the resolved conflicts and changed count.
- `kind: "correct"`, `baseUpdatedAt` (original ISO UTC timestamp with milliseconds), `data: { id, status, note? }`. A stale version returns `status: "conflict", code: "STALE_VERSION"` and changes nothing. Refresh and explicitly review before submitting a correction with a new opId.

Unknown fields and unsupported entities/kinds are rejected; this endpoint never performs arbitrary database writes. Only admin, supervisor and teacher roles may write, within current server-derived circle/student ACLs. Deleted circles and students fail closed.

Results are `{ version: 1, accountId, results: [{ opId, status, code?, message?, data?, replayed? }] }`. Each operation is its own serializable transaction. A batch is **not** all-or-nothing; transient database failures may occur after earlier operations committed, so retry the same IDs. Valid outcomes and their request fingerprints are stored with the mutation, notification and audit writes. Reusing an ID with changed content is rejected with `OP_ID_REUSED`. Do not prune receipts while offline clients may still replay them. An unknown database failure is never acknowledged as success.

Both frontend drain triggers use one replay handler and send the original durable outbox ID. A write is removed only after an applied acknowledgement matching both account and opId. Transport errors keep the payload; rejection/conflict blocks the queue for review. Outbox writes remain limited to attendance sheets; correction support is server-side only until an offline correction UI is implemented.

## Verification and remaining rollout gates

CI applies the complete Prisma migration history to a disposable PostgreSQL database before the push integration tests. These cover concurrent duplicates, changed-payload IDs, role/resource restrictions, resolved sheet conflicts, stale corrections, revocation and rollback when receipt storage fails. IndexedDB tests cover transport loss, reconnect, stable IDs, account isolation, concurrent drains and invalid acknowledgements.

This is not full-application offline support. Other mutation domains, real-device airplane-mode acceptance, comprehensive end-to-end role workflows, historical hard-delete tombstones, scope-revocation cache invalidation and globally commit-ordered sequence delivery remain release gates. No production deployment or production-data migration is implied by CI success.
