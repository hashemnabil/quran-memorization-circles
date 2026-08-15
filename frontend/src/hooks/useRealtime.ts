import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { getSocket, disconnectSocket } from '@/lib/socket';
import { useAuthStore } from '@/store/auth';
import type { AppNotification, ChatMessage } from '@/types';

/**
 * Subscribes the whole app to the realtime channel once, translating socket
 * events into toast notifications and React Query cache invalidations.
 */
export function useRealtime() {
  const user = useAuthStore((s) => s.user);
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!user) {
      disconnectSocket();
      return;
    }

    const socket = getSocket();
    if (!socket) return;

    const onNotification = (payload: { notification: AppNotification }) => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
      queryClient.invalidateQueries({ queryKey: ['notifications', 'unread'] });
      // Business events also change list data (requests, exams, tickets).
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });

      toast(payload.notification.title, {
        icon: '🔔',
        duration: 5000,
        style: { direction: 'rtl' },
      });
    };

    const onChatMessage = (message: ChatMessage) => {
      queryClient.setQueryData<{ pages?: unknown } | undefined>(
        ['chat', 'messages', message.conversationId],
        (old: any) => {
          if (!old?.data) return old;
          if (old.data.some((m: ChatMessage) => m.id === message.id)) return old;
          return { ...old, data: [...old.data, message] };
        },
      );
      queryClient.invalidateQueries({ queryKey: ['chat', 'conversations'] });
      queryClient.invalidateQueries({ queryKey: ['chat', 'unread'] });
    };

    const onInbox = ({ message }: { conversationId: string; message: ChatMessage }) => {
      queryClient.invalidateQueries({ queryKey: ['chat', 'conversations'] });
      queryClient.invalidateQueries({ queryKey: ['chat', 'unread'] });
      if (message.sender.id !== user.id) {
        toast(`${message.sender.fullName}: ${message.body.slice(0, 60)}`, {
          icon: '✉️',
          style: { direction: 'rtl' },
        });
      }
    };

    const onSupportMessage = () => {
      queryClient.invalidateQueries({ queryKey: ['support'] });
    };

    const onDeleted = ({ conversationId }: { conversationId: string }) => {
      queryClient.invalidateQueries({ queryKey: ['chat', 'messages', conversationId] });
    };

    socket.on('notification:new', onNotification);
    socket.on('chat:message', onChatMessage);
    socket.on('chat:inbox', onInbox);
    socket.on('chat:message-deleted', onDeleted);
    socket.on('support:message', onSupportMessage);

    return () => {
      socket.off('notification:new', onNotification);
      socket.off('chat:message', onChatMessage);
      socket.off('chat:inbox', onInbox);
      socket.off('chat:message-deleted', onDeleted);
      socket.off('support:message', onSupportMessage);
    };
  }, [user, queryClient]);
}
