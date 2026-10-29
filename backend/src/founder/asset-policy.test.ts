import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assetMime } from './asset-policy';

test('library rejects executable formats, cross-kind uploads and oversized content', () => {
  assert.equal(assetMime('CHAT_BACKGROUND', Buffer.from('<svg onload="alert(1)"></svg>')), null);
  assert.equal(assetMime('CHAT_BACKGROUND', Buffer.from('OggS-audio')), null);
  assert.equal(assetMime('ADHAN_SOUND', Buffer.from([137,80,78,71,13,10,26,10])), null);
  assert.equal(assetMime('OTHER', Buffer.from('OggS-audio')), null);
  assert.equal(assetMime('ADHAN_SOUND', Buffer.alloc(5 * 1024 * 1024 + 1)), null);
  assert.equal(assetMime('ADHAN_SOUND', Buffer.from('OggS-audio')), 'audio/ogg');
  assert.equal(assetMime('PROFILE_COVER', Buffer.from([137,80,78,71,13,10,26,10])), 'image/png');
});
