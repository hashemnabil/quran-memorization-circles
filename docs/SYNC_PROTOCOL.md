# Sync protocol (draft)

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

## Rollout status

This document describes the target contract. The durable journal schema is introduced separately; API push/pull integration, full typed local storage, entity-wide replay, conflict UI, and PostgreSQL integration coverage must be completed and verified before enabling general-purpose offline writes.
