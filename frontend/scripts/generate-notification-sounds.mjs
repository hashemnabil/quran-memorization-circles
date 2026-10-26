import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

// Original procedural sound design for this project; no third-party recordings.
const root = fileURLToPath(new URL('../', import.meta.url));
const rate = 44100;
const definitions = {
  calm: { duration: .85, events: [[0, 680, .26], [.13, 1020, .18]], modulation: .15 },
  electronic: { duration: .65, events: [[0, 840, .20], [.12, 1120, .22], [.23, 840, .13]], modulation: .6 },
  clear: { duration: .7, events: [[0, 1250, .28], [.09, 1875, .12]], modulation: .25 },
};
for (const [name, definition] of Object.entries(definitions)) {
  const samples = Math.ceil(rate * definition.duration);
  const buffer = Buffer.alloc(44 + samples * 2);
  buffer.write('RIFF', 0); buffer.writeUInt32LE(buffer.length - 8, 4); buffer.write('WAVEfmt ', 8);
  buffer.writeUInt32LE(16, 16); buffer.writeUInt16LE(1, 20); buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(rate, 24); buffer.writeUInt32LE(rate * 2, 28); buffer.writeUInt16LE(2, 32); buffer.writeUInt16LE(16, 34);
  buffer.write('data', 36); buffer.writeUInt32LE(samples * 2, 40);
  for (let i = 0; i < samples; i++) {
    const time = i / rate;
    let value = 0;
    for (const [start, frequency, gain] of definition.events) {
      const t = time - start;
      if (t < 0) continue;
      const envelope = Math.min(1, t / .012) * Math.exp(-t * 9) * Math.min(1, (definition.duration - time) / .04);
      value += gain * envelope * Math.sin(2 * Math.PI * frequency * t + definition.modulation * Math.sin(2 * Math.PI * frequency * 2 * t) * Math.exp(-t * 20));
    }
    buffer.writeInt16LE(Math.round(Math.max(-.65, Math.min(.65, value)) * 32767), 44 + i * 2);
  }
  for (const [folder, filename] of [['public/sounds', `${name}.wav`], ['android/app/src/main/res/raw', `school_${name}.wav`]]) {
    mkdirSync(resolve(root, folder), { recursive: true }); writeFileSync(resolve(root, folder, filename), buffer);
  }
}
