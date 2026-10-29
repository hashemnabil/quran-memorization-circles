import test from 'node:test';
import assert from 'node:assert/strict';
import { shouldRetryReadRequest, readRetryDelayMs } from './retry-policy.js';

test('retries transient GET transport and server failures only', () => {
  assert.equal(shouldRetryReadRequest({ method: 'get', hasResponse: false }), true);
  assert.equal(shouldRetryReadRequest({ method: 'GET', status: 408 }), true);
  assert.equal(shouldRetryReadRequest({ method: 'get', status: 429 }), true);
  assert.equal(shouldRetryReadRequest({ method: 'get', status: 503 }), true);
  assert.equal(shouldRetryReadRequest({ method: 'get', status: 404 }), false);
  assert.equal(shouldRetryReadRequest({ method: 'get', status: 401 }), false);
});

test('never retries mutations, cancellation, or beyond the retry limit', () => {
  assert.equal(shouldRetryReadRequest({ method: 'post', hasResponse: false }), false);
  assert.equal(shouldRetryReadRequest({ method: 'patch', status: 503 }), false);
  assert.equal(shouldRetryReadRequest({ method: 'get', hasResponse: false, code: 'ERR_CANCELED' }), false);
  assert.equal(shouldRetryReadRequest({ method: 'get', hasResponse: false, attempts: 2 }), false);
});

test('uses bounded exponential delays', () => {
  assert.equal(readRetryDelayMs(0), 500);
  assert.equal(readRetryDelayMs(1), 1000);
  assert.equal(readRetryDelayMs(2), 1000);
});
