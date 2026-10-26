import { useEffect, useRef, useState } from 'react';
import { androidNotifications, importAudio, readImportedAudio, SchoolNotifications, SOUNDS, type SoundScope, type ImportedAudio } from '@/lib/notification-sounds';

export default function SoundPicker({ account, scope, value, onChange, onImport }: { account: string; scope: SoundScope; value: string; onChange: (id: string) => void; onImport: (audio: ImportedAudio) => void }) {
  const [customName, setCustomName] = useState('');
  const [playing, setPlaying] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [pendingAudio, setPendingAudio] = useState<ImportedAudio>();
  const audio = useRef<HTMLAudioElement | null>(null);
  const generation = useRef(0);
  const stop = () => { generation.current++; audio.current?.pause(); audio.current = null; setPlaying(''); if (androidNotifications()) void SchoolNotifications.stopPreview(); };
  useEffect(() => { let live = true; void readImportedAudio(account, scope).then(file => { if (live) setCustomName(file?.name || ''); }).catch(() => undefined); return () => { live = false; generation.current++; audio.current?.pause(); if (androidNotifications()) void SchoolNotifications.stopPreview(); }; }, [account, scope]);
  const preview = async (id: string) => {
    stop(); setError('');
    const current = generation.current;
    try {
      if (id === 'default') { if (androidNotifications()) { await SchoolNotifications.previewDefault(); if (current === generation.current) setPlaying(id); } else setError('معاينة صوت الجهاز متاحة في تطبيق أندرويد.'); return; }
      const selected = SOUNDS.find(s => s.id === id);
      const source = id === 'custom' ? pendingAudio?.data ?? (await readImportedAudio(account, scope))?.data : selected && 'url' in selected ? selected.url : undefined;
      if (current !== generation.current || !source) return;
      const player = new Audio(source); audio.current = player; player.onended = () => setPlaying(''); await player.play(); if (current === generation.current) setPlaying(id); else player.pause();
    } catch { setError('تعذر تشغيل المعاينة.'); }
  };
  return <div>
    <div className="sound-options">{[...SOUNDS, ...(customName ? [{ id: 'custom', name: customName }] : [])].map(sound => <div className={`sound-option ${value === sound.id ? 'selected' : ''}`} key={sound.id}>
      <label className="prayer-check"><input type="radio" name={`sound-${scope}`} checked={value === sound.id} onChange={() => { stop(); onChange(sound.id); }} /><span>{sound.name}</span></label>
      {sound.id !== 'silent' && <button type="button" aria-label={`${playing === sound.id ? 'إيقاف' : 'معاينة'} ${sound.name}`} onClick={() => playing === sound.id ? stop() : void preview(sound.id)}>{playing === sound.id ? 'إيقاف ■' : 'معاينة ▶'}</button>}
    </div>)}</div>
    <label className="btn-secondary mt-4 inline-flex cursor-pointer">{busy ? 'جارٍ حفظ الملف…' : 'اختيار صوت من الجهاز'}<input className="sr-only" type="file" accept="audio/*" disabled={busy} onChange={async e => { const file = e.target.files?.[0]; e.target.value = ''; if (!file) return; stop(); setBusy(true); setError(''); try { const result = await importAudio(account, scope, file); setPendingAudio(result); onImport(result); setCustomName(result.name); onChange('custom'); } catch (err) { setError(err instanceof Error ? err.message : 'تعذر حفظ الصوت'); } finally { setBusy(false); } }} /></label>
    <p className="prayer-help">ملف صوتي حتى 5 ميجابايت و30 ثانية. يُحفظ على هذا الجهاز لهذا الحساب. استخدم ملفات تملك حق استخدامها.</p>
    <div className="sound-option sound-unavailable">{scope === 'general' ? 'صوت المدرسة: بانتظار الملف الصوتي المرجعي وحقوق استخدامه.' : 'الأذان الكامل والمختصر: بانتظار ملفات معتمدة ومرخّصة. التنبيهات القصيرة متاحة الآن.'}</div>
    {error && <p role="alert" className="prayer-status">{error}</p>}
  </div>;
}
