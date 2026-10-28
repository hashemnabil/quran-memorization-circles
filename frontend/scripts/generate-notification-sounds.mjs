// Original notification-only synthesis. No samples or third-party recordings.
import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const output = fileURLToPath(new URL('../public/sounds/', import.meta.url));
const native = fileURLToPath(new URL('../android/app/src/main/res/raw/', import.meta.url));
mkdirSync(output, { recursive: true }); mkdirSync(native, { recursive: true });
const definitions = {
 school: { duration: .62, voices: [{ hz: 932, at: 0, gain: .65, decay: .082 }, { hz: 1398, at: .085, gain: .30, decay: .072 }] },
 soft: { duration: .58, voices: [{ hz: 740, at: 0, gain: .65, decay: .095 }, { hz: 1110, at: .055, gain: .18, decay: .075 }] },
 bright: { duration: .51, voices: [{ hz: 1046, at: 0, gain: .59, decay: .066 }, { hz: 1569, at: .075, gain: .22, decay: .055 }] },
 pulse: { duration: .55, voices: [{ hz: 880, at: 0, gain: .55, decay: .055 }, { hz: 1174, at: .105, gain: .32, decay: .065 }] },
};
for (const [name, { duration, voices }] of Object.entries(definitions)) {
 const rate = 44100, count = Math.round(rate * duration), samples = new Float64Array(count); let peak = 0;
 for (let index = 0; index < count; index++) {
  const time = index / rate; let value = 0;
  for (const voice of voices) {
   const t = time - voice.at; if (t < 0) continue;
   const envelope = (1 - Math.exp(-t / .007)) * Math.exp(-t / voice.decay);
   const phase = 2 * Math.PI * voice.hz * t;
   value += voice.gain * envelope * (Math.sin(phase) + .055 * Math.sin(phase * 2) * Math.exp(-t / .045));
  }
  samples[index] = value * Math.min(1, (duration - time) / .05); peak = Math.max(peak, Math.abs(samples[index]));
 }
 const bytes = Buffer.alloc(44 + count * 2);bytes.write('RIFF');bytes.writeUInt32LE(bytes.length-8,4);bytes.write('WAVEfmt ',8);bytes.writeUInt32LE(16,16);bytes.writeUInt16LE(1,20);bytes.writeUInt16LE(1,22);bytes.writeUInt32LE(rate,24);bytes.writeUInt32LE(rate*2,28);bytes.writeUInt16LE(2,32);bytes.writeUInt16LE(16,34);bytes.write('data',36);bytes.writeUInt32LE(count*2,40);
 for(let index=0;index<count;index++)bytes.writeInt16LE(Math.round(samples[index]/peak*.48*32767),44+index*2);
 writeFileSync(output+name+'.wav',bytes);writeFileSync(native+'school_'+name+'.wav',bytes);
}
writeFileSync(output+'ORIGIN.md','# مصدر الأصوات\n\nschool وsoft وbright وpulse أصوات إلكترونية أصلية ولّدها سكربت المشروع generate-notification-sounds.mjs، دون استخدام تسجيلات أو عينات خارجية. مخصصة للإشعارات والمعاينة بطلب المستخدم؛ لا يوجد شعار صوتي أو تشغيل عند فتح التطبيق.\n');
console.log('Generated four original notification WAVs, 44.1 kHz mono PCM, peak -6.4 dBFS.');
