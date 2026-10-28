import { useEffect, useId, useRef, useState } from 'react';
import { importAudio, readImportedAudio, SOUNDS, type SoundScope, type ImportedAudio } from '@/lib/notification-sounds';
import { notificationPreview } from '@/lib/notification-preview';
import type { PreviewState } from '@/lib/exclusive-audio-preview';

type SoundOption = { id: string; name: string; description: string; url?: string };
export default function SoundPicker({ account, scope, value, onChange, onImport, savedToken = 0 }: { account: string; scope: SoundScope; value: string; onChange: (id: string) => void; onImport: (audio: ImportedAudio) => void; savedToken?: number }) {
  const owner = useId(); const fileInput = useId();
  const [customName, setCustomName] = useState('');
  const [preview, setPreview] = useState<PreviewState>(null);
  const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  const [pendingAudio, setPendingAudio] = useState<ImportedAudio>();
  const requested = useRef(0); const fileRevision = useRef(0);
  const stop = () => { requested.current++; void notificationPreview.stop().catch(() => undefined); };
  useEffect(() => notificationPreview.subscribe(setPreview), []);
  useEffect(() => {
    let active = true;
    const revision = fileRevision.current; setPendingAudio(undefined);
    void readImportedAudio(account, scope).then(file => { if (active && revision === fileRevision.current) setCustomName(file?.name || ''); }).catch(() => undefined);
    const hidden = () => { if (document.visibilityState !== 'visible') void notificationPreview.stop(owner).catch(() => undefined); };
    document.addEventListener('visibilitychange', hidden);
    return () => { active = false; requested.current++; document.removeEventListener('visibilitychange', hidden); void notificationPreview.stop(owner).catch(() => undefined); };
  }, [account, scope, owner, savedToken]);
  const play = async (sound: SoundOption) => {
    const token = ++requested.current;
    setError('');
    if (preview?.owner === owner && preview.id === sound.id) { stop(); return; }
    try {
      const source = sound.id === 'custom' ? pendingAudio?.data ?? (await readImportedAudio(account, scope))?.data : sound.url;
      if (token !== requested.current) return;
      await notificationPreview.play(owner, sound.id, source);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'تعذر تشغيل معاينة الصوت'); }
  };
  const option = (sound: SoundOption, disabled = false) => {
    const playing = preview?.owner === owner && preview.id === sound.id;
    return <div key={sound.id} className={`notification-sound-card ${value === sound.id ? 'is-selected' : ''}`}>
      <label className="notification-sound-choice"><input type="radio" aria-label={sound.name} name={`sound-${scope}-${owner}`} checked={value === sound.id} disabled={disabled} onChange={() => { stop(); onChange(sound.id); }} /><span><strong>{sound.name}</strong><small>{sound.description}</small></span>{value === sound.id && <span className="sound-selected-label">محدد</span>}</label>
      {sound.id !== 'silent' && <button type="button" disabled={disabled} className={`sound-preview-button ${playing ? 'is-playing' : ''}`} aria-label={`${playing ? 'إيقاف' : 'تشغيل'} ${sound.name}`} aria-pressed={playing} onClick={() => void play(sound)}><span aria-hidden="true">{playing ? '■' : '▶'}</span><span>{playing ? 'إيقاف' : 'معاينة'}</span></button>}
    </div>;
  };
  const library = SOUNDS.filter(sound => sound.group === 'library' && (scope === 'general' || ['calm', 'electronic', 'clear'].includes(sound.id)));
  return <div className="notification-sound-library">
    {scope === 'general' && <section aria-label="صوت المدرسة"><h3 className="sound-section-title">بصمة المدرسة</h3>{SOUNDS.filter(sound => sound.id === 'school').map(sound => option(sound))}</section>}
    <section aria-label="مكتبة أصوات التطبيق"><h3 className="sound-section-title">مكتبة أصوات التطبيق</h3><div className="notification-sounds-grid">{library.map(sound => option(sound))}</div></section>
    <section aria-label="خيارات الصوت الشخصية"><h3 className="sound-section-title">على ذوقك</h3>{SOUNDS.filter(sound => sound.id === 'default').map(sound => option(sound))}
      {option({ id: 'custom', name: customName || 'صوت من ملفاتك', description: customName ? 'نسخة محفوظة لهذا الحساب على هذا الجهاز' : 'اختر تسجيلًا صوتيًا من الهاتف' }, !customName)}
      <label htmlFor={fileInput} className="sound-import-button">{busy ? 'جارٍ فحص الملف…' : 'اختيار من الجهاز'}</label>
      <input id={fileInput} className="sr-only" type="file" accept="audio/*,.mp3,.wav,.m4a,.aac,.ogg,.flac" disabled={busy} onChange={async event => {
        const file = event.target.files?.[0]; event.target.value = ''; if (!file) return;
        fileRevision.current++;
        stop(); setBusy(true); setError('');
        try { const result = await importAudio(account, scope, file); setPendingAudio(result); onImport(result); setCustomName(result.name); onChange('custom'); }
        catch (cause) { setError(cause instanceof Error ? cause.message : 'تعذر قراءة الصوت'); } finally { setBusy(false); }
      }} />
      {pendingAudio && <p role="status" className="sound-import-status">اخترت «{pendingAudio.name}». اضغط حفظ الاختيار لاعتماده.</p>}
      {SOUNDS.filter(sound => sound.id === 'silent').map(sound => option(sound))}
    </section>
    <p className="prayer-help">ملف حتى 5 ميجابايت و{scope === 'prayer' ? '10 دقائق للأذان' : '30 ثانية للإشعارات'}. يُحفظ الملف المستورد مشفّرًا محليًا، ويُنسخ في تطبيق أندرويد إلى مساحة التطبيق الخاصة.</p>
    {scope === 'prayer' && <p className="prayer-help">للأذان الكامل اختر تسجيلًا من جهازك وحدد التذكير عند دخول الوقت. اقلب الهاتف ووجهه للأسفل لإيقاف الأذان أو استخدم زر الإيقاف في الإشعار.</p>}
    {error && <p role="alert" className="prayer-status">{error}</p>}
  </div>;
}
