import { test } from 'node:test';
import assert from 'node:assert/strict';
import { popupVisible, safePopupLink } from './popup-policy';
const now = new Date('2026-10-29T12:00:00Z');
const row = { isActive: true, audience: [] as string[], publishedAt: new Date('2026-10-28'), expiresAt: new Date('2026-10-30'), popup: { placement: 'BOTH', repeat: 'ONCE_DEVICE', state: 'PUBLISHED', priority: 0, requireAck: false, important: false, buttonText: '', imageAssetId: '' } };
test('private audiences never become public even when placement is both', () => {
  assert.equal(popupVisible({ ...row, audience: ['TEACHER'] }, undefined, now), false);
  assert.equal(popupVisible({ ...row, audience: ['TEACHER'] }, 'STUDENT', now), false);
  assert.equal(popupVisible({ ...row, audience: ['TEACHER'] }, 'TEACHER', now), true);
  assert.equal(popupVisible(row, undefined, now), true);
});
test('draft, stopped, future, expired and malformed notices do not display', () => {
  assert.equal(popupVisible({ ...row, isActive: false }, 'STUDENT', now), false);
  assert.equal(popupVisible({ ...row, expiresAt: now }, 'STUDENT', now), false);
  assert.equal(popupVisible({ ...row, publishedAt: new Date('2027-01-01') }, 'STUDENT', now), false);
  for (const state of ['DRAFT', 'STOPPED']) assert.equal(popupVisible({ ...row, popup: { ...row.popup, state } }, 'STUDENT', now), false);
  assert.equal(popupVisible({ ...row, popup: {} }, undefined, now), false);
});
test('popup actions reject script URLs, credentials, protocol-relative paths and encoded redirects', () => {
  for (const link of ['javascript:alert(1)', '//evil.test', '/%2fexample.test', '/\\example.test', 'https://user:password@example.test', 'data:text/html,test']) assert.equal(safePopupLink(link), false);
  assert.equal(safePopupLink('/prayer-times'), true);
  assert.equal(safePopupLink('https://example.org/news'), true);
});
