import { io, Socket } from 'socket.io-client';
import { api } from './api';

let socket: Socket | null = null;

export function getSocket(): Socket | null {
  return socket;
}

export function connectSocket(): Socket {
  const token = api.getToken();
  const socketUrl = import.meta.env.VITE_API_URL || window.location.origin;

  // If already connected with valid socket, reuse it
  if (socket && socket.connected) {
    return socket;
  }

  if (socket) {
    socket.disconnect();
  }

  socket = io(socketUrl, {
    auth: { token },
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionAttempts: 20,
    reconnectionDelay: 1000,
  });

  socket.on('connect', () => {
    console.log('[XXQ Socket] Connected to real-time gateway');
  });

  socket.on('connect_error', (err) => {
    console.warn('[XXQ Socket] Connection error:', err.message);
  });

  return socket;
}

export function disconnectSocket() {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}
