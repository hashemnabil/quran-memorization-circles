import 'fake-indexeddb/auto';
import assert from 'node:assert/strict';
import { beforeEach, after, test } from 'node:test';
import JSZip from 'jszip';
import { db } from './db';
import { configureOffline, mergeRows } from './offline-engine';
import { localRead, localWrite } from './local-api';
import { localReport } from './local-analytics';
import { exportLocalWorkbook } from './local-xlsx';
const student = '00000000-0000-4000-8000-000000000001';
Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { onLine: false } });
Object.defineProperty(globalThis, 'window', { configurable: true, value: new EventTarget() });
beforeEach(async () => {
  for (const table of db.tables) await table.clear();
  configureOffline(async () => { throw new Error('offline'); }, () => 'account');
});
after(() => db.close());
test('search, filters and pagination work without a previously cached query variant', async () => {
  await mergeRows('students', Array.from({ length: 45 }, (_, i) => ({ id: `student-${i}`, fullName: `طالب ${i}`, status: i % 2 ? 'ACTIVE' : 'SUSPENDED', circleId: 'circle', createdAt: `${i}` })));
  const page = await localRead('/students', { status: 'ACTIVE', page: 2, limit: 10 });
  assert.equal(page.data.length, 10); assert.equal(page.meta.total, 22);
  const search = await localRead('/students', { search: 'طالب 41' });
  assert.equal(search.data[0].id, 'student-41');
});

test('student questionnaire updates the own profile immediately and queues one protected action offline', async () => {
  await mergeRows('students', [{ id: student, selfAccountId: 'account', fullName: 'Student', address: 'Before', totalPoints: 50 }]);
  const saved = await localWrite('patch', '/students/me/questionnaire', { address: 'After' });
  assert.equal(saved.synced, 0);
  const own = await localRead('/students/me');
  assert.equal(own.address, 'After');
  assert.equal(own.totalPoints, 50);
  const queue = await db.queue.toArray();
  assert.equal(queue.length, 1);
  assert.equal(queue[0].action, 'questionnaire');
  assert.equal(queue[0].entityId, student);
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
