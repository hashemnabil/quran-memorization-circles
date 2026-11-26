# OfflineSMS administration

This change builds on PR #345. `/admin/sms` imports XLSX, XLS and CSV on the
server (5 MB, 5,000 recipients, 100 columns), supports column placeholders,
editable recipient values/message overrides, full preview, and campaign history.
Student communications are also available on the existing broadcasts and summons
pages; their existing forms remain available and unchanged.

## Deployment

1. Revoke the previously disclosed provider key and issue a new key. Never put
   keys in browser environment variables, repository files or command arguments.
2. Configure backend secrets:
   - `OFFLINESMS_API_KEY`: the newly issued key.
   - `SMS_ENCRYPTION_KEY`: a separately generated 32-byte random key, base64 encoded.
     Keep a secure backup; changing it while messages are pending makes those
     encrypted messages unreadable.
   - `OFFLINESMS_ENABLED`: leave unset/false until the provider contract has been
     independently verified. Set to `true` to enable queueing and processing.
   - `OFFLINESMS_CONNECTION_CHECK=true`: optional startup authentication probe.
     It posts exactly `{messages:[]}` without authorization and then with the
     configured server key. It never supplies a phone number, message text or
     recipient. A rejected anonymous request followed by HTTP 2xx/400/422 with
     authorization confirms the authentication boundary, not actual delivery or
     the response schema for a nonempty batch. Disable the probe after checking.
     A short validation reason is exposed only for that zero-recipient probe,
     after rejecting credentials, long tokens and contact information. Real
     message failures retain only a fixed classification or HTTP status code.
3. Run `npm --prefix backend run prisma:deploy` against the intended PostgreSQL
   database and deploy both applications. No production database was modified
   during development.
   For the existing unmanaged Neon production database, use the explicit,
   additive recovery in [SMS_SCHEMA_RECOVERY.md](SMS_SCHEMA_RECOVERY.md) instead
   of blindly applying the historical migration chain.
4. Keep at least one backend process running. Its worker polls every two seconds,
   processes at most 20 messages concurrently and uses atomic database claims to
   prevent different server processes sending the same row. No external Redis or
   cron service is required. Monitor queue ages and UNKNOWN records.

The queue stores message text encrypted with AES-256-GCM. History APIs return
only phone, title, status, attempt count and a safe error code. SMS endpoints bypass
the browser offline cache/outbox, preventing message content from being copied to
offline replicas. Phone numbers remain personal data in the protected database;
apply the school's database backup, access and retention policies.

## Provider contract: verification still required

The configured endpoint and request fields match the example supplied for this
task: `POST https://business.offlinesms.com/api/v1/org/messages/send`, bearer
authorization, JSON `{messages:[{phone,title,text}]}`. The provider site could not
be read through the available web tool. No authoritative response schema,
per-message receipt format, delivery webhook, delivery-status endpoint, tariff,
sandbox or provider idempotency contract was available. Tests use local mocked
responses and **never send any real SMS**. They do not establish compatibility
with the provider's actual responses.

The conservative adapter recognizes `ok: true`, `success: true` or `status: "success"` in a
successful JSON response as ACCEPTED, not DELIVERED. Every dispatch currently has
one message, preventing a mixed bulk response from wrongly marking other
recipients successful. Unknown bodies, transport timeouts, HTTP 5xx and process
crashes become UNKNOWN and are never automatically retried. Explicit HTTP
400/401/403/422/429 rejection becomes FAILED. Check these semantics against
provider documentation/sandbox before enabling; adjust the adapter and fixtures
if the provider differs. Delivery reconciliation and exact pricing cannot be
automated without the provider's documented interfaces. Check UNKNOWN and final
delivery in its dashboard; the application does not claim delivery.

## Retry and credentials

The admin-only `GET /sms/readiness` endpoint and one startup log expose only
configuration booleans, schema availability and whether encrypted payloads
exist. They never expose API/encryption keys. Missing provider credentials,
encryption configuration and the send toggle have separate setup errors.
Never replace an existing encryption key when pending encrypted messages exist.
Palestinian mobile numbers beginning with `56`/`59` after Excel removes the
leading zero normalize to `97056`/`97059` in both preview and backend validation.

A persisted request key identifies each send operation. Replaying the same key
returns the same campaign; different content with that key is rejected. The retry
button selects only FAILED messages with fewer than three attempts; it never
replays ACCEPTED, PROCESSING or UNKNOWN messages. Without a documented provider
idempotency key, exactly-once delivery across ambiguous network failures cannot
be guaranteed, so the worker deliberately holds ambiguous sends for review.

Guardian numbers come from current student records. Communications support one
or many students, a circle, all students, shared/per-student reasons, editable
saved templates and APP/SMS/BOTH channels. Preview is compared on confirmation to
reject changed recipients/templates. APP never creates SMS rows and works with
SMS disabled. Warnings and summons require reasons; summons require a date/time.

The credentials message type queues a reset; its worker generates new random temporary passwords, hashes
them using bcrypt, revokes existing sessions and requires password change before
other authenticated HTTP operations. Only encrypted message text retains the
temporary secret for dispatch/retry; plaintext never enters message history or
provider logs. Issuing credentials resets existing passwords, as indicated in
the UI. The worker cancels obsolete queued credentials if the password has since changed. Uploaded password columns and password-labelled custom messages are
rejected; existing permanent passwords are never read or sent.

## Verification

`node --test -r ts-node/register src/notifications/sms.test.ts` from `backend`
covers spreadsheet formats, normalization, missing placeholders, restricted
access, idempotent replay, encryption, APP without SMS, selective retry and mocked
provider acceptance/rejection/ambiguous failures. Existing notification and JWT
tests should also be run, followed by both production builds. Database migration
deployment and real provider validation require the target environment.
