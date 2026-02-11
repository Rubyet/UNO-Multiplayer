// ─── Socket.IO client for TV ────────────────────────────────────────────────
import { io } from 'socket.io-client';

// Connect to the server. In dev mode the server is on port 3000, same host.
const SERVER_URL = import.meta.env.VITE_SERVER_URL ||
    `http://${window.location.hostname}:3000`;

const socket = io(SERVER_URL, {
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionAttempts: 20,
    reconnectionDelay: 1000,
});

socket.on('connect', () => console.log('[TV] Connected:', socket.id));
socket.on('disconnect', (reason) => console.log('[TV] Disconnected:', reason));

export default socket;
