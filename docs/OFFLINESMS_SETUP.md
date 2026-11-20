# OfflineSMS integration

The SMS admin page is at `/admin/sms`. It accepts `.xlsx` (first worksheet) and `.csv` files with header columns, and substitutes `{column name}` variables in a shared template. The phone column is selected separately. All previews and validation happen before a confirmation dialog.

## Server configuration

Set `OFFLINESMS_API_KEY` **only** in the backend deployment's secret environment variables. Do not put it in frontend `VITE_*` variables or commit it to git. Rotate any key shared in chat before deployment. The backend posts to `https://business.offlinesms.com/api/v1/org/messages/send` with `Authorization: Bearer ...` and `{messages:[{phone,title,text}]}` based on the OfflineSMS integration screenshot. Confirm field names and provider response semantics against the untranslated provider documentation before live sending.

The endpoint `/sms/send` requires an authenticated ADMIN, an explicit `confirm: true`, valid recipient numbers, and a maximum of 200 messages per batch. The provider may accept a batch without delivering every message. Do not interpret HTTP 2xx as delivered.

## Remaining work

- Link school student guardian numbers directly to individual notification/warning/summons forms, with per-student reasons and independent app/SMS toggles.
- Add durable per-recipient delivery status and idempotency to avoid double charging on retries.
- Test provider sandbox/low-volume delivery with a rotated key before production.
- Do not send permanent passwords by SMS; use temporary credentials with mandatory reset.
