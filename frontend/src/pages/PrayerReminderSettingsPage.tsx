import { notificationPreview } from '@/lib/notification-preview';
import { WebAudioPermission } from '@/components/CuratedWebAudio';
import { useCuratedBackground } from '@/components/CuratedBackground';
import { importLibrarySound } from '@/components/LibrarySoundOptions';
import { useEffect, useState } from 'react';
import { useAuthStore } from '@/store/auth';
import { Button, Card, PageHeader } from '@/components/ui';
import SoundPicker from '@/components/SoundPicker';
import { obligatoryPrayers, readPrayerPreferences, savePrayerPreferences, type ObligatoryPrayer } from '@/lib/prayer-times';
import { refreshPrayerReminders } from '@/lib/prayer-notifications';
import { androidNotifications, SchoolNotifications, storeImportedAudio, readImportedAudio, type ImportedAudio } from '@/lib/notification-sounds';
import { PrayerBackButton } from './PrayerTimesPage';

export default function PrayerReminderSettingsPage() {
  const account = useAuthStore(s => s.user!.id);
  const adhanLibrary=useCuratedBackground('ADHAN_SOUND');
  const [libraryDraft,setLibraryDraft]=useState<string|null>(null);
  const libraryId=libraryDraft??adhanLibrary.selected;
  const [imported, setImported] = useState<ImportedAudio>();
  const [savedToken, setSavedToken] = useState(0);
  const [value, setValue] = useState(() => readPrayerPreferences(account));
  const [status, setStatus] = useState(''); const [busy, setBusy] = useState(false);
  const [previewingAdhan, setPreviewingAdhan] = useState(false);
  useEffect(() => {
    const unsubscribe = notificationPreview.subscribe(state => setPreviewingAdhan(state?.owner === 'prayer-adhan'));
    const hidden = () => { if (document.visibilityState !== 'visible') void notificationPreview.stop('prayer-adhan'); };
    document.addEventListener('visibilitychange', hidden);
    return () => { unsubscribe(); document.removeEventListener('visibilitychange', hidden); void notificationPreview.stop('prayer-adhan'); };
  }, []);
  return <div className="prayer-page"><PageHeader title="إعدادات تذكيرات الصلاة" subtitle="إعدادات شخصية — غزة، فلسطين" action={<PrayerBackButton />} />
    <WebAudioPermission />
    <div className="prayer-settings-grid"><Card title="تذكيرات الصلاة"><label className="prayer-check mb-5"><input type="checkbox" checked={value.enabled} onChange={e => setValue({ ...value, enabled: e.target.checked })} />تفعيل تذكيرات الصلاة</label>
      <div className="prayer-table">{obligatoryPrayers.map(p => { const id = p.id as ObligatoryPrayer; return <div className="prayer-row" key={id}><label className="prayer-check"><input type="checkbox" checked={value.prayers[id].enabled} onChange={e => setValue({ ...value, prayers: { ...value.prayers, [id]: { ...value.prayers[id], enabled: e.target.checked } } })} />{p.label}</label><select className="input max-w-52" aria-label={`موعد تذكير ${p.label}`} value={value.prayers[id].before} onChange={e => setValue({ ...value, prayers: { ...value.prayers, [id]: { ...value.prayers[id], before: Number(e.target.value) } } })}>{[0, 5, 10, 15].map(n => <option key={n} value={n}>{n === 0 ? 'عند دخول الوقت' : `قبل الصلاة بـ ${n} دقائق`}</option>)}</select></div>; })}</div>
      <p className="prayer-help">الشروق ليس صلاة مفروضة، ولا تُجدول له تذكيرات. التذكيرات معطّلة افتراضيًا حتى تختار تفعيلها.</p>
    </Card><Card title="الأذان عند دخول الوقت"><label className="prayer-check"><input type="checkbox" checked={!!value.adhanEnabled} onChange={event => setValue({ ...value, adhanEnabled: event.target.checked, enabled: event.target.checked || value.enabled })} />تشغيل الأذان عند دخول وقت الصلاة</label>
      <p className="prayer-help">في تطبيق أندرويد، يعمل للأوقات المفعّلة أعلاه، حتى إذا اخترت تذكيراً قبل الصلاة. اقلب الجوال ووجهه للأسفل لإيقاف الأذان الحالي فقط، أو اضغط إيقاف الأذان من الإشعار.</p>
      <label className="prayer-check">تسجيل الأذان<select className="input max-w-64" aria-label="تسجيل الأذان" disabled={busy} value={libraryId?`library:${libraryId}`:value.adhanSource||'builtin'} onChange={event=>{
        const selected=event.target.value;
        if(!selected.startsWith('library:')){setLibraryDraft('');setValue({...value,adhanSource:selected as 'builtin'|'custom'});return;}
        const asset=adhanLibrary.assets.find(row=>row.id===selected.slice(8));if(!asset)return;
        setBusy(true);setStatus('');void importLibrarySound(account,'prayer',asset).then(file=>{if(useAuthStore.getState().user?.id!==account)return;setImported(file);setLibraryDraft(asset.id);setValue(current=>({...current,adhanSource:'custom'}));}).catch(error=>setStatus(error instanceof Error?error.message:'تعذر تحميل الأذان')).finally(()=>setBusy(false));
      }}><option value="builtin">الأذان المضمّن</option><option value="custom">تسجيلي من الجهاز</option>{adhanLibrary.assets.map(asset=><option key={asset.id} value={`library:${asset.id}`}>{asset.title}</option>)}</select></label>
      <Button className="mt-4" variant="secondary" disabled={busy} onClick={async()=>{try{
        if(previewingAdhan){await notificationPreview.stop('prayer-adhan');return;}
        const asset=adhanLibrary.assets.find(row=>row.id===libraryId);
        const custom=asset?imported??await importLibrarySound(account,'prayer',asset):value.adhanSource==='custom'?imported??await readImportedAudio(account,'prayer'):undefined;
        if(value.adhanSource==='custom'&&!custom)throw new Error('اختر تسجيل الأذان أولًا');
        await notificationPreview.play('prayer-adhan','adhan',custom?.data||'/sounds/adhan.ogg');
      }catch{setStatus('تعذرت معاينة الأذان');}}}>{previewingAdhan?'إيقاف المعاينة':'معاينة الأذان'}</Button>
      {!libraryId&&value.adhanSource!=='custom'&&<p className="prayer-help">التسجيل المضمّن: <a href="https://commons.wikimedia.org/wiki/File:Azan.ogg" target="_blank" rel="noreferrer" className="underline">Azan — Andrewler</a> · <a href="https://creativecommons.org/licenses/by-sa/4.0/" target="_blank" rel="noreferrer" className="underline">CC BY-SA 4.0</a>. التسجيل الأصلي دون تعديل.</p>}
    </Card><Card title="أصوات تذكيرات الصلاة"><SoundPicker account={account} scope="prayer" savedToken={savedToken} onImport={file=>{setImported(file);setLibraryDraft('');}} value={value.sound} onChange={sound => setValue({ ...value, sound })} /></Card>
    <Card title="التاريخ الهجري"><label className="prayer-check">تصحيح التقويم المحلي<select className="input max-w-40" value={value.hijriOffset} onChange={e => setValue({ ...value, hijriOffset: Number(e.target.value) })}>{[-2, -1, 0, 1, 2].map(n => <option key={n} value={n}>{n > 0 ? '+' : ''}{n} يوم</option>)}</select></label><p className="prayer-help">تقويم هجري مدني حسابي. التصحيح يغيّر عرض التاريخ فقط.</p></Card>
    <p className="prayer-help">في أندرويد تُجدول التنبيهات محليًا، وقد تتأخر بسبب توفير البطارية وعدم الإزعاج. في الموقع تُحفظ الإعدادات وتُعرض المواقيت فقط؛ لا توجد تذكيرات مضمونة عند إغلاق المتصفح.</p>
    {androidNotifications() && <Button variant="secondary" onClick={() => void SchoolNotifications.requestExactAlarm().catch(() => setStatus('تعذر فتح إعداد المنبهات'))}>السماح بالمنبهات الدقيقة للأذان</Button>}
    {androidNotifications() && <Button variant="secondary" onClick={() => void SchoolNotifications.openSettings({})}>فتح إعدادات إشعارات أندرويد</Button>}
    <Button loading={busy} onClick={async () => { setBusy(true); setStatus(''); try { await notificationPreview.stop(); const asset=adhanLibrary.assets.find(row=>row.id===libraryId); const file=asset?imported??await importLibrarySound(account,'prayer',asset):imported; const effective=asset?{...value,adhanSource:'custom' as const}:value; const message = await refreshPrayerReminders(account, true, effective, file); if (useAuthStore.getState().user?.id !== account) return; if ((effective.sound === 'custom' || effective.adhanSource === 'custom') && file) await storeImportedAudio(account, 'prayer', file); savePrayerPreferences(account, effective); setValue(effective); adhanLibrary.choose(libraryId); setSavedToken(token => token + 1); setStatus(message || 'حُفظت الإعدادات'); } catch (e) { setStatus(e instanceof Error ? e.message : 'تعذر حفظ إعدادات التذكير'); } finally { setBusy(false); } }}>حفظ الإعدادات</Button>
    {status && <p role="status" className="prayer-status">{status}</p>}</div>
  </div>;
}
