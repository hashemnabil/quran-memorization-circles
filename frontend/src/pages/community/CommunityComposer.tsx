import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { db } from '@/lib/db';
import { api, apiError } from '@/lib/api';
import { useAuthStore } from '@/store/auth';
import { Avatar, Button, Card, Input, useConfirm } from '@/components/ui';
import CommunityImage from './CommunityImage';
import MentionText, { type Mention } from './MentionText';

const backgrounds = ['#123c30', '#183153', '#5b315e', '#7c402b', '#27303f', '#f3e8d2'];
const textColors = ['#ffffff', '#fff4c2', '#123c30', '#172033'];
type Draft = { mediaIds: string[]; body: string; audience: 'ALL' | 'SELECTED'; recipients: Mention[]; mentions: Mention[]; school: boolean; background: string; textColor: string; fontSize: number; bold: boolean };
const empty: Draft = { mediaIds: [], body: '', audience: 'ALL', recipients: [], mentions: [], school: false, background: backgrounds[0], textColor: '#ffffff', fontSize: 28, bold: true };

export default function CommunityComposer({ story = false }: { story?: boolean }) {
  const confirm=useConfirm();
  const user = useAuthStore(s => s.user)!;
  const navigate = useNavigate(), queryClient = useQueryClient();
  const draftKey = `${user.id}:community-draft:${story ? 'story' : 'post'}`;
  const [draft, setDraft] = useState<Draft>(() => ({ ...empty }));
  const [loaded, setLoaded] = useState(false);
  const saves = useRef(Promise.resolve());
  const [search, setSearch] = useState(''), [query, setQuery] = useState('');
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [preview, setPreview] = useState(false), [busy, setBusy] = useState(false);
  const input = useRef<HTMLTextAreaElement>(null);
  const cursor = useRef(0);
  useEffect(() => {
    let active=true;
    void db.meta.get(draftKey).then(row=>{if(active&&useAuthStore.getState().user?.id===user.id){if(row?.value)setDraft({...empty,...row.value});setLoaded(true);}}).catch(()=>{if(active){toast.error('تعذر استعادة المسودة؛ أعد تحميل الصفحة قبل الكتابة');}});
    return()=>{active=false;};
  },[draftKey,user.id]);
  useEffect(() => { if(!loaded)return;saves.current=saves.current.catch(()=>undefined).then(()=>db.meta.put({key:draftKey,value:draft})).then(()=>undefined).catch(()=>{toast.error('تعذر حفظ المسودة على الجهاز؛ أبق الصفحة مفتوحة');}); }, [draftKey,draft,loaded]);
  useEffect(() => { const timer = setTimeout(() => setQuery(mentionQuery ?? search), 250); return () => clearTimeout(timer); }, [search, mentionQuery]);
  const school=useQuery({queryKey:['community','school'],queryFn:async()=>(await api.get<{name:string;logoUrl:string|null}>('/community/school')).data});
  const directory = useQuery({ queryKey: ['community', 'directory', user.id, query], queryFn: async () => (await api.get<Mention[]>('/community/directory', { params: { q: query } })).data });
  const patch = (value: Partial<Draft>) => setDraft(current => ({ ...current, ...value }));
  const inspectCursor = () => { const field = input.current; if (!field) return; cursor.current = field.selectionStart; const match = field.value.slice(0, field.selectionStart).match(/(?:^|\s)@([^\s@]*)$/u); setMentionQuery(match ? match[1] : null); };
  const mention = (person: Mention) => {
    const before = draft.body.slice(0, cursor.current), at = before.lastIndexOf('@');
    const body = before.slice(0, at) + '@' + person.username + ' ' + draft.body.slice(cursor.current);
    if (body.length > (story ? 500 : 2000)) return;
    patch({ body, mentions: [...draft.mentions.filter(item => item.id !== person.id), person] });
    setMentionQuery(null); input.current?.focus();
  };
  const publish = async () => {
    setBusy(true);
    try {
      const mentions = draft.mentions.filter(person => draft.body.includes('@' + person.username));
      if (draft.audience === 'SELECTED' && !story && mentions.some(person => person.id !== user.id && !draft.recipients.some(item => item.id === person.id))) throw new Error('أضف الحسابات المذكورة إلى الجمهور المحدد');
      const result = await api.post('/community/' + (story ? 'stories' : 'posts'), {
        body: draft.body, mediaIds: draft.mediaIds, mentionIds: mentions.map(person => person.id),
        ...(story ? { schoolStory: draft.school, background: draft.background, textColor: draft.textColor, fontSize: draft.fontSize, bold: draft.bold } : { schoolPost: draft.school, audience: draft.audience, recipientIds: draft.audience === 'SELECTED' ? draft.recipients.map(person => person.id) : [] }),
      });
      await saves.current;
      await db.meta.delete(draftKey);
      await queryClient.invalidateQueries({ queryKey: ['community'] });
      toast.success(result.data?.synced === 0 ? 'حُفظ المنشور على الجهاز بانتظار المزامنة' : 'تم النشر');
      navigate('/community/posts', { replace: true });
    } catch (error) { toast.error(apiError(error, error instanceof Error ? error.message : 'تعذر النشر؛ المسودة محفوظة')); }
    finally { setBusy(false); }
  };
  return <section className="community-composer" dir="rtl" aria-labelledby="community-composer-title">
    <header className="composer-toolbar"><Link to="/community/posts" className="btn-secondary">العودة</Link><h1 id="community-composer-title">{story ? 'إنشاء قصة' : 'إنشاء منشور'}</h1><Button loading={busy} disabled={!loaded || !draft.body.trim() || !story && draft.audience === 'SELECTED' && !draft.recipients.length} onClick={() => void publish()}>نشر</Button></header>
    <div className="composer-body">
      <Card><div className="flex items-center gap-3"><Avatar name={draft.school?school.data?.name??'المدرسة':user.fullName} src={draft.school?school.data?.logoUrl:user.avatarUrl} size={44}/><strong>{draft.school?school.data?.name??'المدرسة':user.fullName}</strong></div>
        {user.role === 'ADMIN' && <label className="mt-4 block">هوية الناشر<select className="input mt-2 w-full" value={draft.school ? 'school' : 'self'} onChange={e => patch({ school: e.target.value === 'school' })}><option value="self">حسابي الشخصي</option><option value="school">المدرسة</option></select></label>}
        {!story && <><label className="mt-4 block">الجمهور<select className="input mt-2 w-full" value={draft.audience} onChange={e => patch({ audience: e.target.value as Draft['audience'] })}><option value="ALL">الجميع</option><option value="SELECTED">أشخاص محددون</option></select></label>{draft.audience === 'SELECTED' && <fieldset className="mt-4 space-y-3"><legend>اختيار الجمهور</legend><Input aria-label="البحث عن حسابات الجمهور" value={search} maxLength={80} onChange={e => { setMentionQuery(null); setSearch(e.target.value); }} placeholder="ابحث بالاسم أو اسم المستخدم"/><div className="flex flex-wrap gap-2">{draft.recipients.map(person => <button type="button" className="btn-secondary" key={person.id} onClick={() => patch({ recipients: draft.recipients.filter(item => item.id !== person.id) })}>{person.fullName} ×</button>)}</div><div className="composer-directory">{directory.data?.map(person => <label key={person.id} className="flex items-center gap-3 p-3"><input type="checkbox" checked={draft.recipients.some(item => item.id === person.id)} onChange={e => patch({ recipients: e.target.checked ? [...draft.recipients, person] : draft.recipients.filter(item => item.id !== person.id) })}/><span>{person.fullName} <small dir="ltr">@{person.username}</small></span></label>)}</div></fieldset>}</>}
      </Card>
      <Card><label className="mb-2 block font-bold" htmlFor="community-draft">{story ? 'نص القصة' : 'نص المنشور'}</label><textarea id="community-draft" ref={input} disabled={!loaded} className="input w-full resize-y" rows={7} maxLength={story ? 500 : 2000} value={draft.body} onChange={e => { patch({ body: e.target.value }); inspectCursor(); }} onClick={inspectCursor} onKeyUp={inspectCursor} placeholder="شارك رحلتك مع القرآن… استخدم @ لذكر حساب"/>
        <div className="flex justify-between text-xs text-slate-500"><span>الإشارة مرتبطة بحساب تختاره من الاقتراحات</span><span>{draft.body.length}/{story ? 500 : 2000}</span></div>
        {mentionQuery !== null && <div className="composer-directory" role="listbox" aria-label="اقتراحات المنشن">{directory.isError ? <p role="alert">يلزم اتصال لتحميل الحسابات المسموح بها</p> : directory.data?.map(person => <button type="button" role="option" aria-selected={false} className="flex w-full items-center gap-3 p-3 text-start" key={person.id} onClick={() => mention(person)}>{person.fullName} <span dir="ltr">@{person.username}</span></button>)}</div>}
      </Card>
      <Card title="الصور"><p className="mb-3 text-sm text-slate-500">حتى 3 صور (PNG، JPEG، WebP، GIF)، بحد 5 ميجابايت للصورة. يلزم اتصال للرفع.</p><input type="file" accept="image/png,image/jpeg,image/webp,image/gif" aria-label="إضافة صورة" disabled={busy || draft.mediaIds.length >= 3} onChange={event => { const file = event.target.files?.[0]; event.target.value=''; if(!file)return; if(file.size>5*1024*1024){toast.error('حجم الصورة يتجاوز 5 ميجابايت');return;} setBusy(true);const form=new FormData();form.append('file',file);void api.post<{id:string}>('/community/media',form,{headers:{'Content-Type':'multipart/form-data'}}).then(result=>{if(useAuthStore.getState().user?.id===user.id)setDraft(current=>({...current,mediaIds:[...current.mediaIds,result.data.id]}));}).catch(error=>toast.error(apiError(error))).finally(()=>setBusy(false)); }}/><div className="mt-3 grid gap-3">{draft.mediaIds.map(id=><div key={id}><CommunityImage id={id}/><Button variant="secondary" onClick={()=>patch({mediaIds:draft.mediaIds.filter(value=>value!==id)})}>إزالة الصورة</Button></div>)}</div></Card>
      {story && <Card title="تنسيق القصة"><fieldset><legend>لون الخلفية</legend><div className="my-3 flex flex-wrap gap-3">{backgrounds.map(color => <button type="button" key={color} aria-label={'خلفية ' + color} aria-pressed={draft.background === color} className="composer-swatch" style={{ backgroundColor: color }} onClick={() => patch({ background: color })}/>)}</div></fieldset><fieldset><legend>لون النص</legend><div className="my-3 flex gap-3">{textColors.map(color => <button type="button" key={color} aria-label={'نص ' + color} aria-pressed={draft.textColor === color} className="composer-swatch" style={{ backgroundColor: color }} onClick={() => patch({ textColor: color })}/>)}</div></fieldset><label>حجم النص<select className="input mx-3" value={draft.fontSize} onChange={e => patch({ fontSize: Number(e.target.value) })}>{[22,28,36].map(size => <option key={size} value={size}>{size}</option>)}</select></label><label className="inline-flex items-center gap-2"><input type="checkbox" checked={draft.bold} onChange={e => patch({ bold: e.target.checked })}/>نص عريض</label></Card>}
      <Button variant="secondary" onClick={() => setPreview(value => !value)}>{preview ? 'إخفاء المعاينة' : 'معاينة قبل النشر'}</Button>
      {preview && <section aria-label="معاينة" className={story ? 'composer-story-preview' : 'card p-6 whitespace-pre-wrap break-words'} style={story ? { backgroundColor: draft.background, color: draft.textColor, fontSize: draft.fontSize, fontWeight: draft.bold ? 700 : 400 } : undefined}>{draft.mediaIds.map(id=><CommunityImage key={id} id={id}/>)}<MentionText body={draft.body} mentions={draft.mentions}/></section>}
      <Button variant="ghost" disabled={!loaded||busy} onClick={async()=>{if(await confirm({title:'مسح المسودة',message:'هل تريد مسح النص والصور المحددة من هذه المسودة؟',variant:'danger'}))setDraft({...empty});}}>مسح المسودة</Button>
      <p className="text-xs text-slate-500">{story ? 'تختفي القصة بعد 24 ساعة. يلزم الاتصال للنشر.' : 'يمكن حفظ المنشور النصي دون اتصال وإرساله عند عودة الاتصال.'}</p>
    </div>
  </section>;
}
