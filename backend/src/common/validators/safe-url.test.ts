import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assertSafeFileUrl, assertSafeHttpUrl } from './safe-url';
test('file URLs accept HTTPS, old uploads and bounded PDF data; reject executable links', () => {
  for (const value of ['https://school.example/file.pdf', '/uploads/certificates/a.pdf', `data:application/pdf;base64,${Buffer.from('%PDF-1.4\n%%EOF').toString('base64')}`]) assert.doesNotThrow(() => assertSafeFileUrl(value));
  for (const value of ['javascript:alert(1)', 'data:text/html;base64,WA==', 'file:///etc/passwd', '//evil.example', '/uploads/../../secret', 'data:application/pdf;base64,WA==', null]) assert.throws(() => assertSafeFileUrl(value));
});
test('external activity URLs reject unsafe schemes, credentials and control characters', () => {
  assert.doesNotThrow(() => assertSafeHttpUrl('https://school.example/activity'));
  for (const value of ['javascript:alert(1)', 'https://user:pass@school.example', 'https://school.example/\nunsafe']) assert.throws(() => assertSafeHttpUrl(value));
});
