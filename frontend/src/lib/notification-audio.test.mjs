import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

test('bundled original sounds are playable distinct WAVs, short and below clipping', () => {
  const hashes = new Set();
  for (const name of ['calm', 'electronic', 'clear', 'school', 'soft', 'bright', 'pulse']) {
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
  assert.equal(hashes.size, 7);
});

test('brand review contains only three notification samples and no audio logo', () => {
  const hashes = new Set();
  for (const kind of ['notification']) for (let index = 1; index <= 3; index++) {
    const bytes = readFileSync(new URL(`../../public/brand-concepts/sounds/${kind}-${index}.wav`, import.meta.url));
    assert.equal(bytes.toString('ascii',0,4),'RIFF');assert.equal(bytes.toString('ascii',8,12),'WAVE');
    const duration=bytes.readUInt32LE(40)/bytes.readUInt32LE(28);
    assert.equal(duration,.55);assert.equal(bytes.readUInt32LE(40)+44,bytes.length);
    let peak=0;for(let offset=44;offset<bytes.length;offset+=2)peak=Math.max(peak,Math.abs(bytes.readInt16LE(offset)));
    assert(peak>1000&&peak<27000);hashes.add(createHash('sha256').update(bytes).digest('hex'));
  }
  assert.equal(hashes.size,3);
  const gallery=readFileSync(new URL('../../public/brand-concepts/index.html',import.meta.url),'utf8');
  assert.equal((gallery.match(/<audio /g)||[]).length,3);assert(!gallery.includes('autoplay'));assert(!gallery.includes('audio-logo'));assert(!gallery.includes('عينات الشعار الصوتي'));
});
