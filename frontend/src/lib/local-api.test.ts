import 'fake-indexeddb/auto';
import assert from 'node:assert/strict';
import { beforeEach, after, test } from 'node:test';
import JSZip from 'jszip';
import { db } from './db';
import { configureOffline, mergeRows } from './offline-engine';
import { localRead, localWrite, rememberRead } from './local-api';
import { localReport } from './local-analytics';
import { exportLocalWorkbook } from './local-xlsx';
import { clearAccountData } from './account-cleanup';
import { enqueueOfflineOperation, clearOfflineOperations } from './offline/outbox';
import { cachedImage } from './offline-images';
const student = '00000000-0000-4000-8000-000000000001';
Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { onLine: false } });
Object.defineProperty(globalThis, 'window', { configurable: true, value: new EventTarget() });
beforeEach(async () => {
  for (const table of db.tables) await table.clear();
  configureOffline(async () => { throw new Error('offline'); }, () => 'account');
});
after(() => db.close());

test('a late image response cannot repopulate a signed-out account', async () => {
  const originalFetch = globalThis.fetch;
  let release!: (response: Response) => void;
  let started!: () => void;
  const requestStarted = new Promise<void>(resolve => { started = resolve; });
  globalThis.fetch = (() => new Promise<Response>(resolve => { release = resolve; started(); })) as typeof fetch;
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { onLine: true } });
  try {
    const pending = cachedImage('https://images.example/student.png');
    await requestStarted;
    configureOffline(async () => { throw new Error('offline'); }, () => 'other');
    release(new Response(new Blob(['image'], { type: 'image/png' }), { headers: { 'content-type': 'image/png' } }));
    assert.equal(await pending, undefined);
    assert.equal(await db.responses.count(), 0);
  } finally {
    globalThis.fetch = originalFetch;
    Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { onLine: false } });
  }
});

test('account cleanup refuses both pending journals and removes only the selected clean account', async () => {
  const row = { id: 'student', accountId: 'account', synced: 1, updatedAt: new Date().toISOString() };
  await db.students.bulkPut([row, { ...row, accountId: 'other' }]);
  await db.queue.add({ accountId: 'account', opId: 'pending', table: 'students', action: 'create', entityId: 'student', data: {}, createdAt: row.updatedAt });
  await assert.rejects(clearAccountData('account'));
  assert.equal(await db.students.count(), 2); assert.equal(await db.queue.count(), 1);
  await db.queue.clear();
  await enqueueOfflineOperation({ accountId: 'account', resource: 'attendance-sheet', method: 'POST', path: '/attendance', payload: { circleId: '11111111-1111-4111-8111-111111111111', date: '2026-01-01', entries: [{ studentId: student, status: 'PRESENT' }] } });
  await assert.rejects(clearAccountData('account'));
  assert.equal(await db.students.count(), 2);
  await clearOfflineOperations('account');
  await clearAccountData('account');
  assert.equal(await db.students.where('accountId').equals('account').count(), 0);
  assert.equal(await db.students.where('accountId').equals('other').count(), 1);
});

test('pending activity and course registrations appear in their own lists before sync', async () => {
  const activity = await localWrite('post', '/students', { fullName: 'Activity student', registrationTrack: 'ACTIVITY' });
  const course = await localWrite('post', '/students', { fullName: 'Course student', registrationTrack: 'COURSE', courseId: 'course-one' });
  assert.deepEqual((await localRead('/students', { track: 'ACTIVITY' })).data.map((row: any) => row.id), [activity.id]);
  assert.deepEqual((await localRead('/students', { track: 'COURSE', courseId: 'course-one' })).data.map((row: any) => row.id), [course.id]);
  assert.equal((await localRead('/students', { track: 'COURSE', courseId: 'another-course' })).meta.total, 0);
  assert.equal((await localRead('/students', { track: 'CIRCLE' })).meta.total, 0);
  assert.equal((await db.queue.toArray())[1].data.courseId, 'course-one');
});
test('staff attendance remains editable offline and queued for server sync', async () => {
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { getItem: () => JSON.stringify({ id: 'account', role: 'SUPERVISOR', fullName: 'Supervisor' }) } });
  const date = '2026-10-22';
  const sheet = { date, alreadyRecorded: false, canSubmit: true, staff: [{ id: student, fullName: 'Teacher', attendance: null }] };
  await rememberRead('/staff-attendance/sheet', { date, role: undefined }, sheet);
  await localWrite('post', '/staff-attendance', { date, entries: [{ userId: student, status: 'PRESENT' }] });
  const local = await localRead('/staff-attendance/sheet', { date, role: undefined });
  assert.equal(local.staff[0].attendance.status, 'PRESENT');
  assert.equal(local.alreadyRecorded, true);
  const operation = await db.queue.where('accountId').equals('account').first();
  assert.ok(operation);
  assert.equal(operation.table, 'staffAttendance');
  assert.equal(operation.data.entries[0].userId, student);
});
test('course attendance can be recorded from its cached roster while offline', async () => {
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { getItem: () => JSON.stringify({ id: 'account', role: 'TEACHER', fullName: 'Teacher' }) } });
  const courseId = '00000000-0000-4000-8000-000000000002', date = '2026-10-22';
  const path = `/courses/${courseId}/attendance/sheet`;
  await rememberRead(path, { date }, { course: { id: courseId, name: 'Course' }, date, students: [{ id: student, fullName: 'Student', attendance: null }] });
  await localWrite('post', `/courses/${courseId}/attendance`, { date, entries: [{ studentId: student, status: 'EXCUSED', note: 'ill' }] });
  const local = await localRead(path, { date });
  assert.equal(local.students[0].attendance.status, 'EXCUSED');
  const operation = await db.queue.where('accountId').equals('account').first();
  assert.equal(operation?.table, 'courseAttendance');
  assert.equal(operation?.data.courseId, courseId);
});
test('published donation campaign and payment methods are visible offline and admin settings edit queues locally', async () => {
  await mergeRows('schoolSettings', [{ id: 'default', donationsEnabled: true, donationTitle: 'Support classes', donationGoalAmount: 1000, donationRaisedAmount: 250, donationMethod: 'Ask the school office', donationBankPalestine: '000-123', donationPalPay: '0590000000' }]);
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { getItem: () => JSON.stringify({ id: 'account', role: 'STUDENT', fullName: 'Student' }) } });
  const publicSettings = await localRead('/settings/public');
  assert.equal(publicSettings.donationsEnabled, true);
  assert.equal(publicSettings.donationRaisedAmount, 250);
  assert.equal(publicSettings.donationBankPalestine, '000-123');
  assert.equal(publicSettings.donationPalPay, '0590000000');
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { getItem: () => JSON.stringify({ id: 'account', role: 'ADMIN', fullName: 'Admin' }) } });
  await localWrite('patch', '/settings', { donationRaisedAmount: 300 });
  assert.equal((await localRead('/settings')).donationRaisedAmount, 300);
  const operation = await db.queue.where('accountId').equals('account').first();
  assert.equal(operation?.table, 'schoolSettings');
  assert.equal(operation?.data.donationRaisedAmount, 300);
});
test('preparations, evaluation and completed surahs stay usable and queued offline', async () => {
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { getItem: () => JSON.stringify({ id: 'account', role: 'TEACHER', fullName: 'Teacher' }) } });
  await mergeRows('students', [{ id: student, fullName: 'Student', circleId: 'circle', circle: { id: 'circle', name: 'Circle' } }]);
  const preparation = await localWrite('post', '/preparations', { studentId: student, fromSurah: 'البقرة', fromAyah: 1, toSurah: 'البقرة', toAyah: 5 });
  assert.equal((await localRead('/preparations', { studentId: student })).data[0].id, preparation.id);
  await localWrite('patch', `/preparations/${preparation.id}/complete`, {});
  assert.ok((await localRead('/preparations', { studentId: student })).data[0].completedAt);
  await localWrite('patch', `/students/${student}/evaluation`, { evaluation: 'EXCELLENT', note: 'متقن' });
  const completion = await localWrite('post', `/students/${student}/surahs`, { surah: 'الفاتحة', points: 3 });
  assert.equal((await localRead(`/students/${student}/surahs`))[0].id, completion.id);
  assert.equal((await db.queue.toArray()).length, 4);
});
test('admin announcements and media activities are readable and editable offline', async () => {
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { getItem: () => JSON.stringify({ id: 'account', role: 'ADMIN', fullName: 'Admin' }) } });
  const notice = await localWrite('post', '/announcements', { title: 'تنويه', body: 'نص الإعلان', audience: [] });
  assert.equal((await localRead('/announcements/active'))[0].id, notice.id);
  const activity = await localWrite('post', '/media-activities', { type: 'DESIGN', title: 'نشاط', description: 'وصف النشاط', activityDate: '2026-10-22' });
  assert.equal((await localRead('/media-activities')).at(0).id, activity.id);
  await localWrite('patch', `/announcements/${notice.id}`, { isActive: false });
  assert.equal((await localRead('/announcements/active')).length, 0);
  await localWrite('delete', `/media-activities/${activity.id}`, {});
  assert.equal((await localRead('/media-activities')).length, 0);
  assert.deepEqual((await db.queue.toArray()).map(row => row.table), ['announcements', 'mediaActivities', 'announcements', 'mediaActivities']);
});
test('a student certificate request is visible offline and queued for server review', async () => {
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { getItem: () => JSON.stringify({ id: 'account', role: 'STUDENT', fullName: 'Student' }) } });
  await mergeRows('students', [{ id: student, selfAccountId: 'account', fullName: 'Student' }]);
  const request = await localWrite('post', '/certificates/requests', { kind: 'MONTHLY_REPORT', periodFrom: '2026-10-01', periodTo: '2026-10-22', requestNote: 'نسخة للشهر' });
  assert.equal((await localRead('/certificates/requests/mine'))[0].id, request.id);
  assert.equal((await db.queue.toArray())[0].table, 'certificateRequests');
  assert.equal((await db.queue.toArray())[0].action, 'create');
});
test('search, filters and pagination work without a previously cached query variant', async () => {
  await mergeRows('students', Array.from({ length: 45 }, (_, i) => ({ id: `student-${i}`, fullName: `طالب ${i}`, status: i % 2 ? 'ACTIVE' : 'SUSPENDED', circleId: 'circle', createdAt: `${i}` })));
  const page = await localRead('/students', { status: 'ACTIVE', page: 2, limit: 10 });
  assert.equal(page.data.length, 10); assert.equal(page.meta.total, 22);
  const search = await localRead('/students', { search: 'طالب 41' });
  assert.equal(search.data[0].id, 'student-41');
});

test('student questionnaire queues a review without changing the approved student profile', async () => {
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { getItem: () => JSON.stringify({ id: 'account', role: 'STUDENT' }) } });
  await mergeRows('students', [{ id: student, selfAccountId: 'account', fullName: 'Student', address: 'Before', totalPoints: 50 }]);
  const saved = await localWrite('patch', '/students/me/questionnaire', { address: 'After' });
  assert.equal(saved.synced, 0);
  const own = await localRead('/students/me');
  assert.equal(own.address, 'Before');
  assert.equal(own.totalPoints, 50);
  const queue = await db.queue.toArray();
  assert.equal(queue.length, 1);
  assert.equal(queue[0].table, 'profileReviews');
  assert.equal(queue[0].action, 'create');
  assert.equal(queue[0].data.patch.address, 'After');
  assert.equal((await db.table('profileReviews').get(['account', saved.id]))?.status, 'PENDING');
  assert.equal(queue[0].data.totalPoints, undefined);
});
test('attendance sheet and grouped history reflect a newly queued local sheet', async () => {
  await mergeRows('circles', [{ id: 'circle', name: 'الحلقة' }]);
  await mergeRows('students', [{ id: student, fullName: 'طالب', circleId: 'circle' }]);
  await localWrite('post', '/attendance', { circleId: 'circle', date: '2026-10-15', entries: [{ studentId: student, status: 'PRESENT' }] });
  const sheet = await localRead('/attendance/sheet', { circleId: 'circle', date: '2026-10-15' });
  assert.equal(sheet.students[0].attendance.status, 'PRESENT');
  const history = await localRead('/attendance/history');
  assert.equal(history.data[0].present, 1);
});
test('recitation day detail contains pending records and local student names', async () => {
  await mergeRows('students', [{ id: student, fullName: 'طالب', circleId: 'circle' }]);
  await localWrite('post', '/recitations', { studentId: student, date: '2026-10-15', pagesCount: 2, versesCount: 10, mistakes: 1, warnings: 1 });
  const history = await localRead('/recitations/history/2026-10-15/circle');
  assert.equal(history.students[0].student.fullName, 'طالب');
  assert.equal(history.totals.points, 8.75);
});
test('report totals include unsynced work and honor the requested date range', async () => {
  await localWrite('post', '/attendance', { circleId: 'circle', date: '2026-10-15', entries: [{ studentId: student, status: 'ABSENT' }] });
  const report = await localReport({ type: 'attendance', from: '2026-10-15', to: '2026-10-15' });
  assert.equal(report.stats.absent, 1);
  assert.equal((await localReport({ type: 'attendance', from: '2026-10-16' })).stats.total, 0);
});
test('nested routes are not incorrectly answered with a list row', async () => {
  await mergeRows('circles', [{ id: student, name: 'الحلقة' }]);
  assert.equal(await localRead(`/circles/${student}/history`), undefined);
});
test('new offline teachers have the nested user shape required by their page', async () => {
  const teacher = await localWrite('post', '/teachers', { fullName: 'معلم جديد', username: 'newteacher', phone: '0500000000' });
  assert.equal(teacher.user.fullName, 'معلم جديد');
  const list = await localRead('/teachers');
  assert.equal(list.data[0].user.username, 'newteacher');
});
test('media schedule can be created, edited and removed entirely offline', async () => {
  const row = await localWrite('post', '/schedules/media', { date: '2026-10-15', day: 'الخميس', activity: 'تصوير', idea: 'التخرج', content: 'فيديو' });
  await localWrite('patch', `/schedules/media/${row.id}`, { date: '2026-10-16', day: 'الجمعة', activity: 'نشر', idea: 'التخرج', content: 'صور' });
  assert.equal((await localRead('/schedules/media'))[0].activity, 'نشر');
  await localWrite('delete', `/schedules/media/${row.id}`, {});
  assert.deepEqual(await localRead('/schedules/media'), []);
  assert.equal(await db.queue.count(), 3);
});
test('offline teacher duties preserve selected teacher names', async () => {
  await mergeRows('dutyTeachers', [{ id: 'teacher1', fullName: 'المحفظ الأول' }, { id: 'teacher2', fullName: 'المحفظ الثاني' }]);
  const row = await localWrite('post', '/schedules/duties', { date: '2026-10-15', day: 'الخميس', note: '', teacherUserIds: ['teacher1', 'teacher2'] });
  assert.deepEqual(row.assignments.map((a: any) => a.teacherName), ['المحفظ الأول', 'المحفظ الثاني']);
  assert.equal((await localRead('/schedules/duties')).length, 1);
});
test('offline Excel export produces a valid workbook archive with escaped text', async () => {
  const blob = await exportLocalWorkbook([{ الطالب: '<طالب & اسم>', العلامة: 90 }]);
  const archive = await JSZip.loadAsync(await blob.arrayBuffer());
  const sheet = await archive.file('xl/worksheets/sheet1.xml')!.async('string');
  assert.match(sheet, /&lt;طالب &amp; اسم&gt;/); assert.match(sheet, /<v>90<\/v>/);
  assert.ok(archive.file('[Content_Types].xml')); assert.ok(archive.file('xl/workbook.xml'));
});
