// ─── Socket.IO client for Phone ─────────────────────────────────────────────
import { io } from 'socket.io-client';

const SERVER_URL = import.meta.env.VITE_SERVER_URL ||
    `http://${window.location.hostname}:3000`;

const socket = io(SERVER_URL, {
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionAttempts: 50,
    reconnectionDelay: 1000,
});

socket.on('connect', () => console.log('[Phone] Connected:', socket.id));
socket.on('disconnect', (reason) => console.log('[Phone] Disconnected:', reason));

export default socket;
