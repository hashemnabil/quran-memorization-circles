# Media plan and teacher duty schedules

- Media plan: `/media-schedule`, in the media navigation group. Administrator only,
  both in route authorization and server read/write synchronization.
- Duty plan: `/teacher-duties`, in administrative affairs. Administrators edit;
  administrators, supervisors and teachers view the full schedule and export it.
- Fields: date, weekday, activity, idea and content for media; date, weekday,
  multiple teachers and notes for duties. Selecting a date fills its weekday.
- Both Excel exports generate `.xlsx` on the device, including offline.
  Browsers download directly. Android/iOS use Capacitor Filesystem and Share
  to write a local cache file and open the device's save/share sheet.
- Dexie v2 adds account-scoped `mediaPlans`, `teacherDuties`, `dutyTeachers`.
  Existing IndexedDB databases upgrade without removing old tables or queues.
- Local create/update/delete uses the same durable queue and authenticated,
  idempotent batch replay as other offline entities. The administrator's cached
  teacher roster supplies names without requiring network access.
- Assignment and changed-date notifications are persisted on server synchronization.
  Removed teachers and canceled duties get cancellation notifications.
- The server checks reminders every minute: tomorrow's duties and today's duties
  after 08:00 in Asia/Riyadh. Claims and notification inserts share a database
  transaction, preventing a failed insert from permanently consuming a reminder.
- A teacher's cached assignment shows a local today/tomorrow reminder inside the
  open application without internet. Other devices receive newly assigned duties
  after synchronization. This does not implement OS push notifications while the
  application is closed or allow cross-device delivery without a network.
- The web implementation is shared by browser, Android and iOS Capacitor builds.
  iOS project compilation/signing requires macOS, Xcode and CocoaPods.

Deploy the existing Prisma migrations, including
`20261014220000_media_teacher_duty_tables`, before enabling schedule synchronization.
No schema changes to the server are needed for this extension.
