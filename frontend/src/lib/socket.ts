import { io, type Socket } from 'socket.io-client';
import { tokenStore } from './api';

let socket: Socket | null = null;

/**
 * A single shared Socket.IO connection, used exclusively for real-time chat
 * and notifications. Everything else goes over REST.
 */
export function getSocket(): Socket | null {
  const token = tokenStore.access();
  if (!token) return null;

  if (!socket) {
    const url = import.meta.env.VITE_SOCKET_URL || window.location.origin;
    socket = io(`${url}/realtime`, {
      path: '/socket.io',
      auth: { token },
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1500,
    });
  } else if (socket.auth && typeof socket.auth === 'object') {
    // Refresh the token used on the next reconnect attempt.
    (socket.auth as Record<string, unknown>).token = token;
  }

  if (!socket.connected) socket.connect();
  return socket;
}

export function disconnectSocket() {
  socket?.disconnect();
  socket = null;
}
