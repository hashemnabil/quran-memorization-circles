import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pdfDataUrlToBlob, safeDownloadHref } from './pdf-download.js';
test('PDF downloads preserve bytes and MIME type', async () => {
  const source = '%PDF-1.4\n%%EOF';
  const blob = pdfDataUrlToBlob(`data:application/pdf;base64,${btoa(source)}`);
  assert.equal(blob.type, 'application/pdf');
  assert.equal(await blob.text(), source);
});
test('unsafe or malformed stored file links cannot execute', () => {
  for (const value of ['javascript:alert(1)', 'data:text/html;base64,WA==', '//evil.example', '/uploads/../private']) assert.equal(safeDownloadHref(value), undefined);
  assert.equal(safeDownloadHref('https://school.example/file.pdf'), 'https://school.example/file.pdf');
  assert.throws(() => pdfDataUrlToBlob('data:application/pdf;base64,WA=='));
});
