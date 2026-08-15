import { FormEvent, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { api, apiError } from '@/lib/api';
import { getSocket } from '@/lib/socket';
import { useAuthStore } from '@/store/auth';
import { useDebounce } from '@/hooks/useDebounce';
import {
  Avatar,
  Badge,
  Button,
  Card,
  EmptyState,
  Input,
  LoadingState,
  Modal,
  PageHeader,
  SearchInput,
  Spinner,
  Textarea,
  cx,
  useConfirm,
} from '@/components/ui';
import {
  IconChat,
  IconCheck,
  IconEdit,
  IconLock,
  IconPlus,
  IconSend,
  IconSettings,
  IconTrash,
  IconUsers,
  IconX,
} from '@/components/ui/Icons';
import { ROLE_COLORS, ROLE_LABELS } from '@/lib/labels';
import { timeAgo } from '@/lib/format';
import type { ChatMessage, Conversation, PaginatedResponse, Role } from '@/types';

export default function ChatPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user)!;
  const queryClient = useQueryClient();
  const confirm = useConfirm();

  const [showNew, setShowNew] = useState<'direct' | 'group' | null>(null);
  const [panel, setPanel] = useState<'members' | 'settings' | null>(null);
  const [search, setSearch] = useState('');
  const [body, setBody] = useState('');
  const [editing, setEditing] = useState<ChatMessage | null>(null);
  const [typingUsers, setTypingUsers] = useState<string[]>([]);

  const bottomRef = useRef<HTMLDivElement>(null);
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const typingTimer = useRef<ReturnType<typeof setTimeout>>();

  const { data: conversations, isLoading: loadingList } = useQuery({
    queryKey: ['chat', 'conversations'],
    queryFn: async () => (await api.get<Conversation[]>('/chat/conversations')).data,
    refetchInterval: 45000,
  });

  // The detail endpoint carries the member list and the moderation flags.
  const { data: active } = useQuery({
    queryKey: ['chat', 'conversation', id],
    queryFn: async () => (await api.get<Conversation>(`/chat/conversations/${id}`)).data,
    enabled: !!id,
  });

  const { data: messages, isLoading: loadingMessages } = useQuery({
    queryKey: ['chat', 'messages', id],
    queryFn: async () =>
      (await api.get<PaginatedResponse<ChatMessage>>(`/chat/conversations/${id}/messages`, { params: { limit: 100 } }))
        .data,
    enabled: !!id,
  });

  const markRead = useMutation({
    mutationFn: (conversationId: string) => api.patch(`/chat/conversations/${conversationId}/read`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['chat', 'conversations'] });
      queryClient.invalidateQueries({ queryKey: ['chat', 'unread'] });
    },
  });

  const send = useMutation({
    mutationFn: (text: string) => api.post(`/chat/conversations/${id}/messages`, { body: text }),
    onSuccess: () => {
      setBody('');
      queryClient.invalidateQueries({ queryKey: ['chat', 'messages', id] });
      queryClient.invalidateQueries({ queryKey: ['chat', 'conversations'] });
    },
    onError: (error) => toast.error(apiError(error)),
  });

  const edit = useMutation({
    mutationFn: ({ messageId, text }: { messageId: string; text: string }) =>
      api.patch(`/chat/conversations/${id}/messages/${messageId}`, { body: text }),
    onSuccess: () => {
      toast.success('تم تعديل الرسالة');
      setEditing(null);
      setBody('');
      queryClient.invalidateQueries({ queryKey: ['chat', 'messages', id] });
      queryClient.invalidateQueries({ queryKey: ['chat', 'conversations'] });
    },
    onError: (error) => toast.error(apiError(error)),
  });

  const remove = useMutation({
    mutationFn: (messageId: string) => api.delete(`/chat/conversations/${id}/messages/${messageId}`),
    onSuccess: () => {
      toast.success('تم حذف الرسالة');
      queryClient.invalidateQueries({ queryKey: ['chat', 'messages', id] });
      queryClient.invalidateQueries({ queryKey: ['chat', 'conversations'] });
    },
    onError: (error) => toast.error(apiError(error)),
  });

  // Join the room and clear the unread badge when opening a conversation.
  useEffect(() => {
    if (!id) return;
    getSocket()?.emit('conversation:join', { conversationId: id });
    markRead.mutate(id);
    setTypingUsers([]);
    setEditing(null);
    setBody('');
    setPanel(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;

    const onTyping = (p: { conversationId: string; userId: string; fullName: string; isTyping: boolean }) => {
      if (p.conversationId !== id || p.userId === user.id) return;
      setTypingUsers((prev) =>
        p.isTyping
          ? prev.includes(p.fullName)
            ? prev
            : [...prev, p.fullName]
          : prev.filter((n) => n !== p.fullName),
      );
    };
    const onEdited = () => queryClient.invalidateQueries({ queryKey: ['chat', 'messages', id] });
    const onConversationUpdated = () => {
      queryClient.invalidateQueries({ queryKey: ['chat', 'conversation', id] });
      queryClient.invalidateQueries({ queryKey: ['chat', 'conversations'] });
    };

    socket.on('typing', onTyping);
    socket.on('chat:message-edited', onEdited);
    socket.on('chat:conversation-updated', onConversationUpdated);
    return () => {
      socket.off('typing', onTyping);
      socket.off('chat:message-edited', onEdited);
      socket.off('chat:conversation-updated', onConversationUpdated);
    };
  }, [id, user.id, queryClient]);

  useEffect(() => {
    if (!editing) bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages?.data.length, id, editing]);

  const handleTyping = (value: string) => {
    setBody(value);
    const socket = getSocket();
    if (!socket || !id || editing) return;
    socket.emit('typing', { conversationId: id, isTyping: true });
    clearTimeout(typingTimer.current);
    typingTimer.current = setTimeout(() => socket.emit('typing', { conversationId: id, isTyping: false }), 1500);
  };

  const startEdit = (message: ChatMessage) => {
    setEditing(message);
    setBody(message.body);
    composerRef.current?.focus();
  };

  const cancelEdit = () => {
    setEditing(null);
    setBody('');
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const text = body.trim();
    if (!text || !id) return;
    if (editing) {
      if (text === editing.body) return cancelEdit();
      edit.mutate({ messageId: editing.id, text });
      return;
    }
    getSocket()?.emit('typing', { conversationId: id, isTyping: false });
    send.mutate(text);
  };

  const handleDelete = async (message: ChatMessage) => {
    const ok = await confirm({
      title: 'حذف الرسالة',
      message: 'سيتم حذف هذه الرسالة من المحادثة لدى جميع الأعضاء.',
      confirmLabel: 'حذف',
    });
    if (ok) remove.mutate(message.id);
  };

  const filtered = conversations?.filter((c) => c.title.toLowerCase().includes(search.toLowerCase())) ?? [];
  const isGroup = active?.type === 'GROUP';
  const canModerate = !!active?.isAdmin;

  return (
    <>
      <PageHeader
        title="المحادثات"
        subtitle="تواصل مباشر بين المعلمين والمشرفين وأولياء الأمور"
        action={
          <>
            <Button variant="secondary" icon={<IconPlus size={16} />} onClick={() => setShowNew('direct')}>
              محادثة جديدة
            </Button>
            <Button icon={<IconUsers size={16} />} onClick={() => setShowNew('group')}>
              مجموعة
            </Button>
          </>
        }
      />

      <div className="grid gap-5 lg:grid-cols-[20rem_1fr]">
        {/* Conversation list */}
        <Card className={cx('overflow-hidden', id && 'hidden lg:block')} padded={false}>
          <div className="border-b border-slate-100 p-3">
            <SearchInput value={search} onChange={setSearch} placeholder="بحث في المحادثات..." />
          </div>
          {loadingList ? (
            <LoadingState rows={4} />
          ) : !filtered.length ? (
            <EmptyState title="لا توجد محادثات" message="ابدأ محادثة جديدة للتواصل." icon={<IconChat size={24} />} />
          ) : (
            <ul className="max-h-[calc(100vh-20rem)] divide-y divide-slate-100 overflow-y-auto">
              {filtered.map((conversation) => (
                <li key={conversation.id}>
                  <button
                    onClick={() => navigate(`/chat/${conversation.id}`)}
                    className={cx(
                      'flex w-full items-center gap-3 px-4 py-3 text-right transition',
                      conversation.id === id ? 'bg-primary-50' : 'hover:bg-slate-50',
                    )}
                  >
                    <Avatar
                      name={conversation.title}
                      src={conversation.avatarUrl}
                      size={42}
                      online={conversation.type === 'DIRECT' ? conversation.isOnline : undefined}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1.5">
                        <span className="min-w-0 flex-1 truncate text-sm font-bold text-slate-800">
                          {conversation.title}
                        </span>
                        {conversation.isClosed && <IconLock size={12} className="shrink-0 text-slate-400" />}
                        {conversation.lastMessageAt && (
                          <span className="shrink-0 text-[10px] text-slate-400">
                            {timeAgo(conversation.lastMessageAt)}
                          </span>
                        )}
                      </span>
                      <span className="mt-0.5 flex items-center justify-between gap-2">
                        <span className="truncate text-xs text-slate-400">
                          {conversation.lastMessage
                            ? `${conversation.lastMessage.sender?.fullName?.split(' ')[0] ?? ''}: ${conversation.lastMessage.body}`
                            : conversation.type === 'GROUP'
                              ? `${conversation.memberCount} أعضاء`
                              : 'ابدأ المحادثة'}
                        </span>
                        {conversation.unreadCount > 0 && (
                          <span className="numeric grid h-5 min-w-5 shrink-0 place-items-center rounded-full bg-primary-600 px-1.5 text-[10px] font-bold text-white">
                            {conversation.unreadCount}
                          </span>
                        )}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Card>

        {/* Message pane */}
        <Card className={cx('flex flex-col overflow-hidden', !id && 'hidden lg:flex')} padded={false}>
          {!id ? (
            <EmptyState
              title="اختر محادثة"
              message="حدد محادثة من القائمة لعرض الرسائل، أو ابدأ محادثة جديدة."
              icon={<IconChat size={24} />}
            />
          ) : (
            <>
              <header className="flex items-center gap-3 border-b border-slate-100 px-4 py-3.5 sm:px-5">
                <button
                  className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 lg:hidden"
                  onClick={() => navigate('/chat')}
                  aria-label="رجوع"
                >
                  <IconX size={18} />
                </button>
                <Avatar
                  name={active?.title}
                  src={active?.avatarUrl}
                  size={40}
                  online={active?.type === 'DIRECT' ? active?.isOnline : undefined}
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-bold text-slate-800">{active?.title ?? 'محادثة'}</p>
                  <p className="truncate text-[11px] text-slate-400">
                    {typingUsers.length
                      ? `${typingUsers.join('، ')} يكتب الآن...`
                      : isGroup
                        ? `${active?.memberCount ?? 0} أعضاء`
                        : active?.isOnline
                          ? 'متصل الآن'
                          : 'غير متصل'}
                  </p>
                </div>

                {isGroup && active?.isClosed && (
                  <Badge className="hidden bg-slate-200 text-slate-600 sm:inline-flex">مغلقة</Badge>
                )}
                {isGroup && active?.adminOnly && !active.isClosed && (
                  <Badge className="hidden bg-amber-100 text-amber-800 sm:inline-flex">للمشرفين فقط</Badge>
                )}
                {!isGroup && active?.otherUser && (
                  <Badge className={cx('hidden sm:inline-flex', ROLE_COLORS[active.otherUser.role])}>
                    {ROLE_LABELS[active.otherUser.role]}
                  </Badge>
                )}

                {isGroup && (
                  <>
                    <button
                      onClick={() => setPanel('members')}
                      className="rounded-lg p-2 text-slate-500 transition hover:bg-slate-100"
                      title="أعضاء المجموعة"
                      aria-label="أعضاء المجموعة"
                    >
                      <IconUsers size={18} />
                    </button>
                    {canModerate && (
                      <button
                        onClick={() => setPanel('settings')}
                        className="rounded-lg p-2 text-slate-500 transition hover:bg-slate-100"
                        title="إعدادات المجموعة"
                        aria-label="إعدادات المجموعة"
                      >
                        <IconSettings size={18} />
                      </button>
                    )}
                  </>
                )}
              </header>

              <div
                className="flex-1 space-y-3 overflow-y-auto bg-slate-50/60 px-4 py-4 sm:px-5"
                style={{ minHeight: '24rem', maxHeight: 'calc(100vh - 24rem)' }}
              >
                {loadingMessages ? (
                  <div className="grid h-40 place-items-center">
                    <Spinner />
                  </div>
                ) : !messages?.data.length ? (
                  <EmptyState title="لا توجد رسائل بعد" message="اكتب أول رسالة لبدء المحادثة." icon={<IconChat size={24} />} />
                ) : (
                  messages.data.map((message, index) => {
                    const mine = message.sender.id === user.id;
                    const showAuthor = !mine && (index === 0 || messages.data[index - 1].sender.id !== message.sender.id);
                    // Author may edit; author or group admin may delete.
                    const canEdit = mine;
                    const canDelete = mine || canModerate;

                    return (
                      <div
                        key={message.id}
                        className={cx('group flex items-end gap-2', mine ? 'flex-row-reverse' : 'flex-row')}
                      >
                        {!mine && (
                          <div className="w-8 shrink-0">
                            {showAuthor && <Avatar name={message.sender.fullName} src={message.sender.avatarUrl} size={32} />}
                          </div>
                        )}

                        <div className={cx('max-w-[75%] min-w-0', mine && 'items-end')}>
                          {showAuthor && (
                            <p className="mb-1 text-[11px] font-bold text-slate-500">{message.sender.fullName}</p>
                          )}
                          <div
                            className={cx(
                              'rounded-2xl px-4 py-2.5 text-sm leading-6',
                              editing?.id === message.id && 'ring-2 ring-gold-400',
                              mine
                                ? 'rounded-tl-md bg-primary-700 text-white'
                                : 'rounded-tr-md border border-slate-100 bg-white text-slate-700',
                            )}
                          >
                            <p className="whitespace-pre-wrap break-words">{message.body}</p>
                          </div>
                          <p className={cx('mt-1 text-[10px] text-slate-400', mine && 'text-left')}>
                            {timeAgo(message.createdAt)}
                            {message.editedAt && <span className="mr-1">• مُعدَّلة</span>}
                          </p>
                        </div>

                        {/* Actions appear on hover / focus; only what the user may actually do. */}
                        {(canEdit || canDelete) && (
                          <div className="flex shrink-0 gap-0.5 self-center opacity-0 transition group-hover:opacity-100 focus-within:opacity-100">
                            {canEdit && (
                              <button
                                onClick={() => startEdit(message)}
                                className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-200 hover:text-slate-700"
                                title="تعديل"
                                aria-label="تعديل الرسالة"
                              >
                                <IconEdit size={14} />
                              </button>
                            )}
                            {canDelete && (
                              <button
                                onClick={() => handleDelete(message)}
                                className="rounded-lg p-1.5 text-slate-400 transition hover:bg-red-100 hover:text-red-600"
                                title="حذف"
                                aria-label="حذف الرسالة"
                              >
                                <IconTrash size={14} />
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
                <div ref={bottomRef} />
              </div>

              {active && !active.canPost ? (
                <p className="flex items-center justify-center gap-2 border-t border-slate-100 px-4 py-4 text-center text-xs text-slate-500">
                  <IconLock size={14} />
                  {active.isClosed
                    ? 'هذه المجموعة مغلقة، لا يمكن إرسال رسائل جديدة.'
                    : 'الإرسال في هذه المجموعة متاح لمشرفيها فقط.'}
                </p>
              ) : (
                <form onSubmit={submit} className="border-t border-slate-100 px-4 py-3">
                  {editing && (
                    <div className="mb-2 flex items-center gap-2 rounded-lg bg-gold-50 px-3 py-2 text-xs text-gold-800">
                      <IconEdit size={14} />
                      <span className="min-w-0 flex-1 truncate">تعديل: {editing.body}</span>
                      <button type="button" onClick={cancelEdit} className="shrink-0 font-bold hover:underline">
                        إلغاء
                      </button>
                    </div>
                  )}
                  <div className="flex items-end gap-2">
                    <textarea
                      ref={composerRef}
                      value={body}
                      onChange={(e) => handleTyping(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault();
                          submit(e);
                        }
                        if (e.key === 'Escape' && editing) cancelEdit();
                      }}
                      rows={1}
                      placeholder={editing ? 'عدّل رسالتك...' : 'اكتب رسالتك...'}
                      className="input max-h-32 min-h-[2.75rem] flex-1 resize-none py-2.5"
                    />
                    <Button
                      type="submit"
                      loading={send.isPending || edit.isPending}
                      disabled={!body.trim()}
                      icon={editing ? <IconCheck size={16} /> : <IconSend size={16} />}
                    >
                      {editing ? 'حفظ' : 'إرسال'}
                    </Button>
                  </div>
                </form>
              )}
            </>
          )}
        </Card>
      </div>

      {showNew && <NewConversationModal mode={showNew} onClose={() => setShowNew(null)} />}
      {panel === 'members' && active && (
        <MembersModal conversation={active} canModerate={canModerate} onClose={() => setPanel(null)} />
      )}
      {panel === 'settings' && active && (
        <GroupSettingsModal conversation={active} onClose={() => setPanel(null)} />
      )}
    </>
  );
}

// --- members ----------------------------------------------------------------

function MembersModal({
  conversation,
  canModerate,
  onClose,
}: {
  conversation: Conversation;
  canModerate: boolean;
  onClose: () => void;
}) {
  const user = useAuthStore((s) => s.user)!;
  const queryClient = useQueryClient();
  const confirm = useConfirm();
  const [adding, setAdding] = useState(false);

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['chat', 'conversation', conversation.id] });
    queryClient.invalidateQueries({ queryKey: ['chat', 'conversations'] });
  };

  const setAdmin = useMutation({
    mutationFn: ({ userId, isAdmin }: { userId: string; isAdmin: boolean }) =>
      api.patch(`/chat/conversations/${conversation.id}/members/${userId}`, { isAdmin }),
    onSuccess: (_, v) => {
      toast.success(v.isAdmin ? 'تمت ترقية العضو مشرفاً' : 'تمت إزالة الإشراف');
      refresh();
    },
    onError: (error) => toast.error(apiError(error)),
  });

  const removeMember = useMutation({
    mutationFn: (userId: string) => api.delete(`/chat/conversations/${conversation.id}/members/${userId}`),
    onSuccess: () => {
      toast.success('تمت إزالة العضو');
      refresh();
    },
    onError: (error) => toast.error(apiError(error)),
  });

  return (
    <>
      <Modal
        open
        onClose={onClose}
        title={`أعضاء المجموعة (${conversation.memberCount})`}
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={onClose}>
              إغلاق
            </Button>
            {canModerate && (
              <Button icon={<IconPlus size={15} />} onClick={() => setAdding(true)}>
                إضافة أعضاء
              </Button>
            )}
          </>
        }
      >
        <ul className="max-h-96 divide-y divide-slate-100 overflow-y-auto">
          {conversation.members.map((member) => {
            const isSelf = member.user.id === user.id;
            return (
              <li key={member.id} className="flex items-center gap-3 py-2.5">
                <Avatar name={member.user.fullName} src={member.user.avatarUrl} size={38} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-slate-800">
                    {member.user.fullName}
                    {isSelf && <span className="mr-1 text-[11px] font-normal text-slate-400">(أنت)</span>}
                  </p>
                  <p className="text-[11px] text-slate-400">{ROLE_LABELS[member.user.role]}</p>
                </div>

                {member.isAdmin && <Badge className="bg-primary-100 text-primary-800">مشرف</Badge>}

                {canModerate && !isSelf && (
                  <div className="flex shrink-0 gap-1">
                    <button
                      onClick={() => setAdmin.mutate({ userId: member.user.id, isAdmin: !member.isAdmin })}
                      className="rounded-lg px-2 py-1.5 text-[11px] font-bold text-slate-500 transition hover:bg-slate-100"
                      title={member.isAdmin ? 'إزالة الإشراف' : 'ترقية إلى مشرف'}
                    >
                      {member.isAdmin ? 'إزالة الإشراف' : 'ترقية'}
                    </button>
                    <button
                      onClick={async () => {
                        const ok = await confirm({
                          title: 'إزالة العضو',
                          message: `سيتم إخراج "${member.user.fullName}" من المجموعة.`,
                          confirmLabel: 'إزالة',
                        });
                        if (ok) removeMember.mutate(member.user.id);
                      }}
                      className="rounded-lg p-1.5 text-slate-400 transition hover:bg-red-50 hover:text-red-600"
                      title="إزالة من المجموعة"
                    >
                      <IconTrash size={14} />
                    </button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </Modal>

      {adding && (
        <AddMembersModal
          conversation={conversation}
          onClose={() => {
            setAdding(false);
            refresh();
          }}
        />
      )}
    </>
  );
}

function AddMembersModal({ conversation, onClose }: { conversation: Conversation; onClose: () => void }) {
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const debounced = useDebounce(search);

  const existing = new Set(conversation.members.map((m) => m.user.id));

  const { data: directory, isLoading } = useQuery({
    queryKey: ['users', 'directory', debounced],
    queryFn: async () =>
      (await api.get<{ id: string; fullName: string; role: Role; avatarUrl?: string | null }[]>('/users/directory', {
        params: { search: debounced || undefined },
      })).data,
  });

  const add = useMutation({
    mutationFn: () => api.post(`/chat/conversations/${conversation.id}/members`, { memberIds: selected }),
    onSuccess: () => {
      toast.success('تمت إضافة الأعضاء');
      onClose();
    },
    onError: (error) => toast.error(apiError(error)),
  });

  const candidates = directory?.filter((p) => !existing.has(p.id)) ?? [];

  return (
    <Modal
      open
      onClose={onClose}
      title="إضافة أعضاء"
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            إلغاء
          </Button>
          <Button onClick={() => add.mutate()} loading={add.isPending} disabled={!selected.length}>
            إضافة ({selected.length})
          </Button>
        </>
      }
    >
      <SearchInput value={search} onChange={setSearch} placeholder="ابحث عن مستخدم..." className="mb-3" />
      {isLoading ? (
        <LoadingState rows={3} />
      ) : !candidates.length ? (
        <EmptyState title="لا يوجد مستخدمون لإضافتهم" icon={<IconUsers size={22} />} />
      ) : (
        <ul className="max-h-72 space-y-1 overflow-y-auto">
          {candidates.map((person) => (
            <li key={person.id}>
              <button
                onClick={() =>
                  setSelected((prev) =>
                    prev.includes(person.id) ? prev.filter((x) => x !== person.id) : [...prev, person.id],
                  )
                }
                className={cx(
                  'flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-right transition',
                  selected.includes(person.id) ? 'bg-primary-50 ring-1 ring-primary-200' : 'hover:bg-slate-50',
                )}
              >
                <Avatar name={person.fullName} src={person.avatarUrl} size={34} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-slate-800">{person.fullName}</span>
                  <span className="text-[11px] text-slate-400">{ROLE_LABELS[person.role]}</span>
                </span>
                {selected.includes(person.id) && <span className="h-2.5 w-2.5 rounded-full bg-primary-600" />}
              </button>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
}

// --- group settings ---------------------------------------------------------

function GroupSettingsModal({ conversation, onClose }: { conversation: Conversation; onClose: () => void }) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const confirm = useConfirm();

  const [title, setTitle] = useState(conversation.title);
  const [description, setDescription] = useState(conversation.description ?? '');
  const [adminOnly, setAdminOnly] = useState(conversation.adminOnly);
  const [isClosed, setIsClosed] = useState(conversation.isClosed);

  const save = useMutation({
    mutationFn: () =>
      api.patch(`/chat/conversations/${conversation.id}`, { title, description, adminOnly, isClosed }),
    onSuccess: () => {
      toast.success('تم حفظ إعدادات المجموعة');
      queryClient.invalidateQueries({ queryKey: ['chat', 'conversation', conversation.id] });
      queryClient.invalidateQueries({ queryKey: ['chat', 'conversations'] });
      onClose();
    },
    onError: (error) => toast.error(apiError(error)),
  });

  const leave = useMutation({
    mutationFn: () => api.delete(`/chat/conversations/${conversation.id}/members/me`),
    onSuccess: () => {
      toast.success('تمت مغادرة المجموعة');
      queryClient.invalidateQueries({ queryKey: ['chat', 'conversations'] });
      onClose();
      navigate('/chat');
    },
    onError: (error) => toast.error(apiError(error)),
  });

  return (
    <Modal
      open
      onClose={onClose}
      title="إعدادات المجموعة"
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            إلغاء
          </Button>
          <Button onClick={() => save.mutate()} loading={save.isPending} disabled={!title.trim()}>
            حفظ
          </Button>
        </>
      }
    >
      <Input label="اسم المجموعة" required value={title} onChange={(e) => setTitle(e.target.value)} />
      <Textarea
        label="الوصف"
        className="mt-3"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
      />

      <div className="mt-4 space-y-2">
        <Toggle
          checked={adminOnly}
          onChange={setAdminOnly}
          label="الإرسال للمشرفين فقط"
          hint="يبقى الأعضاء قادرين على القراءة دون الكتابة"
        />
        <Toggle
          checked={isClosed}
          onChange={setIsClosed}
          label="إغلاق المجموعة"
          hint="إيقاف الرسائل الجديدة نهائياً مع الاحتفاظ بالسجل"
        />
      </div>

      <button
        onClick={async () => {
          const ok = await confirm({
            title: 'مغادرة المجموعة',
            message: 'لن تصلك رسائل هذه المجموعة بعد المغادرة.',
            confirmLabel: 'مغادرة',
          });
          if (ok) leave.mutate();
        }}
        className="mt-5 w-full rounded-xl border border-red-100 px-4 py-2.5 text-sm font-semibold text-red-600 transition hover:bg-red-50"
      >
        مغادرة المجموعة
      </button>
    </Modal>
  );
}

function Toggle({
  checked,
  onChange,
  label,
  hint,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  hint?: string;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200 px-3.5 py-3 transition hover:bg-slate-50">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 h-4 w-4 shrink-0 rounded border-slate-300 text-primary-600 focus:ring-primary-400"
      />
      <span className="min-w-0">
        <span className="block text-sm font-semibold text-slate-700">{label}</span>
        {hint && <span className="block text-[11px] text-slate-400">{hint}</span>}
      </span>
    </label>
  );
}

// --- new conversation -------------------------------------------------------

function NewConversationModal({ mode, onClose }: { mode: 'direct' | 'group'; onClose: () => void }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const [title, setTitle] = useState('');

  const debounced = useDebounce(search);

  const { data: directory, isLoading } = useQuery({
    queryKey: ['users', 'directory', debounced],
    queryFn: async () =>
      (await api.get<{ id: string; fullName: string; role: Role; avatarUrl?: string | null }[]>('/users/directory', {
        params: { search: debounced || undefined },
      })).data,
  });

  const create = useMutation({
    mutationFn: async () => {
      if (mode === 'direct') {
        return (await api.post('/chat/conversations/direct', { userId: selected[0] })).data;
      }
      return (await api.post('/chat/conversations/group', { title, memberIds: selected })).data;
    },
    onSuccess: (conversation: any) => {
      queryClient.invalidateQueries({ queryKey: ['chat', 'conversations'] });
      onClose();
      navigate(`/chat/${conversation.id}`);
    },
    onError: (error) => toast.error(apiError(error)),
  });

  const toggle = (userId: string) => {
    if (mode === 'direct') setSelected([userId]);
    else setSelected((prev) => (prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId]));
  };

  const canSubmit = mode === 'direct' ? selected.length === 1 : selected.length >= 1 && title.trim().length > 0;

  return (
    <Modal
      open
      onClose={onClose}
      title={mode === 'direct' ? 'محادثة جديدة' : 'إنشاء مجموعة'}
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            إلغاء
          </Button>
          <Button onClick={() => create.mutate()} loading={create.isPending} disabled={!canSubmit}>
            {mode === 'direct' ? 'بدء المحادثة' : 'إنشاء المجموعة'}
          </Button>
        </>
      }
    >
      {mode === 'group' && (
        <Input
          label="اسم المجموعة"
          required
          className="mb-3"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="مثال: معلمو حلقة الفرقان"
        />
      )}

      <SearchInput value={search} onChange={setSearch} placeholder="ابحث عن مستخدم..." className="mb-3" />

      {mode === 'group' && selected.length > 0 && (
        <p className="mb-2 text-xs text-slate-500">
          تم اختيار <span className="numeric font-bold">{selected.length}</span> عضو
        </p>
      )}

      {isLoading ? (
        <LoadingState rows={3} />
      ) : (
        <ul className="max-h-72 space-y-1 overflow-y-auto">
          {directory?.map((person) => (
            <li key={person.id}>
              <button
                onClick={() => toggle(person.id)}
                className={cx(
                  'flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-right transition',
                  selected.includes(person.id) ? 'bg-primary-50 ring-1 ring-primary-200' : 'hover:bg-slate-50',
                )}
              >
                <Avatar name={person.fullName} src={person.avatarUrl} size={36} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-slate-800">{person.fullName}</span>
                  <span className="text-[11px] text-slate-400">{ROLE_LABELS[person.role]}</span>
                </span>
                {selected.includes(person.id) && <span className="h-2.5 w-2.5 rounded-full bg-primary-600" />}
              </button>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
}
