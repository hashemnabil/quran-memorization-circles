import 'fake-indexeddb/auto';
import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';
import { PDFDocument } from 'pdf-lib';
import { db } from './db';
import { configureOffline, mergeRows, get } from './offline-engine';
import { queueCertificateDraft } from './local-certificates';
import { rememberRead } from './local-api';
let role = 'ADMIN'; const account = 'certificate-admin';
Object.assign(globalThis, { window: new EventTarget(), localStorage: { getItem: () => JSON.stringify({ id: account, role }) } });
Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { onLine: false } });
beforeEach(async () => {
  role = 'ADMIN'; for (const table of db.tables) await table.clear();
  configureOffline(async () => { throw new Error('offline'); }, () => account);
  await mergeRows('students', [{ id: 'student', fullName: 'Test student' }]);
});
async function input() {
  const pdf = await PDFDocument.create(); pdf.addPage();
  return { studentId: 'student', kind: 'HONOR', title: 'Certificate', fileUrl: 'data:application/pdf;base64,' + await pdf.saveAsBase64() };
}
const preview = async (url: string) => {
  const pdf = await PDFDocument.load(url.split(',')[1]); pdf.setSubject('LOCAL DRAFT');
  return 'data:application/pdf;base64,' + await pdf.saveAsBase64();
};
test('certificate preview and original survive closing the database without claiming approval', async () => {
  const data = await input(); const draft = await queueCertificateDraft('issue', data, preview);
  assert.equal(draft.synced, 0); assert.equal(draft.issuedAt, null); assert.equal(draft.issuancePending, true);
  assert.notEqual(draft.fileUrl, data.fileUrl); db.close(); await db.open();
  const stored = (await get('certificates'))[0], op = (await db.queue.toArray())[0];
  assert.equal(stored.fileUrl, draft.fileUrl); assert.equal(op.data.fileUrl, data.fileUrl);
  assert.equal(op.data._localPreviewUrl, undefined);
  assert.equal((await PDFDocument.load(stored.fileUrl.split(',')[1])).getSubject(), 'LOCAL DRAFT');
});
test('invalid files, missing students and unauthorized issuers never create pending certificates', async () => {
  const data = await input(); role = 'TEACHER';
  await assert.rejects(queueCertificateDraft('issue', data, preview)); role = 'ADMIN';
  await assert.rejects(queueCertificateDraft('issue', { ...data, studentId: 'unknown' }, preview));
  await assert.rejects(queueCertificateDraft('issue', { ...data, fileUrl: 'data:application/pdf;base64,bm90UERG' }, preview));
  assert.equal(await db.queue.count(), 0);
});
test('monthly drafts require a report cached for the exact selected period', async () => {
  const data = { ...await input(), from: '2026-10-01', to: '2026-10-28', reportDraft: { attendance: 'forged' } };
  await assert.rejects(queueCertificateDraft('publish-monthly-report', data, preview));
  await rememberRead('/certificates/monthly-report-data', { from: data.from, to: data.to }, [{ id: 'student', attendance: { present: 4 } }]);
  const draft = await queueCertificateDraft('publish-monthly-report', data, preview);
  assert.equal(draft.status, 'PENDING');
  assert.deepEqual((await db.queue.toArray())[0].data.reportDraft.attendance, { present: 4 });
  assert.equal((await get('certificateRequests'))[0].issuancePending, true);
});
