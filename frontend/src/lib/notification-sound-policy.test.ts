import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseSoundPreferences, audioMime } from './notification-sound-policy';
test('an upgrade retains the existing sound rather than imposing the school tone', () => {
  assert.deepEqual(parseSoundPreferences(null, 'custom'), { sound: 'custom', vibrate: false });
  assert.deepEqual(parseSoundPreferences('{broken', 'calm'), { sound: 'calm', vibrate: false });
  assert.deepEqual(parseSoundPreferences(null, null), { sound: 'default', vibrate: false });
});
test('silence, device default and vibration are saved independently', () => {
  for (const sound of ['silent','default','school','custom']) assert.deepEqual(parseSoundPreferences(JSON.stringify({sound,vibrate:true,channelId:'saved'}), 'clear'), { sound, vibrate:true, channelId:'saved' });
  assert.equal(parseSoundPreferences('{"sound":"untrusted","vibrate":true}', 'bad').sound, 'default');
});
test('file pickers without an audio MIME can use known audio extensions but never executable files', () => {
  assert.equal(audioMime('My tone.MP3', ''), 'audio/mpeg');
  assert.equal(audioMime('tone.wav', 'application/octet-stream'), 'audio/wav');
  assert.equal(audioMime('tone.exe', ''), '');
  assert.equal(audioMime('file.wav', 'text/html'), '');
});
