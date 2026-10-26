import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

test('bundled original sounds are playable distinct WAVs, short and below clipping', () => {
  const hashes = new Set();
  for (const name of ['calm', 'electronic', 'clear']) {
    const web = readFileSync(new URL(`../../public/sounds/${name}.wav`, import.meta.url));
    const native = readFileSync(new URL(`../../android/app/src/main/res/raw/school_${name}.wav`, import.meta.url));
    assert.deepEqual(web, native); assert.equal(web.toString('ascii', 0, 4), 'RIFF');
    assert.equal(web.toString('ascii', 8, 12), 'WAVE'); assert.equal(web.readUInt16LE(22), 1);
    const duration = web.readUInt32LE(40) / web.readUInt32LE(28);
    assert.ok(duration > .2 && duration < 1);
    let peak = 0; for (let i = 44; i < web.length; i += 2) peak = Math.max(peak, Math.abs(web.readInt16LE(i)));
    assert.ok(peak > 1000 && peak < 24000);
    hashes.add(createHash('sha256').update(web).digest('hex'));
  }
  assert.equal(hashes.size, 3);
});
