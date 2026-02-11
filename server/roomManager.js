// ─── Room Manager ───────────────────────────────────────────────────────────
// Manages multiple game rooms; handles creation, lookup, reconnection timers.

const { GameEngine } = require('./gameEngine');
const { generateRoomCode } = require('./utils');

class RoomManager {
    constructor() {
        this.rooms = new Map();             // roomCode → GameEngine
        this.playerRooms = new Map();       // playerId → roomCode
        this.disconnectTimers = new Map();  // socketId → { timer, playerId, roomCode }
    }

    createRoom() {
        let code;
        do { code = generateRoomCode(); } while (this.rooms.has(code));
        const engine = new GameEngine(code);
        this.rooms.set(code, engine);
        return code;
    }

    getRoom(code) {
        return this.rooms.get(code?.toUpperCase()) || null;
    }

    joinRoom(roomCode, playerId, playerName, socketId) {
        const engine = this.getRoom(roomCode);
        if (!engine) return { ok: false, reason: 'Room not found' };

        const result = engine.addPlayer(playerId, playerName, socketId);
        if (result.ok) {
            this.playerRooms.set(playerId, roomCode.toUpperCase());
        }
        return result;
    }

    getRoomForPlayer(playerId) {
        const code = this.playerRooms.get(playerId);
        return code ? this.getRoom(code) : null;
    }

    /**
     * Start a 120-second reconnection timer for a disconnected player.
     * Returns cleanup function.
     */
    startDisconnectTimer(socketId, playerId, roomCode, onTimeout) {
        // Clear any existing timer for this player
        this.clearDisconnectTimer(playerId);

        const timer = setTimeout(() => {
            this.disconnectTimers.delete(playerId);
            onTimeout();
        }, 120_000); // 2 minutes

        this.disconnectTimers.set(playerId, { timer, socketId, roomCode });
    }

    clearDisconnectTimer(playerId) {
        const entry = this.disconnectTimers.get(playerId);
        if (entry) {
            clearTimeout(entry.timer);
            this.disconnectTimers.delete(playerId);
        }
    }

    /**
     * Clean up an empty room.
     */
    cleanupRoom(roomCode) {
        const engine = this.getRoom(roomCode);
        if (!engine) return;

        const allDisconnected = engine.players.every(p => !p.connected);
        if (allDisconnected && engine.players.length > 0) {
            for (const p of engine.players) {
                this.playerRooms.delete(p.id);
                this.clearDisconnectTimer(p.id);
            }
            this.rooms.delete(roomCode);
        }
    }
}

module.exports = new RoomManager();
