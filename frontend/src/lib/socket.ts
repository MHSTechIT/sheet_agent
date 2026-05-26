'use client';
import { io, Socket } from 'socket.io-client';
import { API_BASE } from './api';

let socket: Socket | null = null;

export function getSocket(): Socket {
  if (!socket) {
    socket = io(API_BASE, {
      transports: ['polling', 'websocket'],
      autoConnect: true,
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,        // start retrying 1s after a drop
      reconnectionDelayMax: 5000,     // cap retry delay at 5s
      timeout: 20000,
    });
  }
  return socket;
}
