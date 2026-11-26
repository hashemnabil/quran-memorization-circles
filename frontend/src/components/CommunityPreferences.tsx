import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { api, apiError } from '@/lib/api';
import { Button, Card, Textarea } from './ui';
import { useAuthStore } from '@/store/auth';

export default function CommunityPreferences({section='profile'}:{section?:'profile'|'notifications'}) {
  const account = useAuthStore(state => state.user!.id);
  const preferences = useQuery({queryKey:['community','preferences',account],queryFn:async()=>(await api.get<{communityMentionNotifications:boolean}>('/community/preferences')).data});
  const profile = useQuery({queryKey:['community','profile',account],queryFn:async()=>(await api.get<{bio:string|null}>('/community/users/'+account)).data});
  const [bio, setBio] = useState<string|null>(null), [busy, setBusy] = useState(false);
  return section==='profile'?<Card title="النبذة الشخصية"><form className="space-y-3" onSubmit={event=>{event.preventDefault();setBusy(true);void api.patch('/community/bio',{bio:bio??profile.data?.bio??''}).then(()=>{toast.success('تم حفظ النبذة');void profile.refetch();}).catch(error=>toast.error(apiError(error))).finally(()=>setBusy(false));}}><Textarea aria-label="النبذة الشخصية" maxLength={280} value={bio??profile.data?.bio??''} onChange={event=>setBio(event.target.value)} placeholder="نبذة قصيرة تظهر لأعضاء المدرسة"/><Button type="submit" loading={busy}>حفظ النبذة</Button></form></Card>:<Card title="تحديد الإشعارات"><label className="flex items-center gap-3"><input type="checkbox" checked={preferences.data?.communityMentionNotifications??false} disabled={busy||!preferences.data} onChange={event=>{setBusy(true);void api.patch('/community/preferences',{communityMentionNotifications:event.target.checked}).then(()=>preferences.refetch()).catch(error=>toast.error(apiError(error))).finally(()=>setBusy(false));}}/>إشعاري عند الإشارة إلى حسابي في منشور أو قصة</label>{preferences.isError&&<Button variant="secondary" onClick={()=>void preferences.refetch()}>إعادة تحميل الإعدادات</Button>}</Card>;
}
