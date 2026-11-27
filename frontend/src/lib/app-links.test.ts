import assert from 'node:assert/strict';
import { test } from 'node:test';
import { nativeRouteFromUrl } from './app-links';

test('verified chat invite opens chat with its query', () => {
  assert.equal(nativeRouteFromUrl('https://quran-frontend-sknr.onrender.com/chat?join=ABC'), '/chat?join=ABC');
});

test('verified conversation link keeps its ID and query', () => {
  assert.equal(nativeRouteFromUrl('https://quran-frontend-sknr.onrender.com/chat/123?from=notification'), '/chat/123?from=notification');
});

test('custom scheme still opens chat', () => {
  assert.equal(nativeRouteFromUrl('halaqat://chat?join=ABC'), '/chat?join=ABC');
  assert.equal(nativeRouteFromUrl('halaqat://chat/123'), '/chat/123');
});

test('rejects untrusted hosts and unrelated paths', () => {
  for (const url of [
    'http://quran-frontend-sknr.onrender.com/chat',
    'https://evil.example/chat',
    'https://quran-frontend-sknr.onrender.com/chatroom',
    'https://quran-frontend-sknr.onrender.com/chat/123/more',
    'halaqat://evil/chat',
    'not a URL',
  ]) {
    assert.equal(nativeRouteFromUrl(url), null, url);
  }
});
