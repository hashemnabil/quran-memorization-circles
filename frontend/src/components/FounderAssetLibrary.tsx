import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, apiError } from '@/lib/api';
import { Button, Card, Input, Select } from '@/components/ui';

export default function FounderAssetLibrary() {
  const cache = useQueryClient();
  const [title, setTitle] = useState(''), [kind, setKind] = useState('CHAT_BACKGROUND'), [password, setPassword] = useState('');
  const [file, setFile] = useState<File | null>(null), [busy, setBusy] = useState(false), [message, setMessage] = useState('');
  const assets = useQuery({ queryKey: ['founder-assets'], queryFn: async () => (await api.get('/founder-assets')).data });
  return <Card title="مكتبة التصاميم والأصوات">
    <p className="mb-3 text-sm text-slate-500">للمؤسس فقط: صور PNG وJPEG وWebP؛ أصوات MP3 وOGG وWAV. حد الملف 5 ميغابايت، والمكتبة 50 ميغابايت.</p>
    <form className="space-y-3" onSubmit={async event => {
      event.preventDefault(); if (!file) return;
      setBusy(true); setMessage('');
      try { const body = new FormData(); body.set('title', title); body.set('kind', kind); body.set('password', password); body.set('file', file);
        await api.post('/founder-assets', body, { headers: { 'Content-Type': 'multipart/form-data' } }); setPassword(''); setMessage('أُضيف المورد'); await cache.invalidateQueries({ queryKey: ['founder-assets'] });
      } catch (error) { setMessage(apiError(error)); } finally { setBusy(false); }
    }}>
      <Input label="عنوان المورد" value={title} maxLength={100} onChange={event => setTitle(event.target.value)} />
      <Select label="نوع المورد" value={kind} onChange={event => { setKind(event.target.value); setFile(null); }}>
        <option value="CHAT_BACKGROUND">خلفية محادثة</option><option value="PROFILE_COVER">غلاف الملف الشخصي</option><option value="NOTIFICATION_SOUND">صوت إشعارات</option><option value="ADHAN_SOUND">صوت أذان</option><option value="ANNOUNCEMENT_IMAGE">صورة إعلان — تتحقق صلاحية مشاهدتها</option><option value="ANNOUNCEMENT_VIDEO">فيديو إعلان MP4 أو WebM — حتى 5 ميغابايت</option>
      </Select>
      <label className="block text-sm">الملف<input key={kind} type="file" className="mt-2 block w-full" accept={kind.endsWith('SOUND') ? '.mp3,.ogg,.wav' : kind === 'ANNOUNCEMENT_VIDEO' ? '.mp4,.webm' : '.png,.jpg,.jpeg,.webp'} onChange={event => setFile(event.target.files?.[0] || null)} /></label>
      <Input label="كلمة المرور لتأكيد العملية" type="password" autoComplete="current-password" value={password} onChange={event => setPassword(event.target.value)} />
      <Button type="submit" loading={busy} disabled={!file || !title.trim() || !password}>إضافة للمكتبة</Button>
    </form>
    {message && <p role="status" className="my-3 text-sm">{message}</p>}
    {assets.isError && <p role="alert">تعذر تحميل المكتبة</p>}
    <ul className="mt-4 divide-y">{(Array.isArray(assets.data) ? assets.data : []).map((asset: { id: string; title: string; kind: string }) => <li key={asset.id} className="flex items-center justify-between gap-2 py-3"><span>{asset.title}</span><Button variant="secondary" disabled={busy || !password} onClick={async () => {
      setBusy(true); try { await api.patch(`/founder-assets/${asset.id}/disable`, { password }); setPassword(''); await cache.invalidateQueries({ queryKey: ['founder-assets'] }); setMessage('أُوقف المورد'); } catch (error) { setMessage(apiError(error)); } finally { setBusy(false); }
    }}>إيقاف</Button></li>)}</ul>
  </Card>;
}
