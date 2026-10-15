# Request, attendance and messaging notifications

Notifications are scoped to the people concerned, not broadcast with private request content to the entire school. Active decision-makers receive new requests; request owners receive submission confirmations and decisions. Linked students and guardians receive transfer, suspension and examination request updates at their permitted portal links. Certificate/file approval, rejection, readiness and newly published certificates/reports notify the student and guardian. Support tickets notify the submitter when processing starts, on status changes and on public replies; internal reply content remains private.

Student portal examination appointments show the Riyadh date/time, location and remaining time. The existing server reminders run within 24 hours and one hour of the appointment. Cancellations and results also notify the student. These are persisted in-app notifications and realtime delivery while connected; this change does not configure Apple/Google background push delivery when the app is closed.

## Absence policy

- Only unexcused `ABSENT` attendance counts. The existing unique student/date constraint prevents counting duplicate reports as additional days.
- Each new absence notifies the linked student account and guardian, including a warning about repeated absence.
- Week: Saturday 00:00 through the following Saturday, exclusive; two days trigger a dismissal warning, three trigger an administrative review notification.
- Month: Gregorian calendar month; four days trigger a dismissal warning, five trigger an administrative review notification.
- Weekly/monthly alerts are deduplicated per student, recipient, calendar period and threshold using persisted notification metadata under an advisory transaction lock. The same offline operation receipt is replayed without creating notifications again.
- Counts come from saved attendance, including authorized corrections, not from client-provided totals. Corrections do not retract previously delivered warnings; the administrator must inspect the current attendance record before deciding.
- Student status is never changed automatically by this policy. Administration uses the existing suspension/decision workflow if dismissal is warranted.
- Direct attendance, full offline replay and legacy attendance replay share the same alert policy. Attendance and alert inserts share a transaction. Offline-device writes reach other users only after server synchronization; recipients see saved alerts on their next connection/download.

## Messaging and synchronization

Message notifications are persisted for all current conversation members except the sender, whether currently connected or disconnected. Realtime inbox events occur after the message notification exists. Reading a conversation marks that account's corresponding message notifications as read; read events update the other connected devices. The frontend avoids showing a second toast for the same inbox event. Bulk notification events carry the complete persisted row, including its ID, so it can be merged into the local account database. Parent accounts receive realtime revision announcements as well.

No database migration is required. Existing notification JSON metadata and attendance uniqueness are used. Tests cover calendar boundaries, threshold routing and deduplication, all messaging roles, notification row delivery, read scoping, certificate lifecycle and offline replay. The PostgreSQL integration scenario verifies the weekly/monthly policy and that the student remains active pending an administrator decision.
