import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link, useParams, useLocation } from 'react-router-dom';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import CommunityImage from './CommunityImage';
import MentionText, { type Mention } from './MentionText';
import PostCard, { type CommunityPost } from './PostCard';
import { ROLE_LABELS } from '@/lib/labels';
import { api, apiError } from '@/lib/api';
import { useAuthStore } from '@/store/auth';
import { Avatar, Button, Card, LoadingState, Modal, PageHeader } from '@/components/ui';

type School={name:string;logoUrl:string|null;about:string|null;address:string|null;stats?:{circles:number;students:number;teachers:number}};
type Person={bio?:string|null;username?:string;coverAssetId?:string|null;id:string;fullName:string;nickname?:string|null;avatarUrl?:string|null;role:string};
type Comment={synced?:number;id:string;body:string;parentId?:string|null;user:Person;_count?:{likes:number}};
type Story={mediaIds?:string[];background?:string;textColor?:string;fontSize?:number;bold?:boolean;mentions?:Mention[];id:string;schoolStory:boolean;body:string;authorId:string;author:Person;views:{liked:boolean;user:Person}[]};
type Post=CommunityPost;
export default function CommunityPage({ ownProfile = false }: { ownProfile?: boolean }){
 const {userId:rawUserId}=useParams();const user=useAuthStore(s=>s.user)!;const location=useLocation();const userId=ownProfile||rawUserId==='me'?user.id:rawUserId;const qc=useQueryClient();
 const [storyReply,setStoryReply]=useState('');const [showStoryViewers,setShowStoryViewers]=useState(false);const [selectedStory,setSelectedStory]=useState<string|null>(null);const [storyProgress,setStoryProgress]=useState(0);const [storyPaused,setStoryPaused]=useState(false);const [replyTo,setReplyTo]=useState<string|null>(null);const [showLikers,setShowLikers]=useState<Record<string,boolean>>({});const [showAllComments,setShowAllComments]=useState<Record<string,boolean>>({});const [comment,setComment]=useState<Record<string,string>>({});const [nickname,setNickname]=useState('');
 const [showFollowers,setShowFollowers]=useState(false);
 const followers=useInfiniteQuery({
  queryKey:['community','school-followers'],initialPageParam:1,
  queryFn:async({pageParam})=>(await api.get<{data:Pick<Person,'id'|'fullName'|'nickname'|'avatarUrl'>[];hasMore:boolean}>('/community/school/followers',{params:{page:pageParam}})).data,
  getNextPageParam:(lastPage,pages)=>lastPage.hasMore?pages.length+1:undefined,
  enabled:showFollowers,
 });
 const profile=useQuery({queryKey:['community','profile',userId],queryFn:async()=>(await api.get<Person>('/community/users/'+userId)).data,enabled:!!userId});
 const isStories=location.pathname==='/community/stories';const showSchool=location.pathname==='/community/school';
 const feed=useQuery({queryKey:['community','feed',userId,showSchool],queryFn:async()=>(await api.get<Post[]>('/community/feed',{params:{...(userId?{userId}:{}),...(!userId&&showSchool?{school:'true'}:{})}})).data});
 const school=useQuery({queryKey:['community','school'],queryFn:async()=>(await api.get<School>('/community/school')).data});
 const stories=useQuery({queryKey:['community','stories'],queryFn:async()=>(await api.get<Story[]>('/community/stories')).data});
 const replies=useQuery({queryKey:['community','story-replies',selectedStory],queryFn:async()=>(await api.get<{id:string;body:string;user:Person}[]>('/community/stories/'+selectedStory+'/replies')).data,enabled:!!selectedStory&&selectedStory!=='new'&&!!stories.data?.find(st=>st.id===selectedStory)?.schoolStory});
 const targetStory=new URLSearchParams(location.search).get('story');
 const openedStory=useRef<string|null>(null);
 useEffect(()=>{if(!targetStory||!stories.data||openedStory.current===targetStory)return;openedStory.current=targetStory;if(stories.data.some(story=>story.id===targetStory)){setSelectedStory(targetStory);setStoryProgress(0);action.mutate({path:'/community/stories/'+targetStory+'/view'});}else toast('انتهت القصة أو لم تعد متاحة');},[targetStory,stories.data]);
 const targetPost=new URLSearchParams(location.search).get('post');
 const targetComment=new URLSearchParams(location.search).get('comment');
 useEffect(()=>{
  if(!targetPost||!feed.data)return;
  setShowAllComments(current=>current[targetPost]?current:{...current,[targetPost]:true});
  const frame=window.requestAnimationFrame(()=>{
   const node=document.getElementById('community-comment-'+targetComment)||document.getElementById('community-post-'+targetPost);
   node?.scrollIntoView({behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth',block:'center'});
  });
  return()=>window.cancelAnimationFrame(frame);
 },[targetPost,targetComment,feed.data]);
 const storyOpen=!!selectedStory&&selectedStory!=='new';
 useEffect(()=>{
  if(!storyOpen)return;
  const previousOverflow=document.body.style.overflow;
  document.body.style.overflow='hidden';
  const onKeyDown=(event:KeyboardEvent)=>{if(event.key==='Escape')setSelectedStory(null);};
  window.addEventListener('keydown',onKeyDown);
  return()=>{document.body.style.overflow=previousOverflow;window.removeEventListener('keydown',onKeyDown);};
 },[storyOpen]);
 const storyIds=stories.data?.map(st=>st.id)??[];
 const navigateStory=(direction:number)=>{const index=storyIds.indexOf(selectedStory??'');const next=storyIds[index+direction];setStoryProgress(0);setShowStoryViewers(false);if(next){setSelectedStory(next);action.mutate({path:'/community/stories/'+next+'/view'});}else setSelectedStory(null);};
 useEffect(()=>{if(!selectedStory||selectedStory==='new'||storyPaused||showStoryViewers)return;const interval=window.setInterval(()=>setStoryProgress(value=>Math.min(value+1,100)),100);return()=>window.clearInterval(interval);},[selectedStory,storyPaused,showStoryViewers]);
 useEffect(()=>{if(storyProgress>=100&&selectedStory&&selectedStory!=='new')navigateStory(1);},[storyProgress]);
 const follow=useQuery({queryKey:['community','follow'],queryFn:async()=>(await api.get<{following:boolean;count:number}>('/community/school/follow')).data});
 const action=useMutation({mutationFn:async({path,data,method='post'}:{path:string;data?:unknown;method?:'post'|'patch'|'delete'})=>method==='delete'?api.delete(path):method==='patch'?api.patch(path,data):api.post(path,data),onSuccess:(response,variables)=>{void qc.invalidateQueries({queryKey:['community']});if(variables.path==='/community/posts'){response.data?.synced===0?toast('حُفظ المنشور محليًا، بانتظار المزامنة'):toast.success('تم نشر المنشور');}if(/\/(comments|replies)$/.test(variables.path)){const key=variables.path.split('/')[3];setComment(previous=>({...previous,[key]:''}));setReplyTo(null);if(response.data?.synced===0)toast('حُفظ التعليق على الجهاز، بانتظار المزامنة');}if(variables.path.endsWith('/direct-reply')){setStoryReply('');toast.success('تم إرسال الرد في المحادثة الخاصة');}if(variables.path==='/community/stories'){setSelectedStory(null);toast.success('تم نشر القصة');}},onError:e=>toast.error(apiError(e,'تعذر النشر. بقي النص محفوظاً؛ حاول مرة أخرى.'))});
 if(userId&&profile.isLoading)return <LoadingState/>;
 return <div className="community-page space-y-5">
  <Modal open={showFollowers} onClose={()=>setShowFollowers(false)} title="متابعو المدرسة" size="sm">
   {followers.isPending?<LoadingState/>:followers.isError?<div role="alert"><p>تعذر تحميل المتابعين. تحقق من الاتصال وحاول مجدداً.</p><Button onClick={()=>void followers.refetch()}>إعادة المحاولة</Button></div>:<div className="space-y-2">
    {followers.data?.pages.flatMap(page=>page.data).map(person=><Link key={person.id} to={'/community/users/'+person.id} onClick={()=>setShowFollowers(false)} className="flex items-center gap-3 rounded-xl p-3 hover:bg-slate-100"><Avatar name={person.fullName} src={person.avatarUrl} size={40}/><div className="min-w-0"><p className="break-words font-bold">{person.fullName}</p>{person.nickname&&<p className="text-sm text-slate-500">{person.nickname}</p>}</div></Link>)}
    {!followers.data?.pages[0]?.data.length&&<p className="py-6 text-center text-slate-500">لا يوجد متابعون للمدرسة بعد.</p>}
    {followers.hasNextPage&&<Button disabled={followers.isFetchingNextPage} onClick={()=>void followers.fetchNextPage()}>{followers.isFetchingNextPage?'جارٍ التحميل…':'عرض المزيد'}</Button>}
   </div>}
  </Modal>
  <PageHeader title={userId?(profile.data?.fullName??'الملف الشخصي'):(showSchool?'صفحة المدرسة':'المنشورات')} subtitle={undefined}/>
  <nav aria-label="صفحات المجتمع" className="hidden">
    <Link className="rounded-xl bg-slate-100 px-4 py-3 font-bold hover:bg-slate-200" to="/community/posts">📰 المنشورات</Link>
    <Link className="rounded-xl bg-slate-100 px-4 py-3 font-bold hover:bg-slate-200" to="/community/school">🏫 صفحة المدرسة</Link>
    <Link className="rounded-xl bg-slate-100 px-4 py-3 font-bold hover:bg-slate-200" to="/community/users/me">👤 ملفي الشخصي</Link>
    <Link className="rounded-xl bg-slate-100 px-4 py-3 font-bold hover:bg-slate-200" to="/notifications">🔔 الإشعارات</Link>
  </nav>
  {userId&&profile.data&&<section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm" dir="rtl">
    <div className="profile-cover relative min-h-48 sm:min-h-64" style={profile.data.coverAssetId ? {backgroundImage: `linear-gradient(#12372d33,#12372d66),url("${String(api.defaults.baseURL).replace(/\/$/, "")}/founder-assets/${encodeURIComponent(profile.data.coverAssetId)}/content")`,backgroundSize:"cover",backgroundPosition:"center"}:undefined}>
      <span className="sr-only">غلاف الملف الشخصي</span>
    </div>
    <div className="relative px-4 pb-6 sm:px-7">
      <div className="-mt-12 flex items-end justify-between gap-3">
        <div className="rounded-full border-4 border-white bg-white shadow-md"><Avatar name={profile.data.fullName} src={profile.data.avatarUrl} size={96}/></div>
        {userId===user.id&&<Link to="/profile/account" className="mb-2 inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-700 shadow-sm" aria-label="قائمة الحساب">⚙ إدارة الحساب وتسجيل الخروج</Link>}
      </div>
      <div className="mt-3 space-y-1">
        <h1 className="text-2xl font-extrabold text-slate-900">{profile.data.fullName}</h1>
        <p className="text-sm font-semibold text-slate-600">{profile.data.nickname||'بدون كنية'} · {ROLE_LABELS[profile.data.role as keyof typeof ROLE_LABELS]??profile.data.role}</p>
        {profile.data.bio&&<p className="whitespace-pre-wrap break-words pt-2 text-sm leading-7 text-slate-700">{profile.data.bio}</p>}
        {profile.data.username&&<p className="text-sm text-slate-500" dir="ltr">@{profile.data.username}</p>}
      </div>
      {userId===user.id&&<div className="mt-4 flex flex-wrap items-center gap-2"><Link className="btn-secondary inline-flex" to="/profile/settings">تعديل الملف الشخصي</Link><Link className="btn-secondary inline-flex" to="/community/posts/new">إنشاء منشور ＋</Link></div>}
      {userId===user.id&&<div className="mt-4 flex flex-wrap gap-2"><input className="input min-w-0 flex-1" aria-label="الكنية" maxLength={60} value={nickname} onChange={e=>setNickname(e.target.value)} placeholder={profile.data.nickname||'أضف كنيتك'}/><Button onClick={()=>action.mutate({path:'/community/nickname',data:{nickname},method:'patch'})}>حفظ الكنية</Button></div>}
    </div>
  </section>}
  {userId===user.id&&<Card><Link to="/community/posts/new" className="composer-launch"><Avatar name={user.fullName} src={user.avatarUrl} size={40}/><span>بماذا تفكر؟ يمكنك الإشارة إلى @المدرسة في منشورك</span><strong>إنشاء منشور ＋</strong></Link></Card>}
  {userId&&<h2 className="text-lg font-bold">منشورات {userId===user.id?'ملفي':profile.data?.fullName}</h2>}

  {!userId&&<Card><div className="mb-4 flex gap-4 overflow-x-auto pb-2" dir="rtl">
    <Link className="flex shrink-0 flex-col items-center gap-1" to="/community/stories/new"><span className="flex h-16 w-16 items-center justify-center rounded-full border-4 border-dashed border-primary-400 text-3xl">＋</span><span className="text-xs">قصتك</span></Link>
    {stories.data?.map(st=><button type="button" key={st.id} onClick={()=>{setShowStoryViewers(false);setStoryProgress(0);setStoryPaused(false);setSelectedStory(st.id);action.mutate({path:'/community/stories/'+st.id+'/view'});}} className="flex shrink-0 flex-col items-center gap-1"><span className={`story-ring p-1 ${st.views.some(v=>v.user.id===user.id)?'story-ring-seen':''}`}><Avatar name={st.schoolStory?(school.data?.name||'المدرسة'):st.author.fullName} src={st.schoolStory?school.data?.logoUrl:st.author.avatarUrl} size={56}/></span><span className="max-w-20 truncate text-xs" >{st.schoolStory?(school.data?.name||'المدرسة'):st.author.fullName}</span></button>)}
  </div>
  {stories.data?.filter(st=>st.id===selectedStory).map(st=>createPortal(<div key={st.id} role="dialog" aria-modal="true" aria-label="عرض الستوري" className="community-story-viewer fixed inset-0 z-[200] flex flex-col overflow-hidden bg-slate-950 text-white select-none" onPointerDown={e=>{if((e.target as HTMLElement).closest("button,a,input"))return;setStoryPaused(true);}} onPointerUp={()=>setStoryPaused(false)} onPointerCancel={()=>setStoryPaused(false) } dir="rtl">
    <div className="mx-auto mt-2 h-1 shrink-0 w-[94%] max-w-xl overflow-hidden rounded-full bg-white/30"><div className="h-full bg-white transition-[width] duration-100" style={{width:storyProgress+'%'}}/></div><div className="mx-auto flex w-full max-w-xl shrink-0 items-center justify-between gap-3 p-4"><Link to={st.schoolStory?"/community/school":"/community/users/"+st.authorId} onClick={()=>setSelectedStory(null)} className="flex items-center gap-3 hover:opacity-80"><Avatar name={st.schoolStory?(school.data?.name||'المدرسة'):st.author.fullName} src={st.schoolStory?school.data?.logoUrl:st.author.avatarUrl} size={44}/><div><div className="font-bold">{st.schoolStory?(school.data?.name||'المدرسة'):st.author.fullName}</div><div className="text-xs text-slate-300"></div></div></Link><div className="flex gap-4"><button type="button" onClick={()=>setSelectedStory(null)} aria-label="إغلاق الستوري" className="text-2xl">✕</button>{(st.authorId===user.id||user.role==='ADMIN')&&<button type="button" className="text-sm text-red-300" onClick={()=>{if(window.confirm('حذف الستوري نهائياً؟')){action.mutate({path:'/community/stories/'+st.id,method:'delete'});setSelectedStory(null);}}}>حذف</button>}</div></div>
    <div className="relative flex min-h-0 flex-1 items-center justify-center overflow-y-auto story-content px-8 py-10" style={{backgroundColor:st.background??'#123c30',color:st.textColor??'#ffffff'}}><button type="button" aria-label="الستوري السابقة" className="absolute inset-y-0 right-0 z-10 w-1/4" onClick={()=>navigateStory(-1)}/><button type="button" aria-label="الستوري التالية" className="absolute inset-y-0 left-0 z-10 w-1/4" onClick={()=>navigateStory(1)}/><div className="max-w-lg space-y-4">{st.mediaIds?.map(id=><CommunityImage key={id} id={id}/>)}<p className="max-w-lg whitespace-pre-wrap break-words text-center leading-relaxed" style={{fontSize:st.fontSize??28,fontWeight:st.bold===false?400:700}}><MentionText body={st.body} mentions={st.mentions}/></p></div></div>
    <div className="mx-auto max-h-[45%] w-full max-w-xl shrink-0 space-y-3 overflow-y-auto p-4 pb-[max(1rem,env(safe-area-inset-bottom))]"><div className="flex flex-wrap items-center gap-4 text-sm"><button onClick={()=>action.mutate({path:'/community/stories/'+st.id+'/like'})}>❤️ إعجاب ({st.views.filter(v=>v.liked).length})</button>{(st.authorId===user.id||user.role==='ADMIN')&&<button type="button" onClick={()=>setShowStoryViewers(v=>!v)} className="rounded-lg bg-white/10 px-3 py-2">👁 {st.views.length} مشاهدة · {showStoryViewers?'إخفاء':'عرض الأسماء'}</button>}</div>{showStoryViewers&&(st.authorId===user.id||user.role==='ADMIN')&&<div className="max-h-44 space-y-2 overflow-y-auto rounded-xl bg-white/10 p-3">{st.views.length===0?<p className="text-sm">ما في مشاهدات لسه</p>:st.views.map(v=><Link key={v.user.id} to={'/community/users/'+v.user.id} onClick={()=>setSelectedStory(null)} className="flex items-center gap-3 rounded-lg p-1 hover:bg-white/10"><Avatar name={v.user.fullName} src={v.user.avatarUrl} size={36}/><span className="flex-1 text-sm">{v.user.fullName}</span>{v.liked&&<span>❤️</span>}</Link>)}</div>}{st.authorId!==user.id&&<div className="border-t border-white/20 pt-3"><p className="mb-2 text-xs text-slate-300">الردود</p><div className="max-h-28 overflow-y-auto">{replies.data?.map(reply=><p key={reply.id} className="my-1 text-sm"><b>{reply.user.fullName}:</b> {reply.body}</p>)}</div><div className="mt-2 flex gap-2"><input className="input min-w-0 flex-1 text-slate-900" maxLength={500} value={storyReply} onChange={e=>setStoryReply(e.target.value)} aria-label="رد خاص على الستوري" placeholder="رد خاص على الستوري"/><Button disabled={!storyReply.trim()||action.isPending} onClick={()=>{action.mutate({path:'/community/stories/'+st.id+'/direct-reply',data:{body:storyReply}});}}>إرسال</Button></div></div>}</div>
  </div>,document.body,st.id))}
  <Link to="/community/posts/new" className="composer-launch"><Avatar name={user.fullName} src={user.avatarUrl} size={40}/><span>شارك إنجازك أو فكرة مع المدرسة…</span><strong>إنشاء منشور ＋</strong></Link></Card>}
  {!userId&&showSchool&&<Card><div className="school-cover"/><div className="-mt-8 flex items-end gap-3 px-3"><Avatar name={school.data?.name||'المدرسة'} src={school.data?.logoUrl} size={72}/><h2 className="pb-2 text-xl font-extrabold">{school.data?.name||'المدرسة'}</h2></div><p className="mt-3 text-sm text-slate-600">{school.data?.about||'صفحة المدرسة الرسمية'}</p><p className="mt-1 text-xs text-slate-500">{school.data?.address}</p><dl className="school-stats">{([['circles','الحلقات'],['students','الطلاب'],['teachers','المعلمون']] as const).map(([key,label])=><div key={key}><dt>{label}</dt><dd>{school.data?.stats?.[key]?.toLocaleString('ar')??'—'}</dd></div>)}</dl><Link to="/about" className="btn-secondary inline-flex mt-4">الملف التعريفي للمدرسة</Link>{user.role==='ADMIN'&&<Link to="/settings" className="ms-2 text-sm font-bold underline">تعديل بيانات المدرسة</Link>}<div className="mt-3 flex items-center gap-3"><button type="button" className="rounded-lg px-2 py-2 text-sm font-bold underline underline-offset-4 hover:bg-slate-100" aria-haspopup="dialog" onClick={()=>setShowFollowers(true)}>{follow.data?.count??0} متابع</button><Button onClick={()=>action.mutate({path:'/community/school/follow'})}>{follow.data?.following?'إلغاء المتابعة':'متابعة الصفحة'}</Button></div></Card>}
  {feed.isLoading ? <LoadingState/> : feed.isError ? <div role="alert" className="card p-5"><p>تعذر تحميل المنشورات.</p><Button onClick={()=>void feed.refetch()}>إعادة المحاولة</Button></div> : feed.data?.length ? feed.data.map(post=><PostCard key={post.id} post={post} userId={user.id} school={school.data} expanded={targetPost===post.id} highlightedComment={targetComment}/>) : <Card><p className="py-6 text-center text-slate-500">لا توجد منشورات بعد. شارك أولى خطواتك مع القرآن.</p></Card>}
 </div>;
}
