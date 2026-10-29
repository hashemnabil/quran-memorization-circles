// Original review-only sound signatures; no recordings, speech or external samples.
import { mkdirSync, writeFileSync } from 'node:fs';
const directory = new URL('../public/brand-concepts/sounds/', import.meta.url);
mkdirSync(directory, { recursive: true });
const rate = 44100;
const variants = [
  { duration: 2.2, frequency: 740, delay: .24, decay: .34, shimmer: .045 },
  { duration: 2.5, frequency: 620, delay: .42, decay: .43, shimmer: .025 },
  { duration: 2.8, frequency: 880, delay: .32, decay: .48, shimmer: .035 },
];
for (const [index, variant] of variants.entries()) {
  const count = Math.round(rate * variant.duration), samples = new Float64Array(count);
  let peak = 0;
  for (let sample = 0; sample < count; sample++) {
    const time = sample / rate;
    let value = 0;
    // A soft electronic seal and its quieter reflection, without a melody.
    for (const [delay, gain] of [[0, 1], [variant.delay, .28]]) {
      const t = time - delay;
      if (t < 0) continue;
      const envelope = (1 - Math.exp(-t / .035)) * Math.exp(-t / variant.decay);
      const phase = 2 * Math.PI * variant.frequency * t;
      value += gain * envelope * (Math.sin(phase) + .16 * Math.sin(phase * 1.5) + variant.shimmer * Math.sin(phase * 2.003));
    }
    value *= Math.min(1, (variant.duration - time) / .15);
    samples[sample] = value; peak = Math.max(peak, Math.abs(value));
  }
  const bytes = Buffer.alloc(44 + count * 2);
  bytes.write('RIFF'); bytes.writeUInt32LE(bytes.length - 8, 4); bytes.write('WAVEfmt ', 8); bytes.writeUInt32LE(16, 16);
  bytes.writeUInt16LE(1, 20); bytes.writeUInt16LE(1, 22); bytes.writeUInt32LE(rate, 24); bytes.writeUInt32LE(rate * 2, 28);
  bytes.writeUInt16LE(2, 32); bytes.writeUInt16LE(16, 34); bytes.write('data', 36); bytes.writeUInt32LE(count * 2, 40);
  for (let sample = 0; sample < count; sample++) bytes.writeInt16LE(Math.round(samples[sample] / peak * .45 * 32767), 44 + sample * 2);
  writeFileSync(new URL(`audio-logo-${index + 1}.wav`, directory), bytes);
}
console.log('Created three review-only original audio logos (2.2, 2.5, 2.8 seconds); no app integration.');
