import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { api, apiError } from '@/lib/api';
import { notifyWriteSuccess } from '@/lib/write-feedback';
import { Avatar, Button, Card, Input, Modal, Textarea, useConfirm } from '@/components/ui';
import { IconHeart, IconChat, IconEdit, IconTrash } from '@/components/ui/Icons';

type Person = { id: string; fullName: string; avatarUrl?: string | null };
export type CommunityPost = {
  id: string; synced?: number; body: string; schoolPost: boolean; createdAt: string;
  author: Person; likes: {user: Person}[]; _count: {likes: number; comments: number};
  comments: {id: string; synced?: number; body: string; parentId?: string | null; user: Person; _count?: {likes: number}}[];
};

export default function PostCard({post, userId, school, expanded = false, highlightedComment}: {
  post: CommunityPost; userId: string; school?: {name: string; logoUrl: string | null}; expanded?: boolean; highlightedComment?: string | null;
}) {
  const queryClient = useQueryClient();
  const confirm = useConfirm();
  const [showComments, setShowComments] = useState(expanded);
  const [showLikers, setShowLikers] = useState(false);
  const [draft, setDraft] = useState('');
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [reply, setReply] = useState('');
  const [edit, setEdit] = useState<{id: string; kind: 'posts' | 'comments'; body: string} | null>(null);
  const [heart, setHeart] = useState(false);
  const heartTimer = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => () => clearTimeout(heartTimer.current), []);
  useEffect(() => { if (expanded) setShowComments(true); }, [expanded]);
  const liked = post.likes.some(like => like.user.id === userId);
  const action = useMutation({
    mutationFn: async ({path, body, method = 'post'}: {path: string; body?: string; method?: 'post' | 'patch' | 'delete'}) =>
      method === 'delete' ? api.delete(path) : method === 'patch' ? api.patch(path, {body}) : api.post(path, body === undefined ? undefined : {body}),
    onSuccess: (response, variables) => {
      void queryClient.invalidateQueries({queryKey: ['community']});
      if (variables.method === 'patch') { setEdit(null); notifyWriteSuccess(response, 'تم حفظ التعديل'); }
      if (variables.path.endsWith('/comments')) { setDraft(''); setShowComments(true); }
      if (variables.path.endsWith('/replies')) { setReply(''); setReplyTo(null); setShowComments(true); }
    },
    onError: error => toast.error(apiError(error, 'تعذر حفظ التغيير. حاول مجددًا.')),
  });
  const like = (double = false) => {
    if (action.isPending) return;
    if (double || !liked) { setHeart(true); clearTimeout(heartTimer.current); heartTimer.current = setTimeout(() => setHeart(false), 500); }
    if (!double || !liked) action.mutate({path: `/community/posts/${post.id}/like`});
  };
  const share = async () => {
    const url = `${window.location.origin}/community/posts?post=${encodeURIComponent(post.id)}`;
    try {
      if (navigator.share) await navigator.share({title: 'منشور من دوائر القرآن الكريم', url});
      else { await navigator.clipboard.writeText(url); toast.success('تم نسخ رابط المنشور'); }
    } catch (error) { if (!(error instanceof DOMException && error.name === 'AbortError')) toast.error('تعذرت المشاركة؛ حاول مجددًا'); }
  };
  const name = post.schoolPost ? school?.name || 'المدرسة' : post.author.fullName;
  const profileUrl = post.schoolPost ? '/community/school' : `/community/users/${post.author.id}`;
  return <article id={`community-post-${post.id}`} className={`community-post ${expanded ? 'community-post-highlight' : ''}`}>
    <Card>
      <header className="post-author">
        <Link to={profileUrl}><Avatar name={name} src={post.schoolPost ? school?.logoUrl : post.author.avatarUrl} size={44}/></Link>
        <div className="min-w-0 flex-1"><Link className="font-bold hover:underline" to={profileUrl}>{name}</Link><time className="block text-xs text-slate-500" dateTime={post.createdAt}>{new Date(post.createdAt).toLocaleString('ar')}</time></div>
        {post.author.id === userId && <details className="post-options"><summary aria-label="خيارات المنشور">•••</summary><div>
          <button type="button" onClick={() => setEdit({id: post.id, kind: 'posts', body: post.body})}><IconEdit size={16}/>تعديل</button>
          <button type="button" disabled={action.isPending} className="text-red-600" onClick={async () => { if (await confirm({title: 'حذف المنشور', message: 'هل تريد حذف هذا المنشور؟', variant: 'danger'})) action.mutate({path: `/community/posts/${post.id}`, method: 'delete'}); }}><IconTrash size={16}/>حذف</button>
        </div></details>}
      </header>
      {post.synced === 0 && <p role="status" className="mt-3 text-xs text-amber-700">بانتظار المزامنة — محفوظ على الجهاز</p>}
      <div className="post-content" onDoubleClick={() => like(true)}>
        <p className="whitespace-pre-wrap break-words">{post.body.split(/(@المدرسة)/g).map((part, index) => part === '@المدرسة' ? <Link key={index} to="/community/school" className="font-bold text-primary-700">{part}</Link> : part)}</p>
        {heart && <span className="post-heart" aria-hidden="true"><IconHeart size={64}/></span>}
      </div>
      <div className="post-counts"><button type="button" onClick={() => setShowLikers(value => !value)} aria-expanded={showLikers}>{post._count.likes} إعجاب · {showLikers ? 'إخفاء الأسماء' : 'عرض الأسماء'}</button><span>{post._count.comments} تعليق</span></div>
      <div className="post-actions">
        <button type="button" disabled={action.isPending} aria-pressed={liked} onClick={() => like()}><IconHeart size={19}/>{liked ? 'أعجبني' : 'إعجاب'}</button>
        <button type="button" aria-expanded={showComments} onClick={() => setShowComments(value => !value)}><IconChat size={19}/>التعليقات</button>
        <button type="button" onClick={() => void share()}><span aria-hidden="true">↗</span>مشاركة</button>
      </div>
      {showLikers && <div className="post-likers"><h3 className="mb-3 text-sm font-bold">الأشخاص الذين أعجبوا بالمنشور</h3><div className="flex flex-wrap gap-3">{post.likes.map(like => <Link key={like.user.id} to={`/community/users/${like.user.id}`} className="flex items-center gap-2 text-sm"><Avatar name={like.user.fullName} src={like.user.avatarUrl} size={28}/>{like.user.fullName}</Link>)}</div>{post._count.likes > post.likes.length && <p className="text-xs text-slate-500">يتم عرض أول {post.likes.length} إعجاب</p>}</div>}
      {showComments && <div className="post-comments">
        {post.comments.map(comment => <div key={comment.id} id={`community-comment-${comment.id}`} className={`post-comment ${comment.parentId ? 'post-comment-reply' : ''} ${highlightedComment === comment.id ? 'ring-2 ring-emerald-500' : ''}`}>
          <Link className="font-bold" to={`/community/users/${comment.user.id}`}>{comment.user.fullName}</Link><p className="whitespace-pre-wrap break-words">{comment.body}</p>
          {comment.synced === 0 && <small>بانتظار المزامنة</small>}
          <div className="flex flex-wrap gap-3 text-xs text-slate-600">
            <button type="button" disabled={action.isPending} onClick={() => action.mutate({path: `/community/comments/${comment.id}/like`})}>♡ إعجاب {comment._count?.likes ?? 0}</button>
            <button type="button" onClick={() => { setReplyTo(replyTo === comment.id ? null : comment.id); setReply(''); }}>رد</button>
            {comment.user.id === userId && <button type="button" onClick={() => setEdit({id: comment.id, kind: 'comments', body: comment.body})}>تعديل</button>}
          </div>
          {replyTo === comment.id && <form className="mt-2 flex gap-2" onSubmit={event => { event.preventDefault(); if (reply.trim()) action.mutate({path: `/community/comments/${comment.id}/replies`, body: reply}); }}><Input aria-label="اكتب ردك" maxLength={500} value={reply} onChange={event => setReply(event.target.value)} className="min-w-0 flex-1"/><Button type="submit" loading={action.isPending} disabled={!reply.trim()}>رد</Button></form>}
        </div>)}
        {post.comments.length === 0 && <p className="py-3 text-center text-sm text-slate-500">ابدأ الحوار بتعليق لطيف.</p>}
      </div>}
      <form className="mt-4 flex gap-2" onSubmit={event => { event.preventDefault(); if (draft.trim()) action.mutate({path: `/community/posts/${post.id}/comments`, body: draft}); }}>
        <Input aria-label="اكتب تعليقًا" placeholder="اكتب تعليقًا…" maxLength={500} value={draft} onChange={event => setDraft(event.target.value)} className="min-w-0 flex-1"/><Button type="submit" loading={action.isPending} disabled={!draft.trim()}>تعليق</Button>
      </form>
      <Modal open={!!edit} onClose={() => { if (!action.isPending) setEdit(null); }} title={edit?.kind === 'posts' ? 'تعديل المنشور' : 'تعديل التعليق'}>
        {edit && <form className="space-y-4" onSubmit={event => { event.preventDefault(); if (edit.body.trim()) action.mutate({path: `/community/${edit.kind}/${edit.id}`, method: 'patch', body: edit.body}); }}><Textarea label="المحتوى" rows={5} value={edit.body} maxLength={edit.kind === 'posts' ? 2000 : 500} onChange={event => setEdit({...edit, body: event.target.value})}/><Button type="submit" loading={action.isPending} disabled={!edit.body.trim()}>حفظ التعديل</Button></form>}
      </Modal>
    </Card>
  </article>;
}
