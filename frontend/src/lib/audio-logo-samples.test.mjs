import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
test('three distinct review-only audio logos have valid WAV headers and no clipping', () => {
  const hashes = new Set();
  for (let index = 1; index <= 3; index++) {
    const bytes = readFileSync(new URL(`../../public/brand-concepts/sounds/audio-logo-${index}.wav`, import.meta.url));
    assert.equal(bytes.toString('ascii', 0, 4), 'RIFF'); assert.equal(bytes.toString('ascii', 8, 12), 'WAVE');
    assert.equal(bytes.readUInt32LE(40) + 44, bytes.length); assert.equal(bytes.readUInt16LE(34), 16);
    const duration = bytes.readUInt32LE(40) / bytes.readUInt32LE(28); assert.ok(duration >= 2 && duration <= 3);
    let peak = 0; for (let offset = 44; offset < bytes.length; offset += 2) peak = Math.max(peak, Math.abs(bytes.readInt16LE(offset)));
    assert.ok(peak > 1000 && peak < 24000); hashes.add(createHash('sha256').update(bytes).digest('hex'));
  }
  assert.equal(hashes.size, 3);
  const page = readFileSync(new URL('../../public/brand-concepts/audio-review.html', import.meta.url), 'utf8');
  assert.equal((page.match(/<audio /g) || []).length, 3); assert.ok(!page.includes('autoplay'));
});
