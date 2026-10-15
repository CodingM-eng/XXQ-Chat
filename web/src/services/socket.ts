import { io, Socket } from 'socket.io-client';
import { api } from './api';
import { Message } from '../types';

let socket: Socket | null = null;

export function getSocket(): Socket | null {
  return socket;
}

export function connectSocket(onMessageNew?: (msg: Message) => void): Socket {
  const token = api.getToken();

  if (socket) {
    socket.disconnect();
  }

  const socketUrl = import.meta.env.VITE_API_URL || window.location.origin;

  socket = io(socketUrl, {
    auth: { token },
    reconnection: true,
    reconnectionAttempts: 10,
    reconnectionDelay: 1000,
  });

  socket.on('connect', () => {
    console.log('[XXQ Socket] Connected to real-time gateway');
  });

  socket.on('connect_error', (err) => {
    console.warn('[XXQ Socket] Connection error:', err.message);
  });

  if (onMessageNew) {
    socket.on('message:new', onMessageNew);
  }

  return socket;
}

export function disconnectSocket() {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}
