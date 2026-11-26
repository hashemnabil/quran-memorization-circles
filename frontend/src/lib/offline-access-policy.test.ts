import { test } from 'node:test';
import assert from 'node:assert/strict';
import { withinOfflineWindow } from './offline-access-policy';
test('offline verification expires at 30 days without trusting a rolled-back clock', () => {
  const at = 100000;
  assert(withinOfflineWindow(at, at + 29 * 86400000));
  assert.equal(withinOfflineWindow(at, at + 30 * 86400000), false);
  assert.equal(withinOfflineWindow(at, at - 1), false);
  assert.equal(withinOfflineWindow(NaN, at), false);
});
