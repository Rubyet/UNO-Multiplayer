// ─── UNO Multiplayer Server ─────────────────────────────────────────────────
require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');

const roomManager = require('./roomManager');
const { Phase } = require('./gameEngine');

const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);

const io = new Server(server, {
    cors: { origin: '*', methods: ['GET', 'POST'] },
    pingInterval: 10000,
    pingTimeout: 20000,
});

// ─── Health check ───────────────────────────────────────────────────────────
app.get('/', (_req, res) => res.json({ status: 'UNO server running' }));

// ─── Helper: broadcast state to all sockets in a room ──────────────────────
function broadcastState(roomCode) {
    const engine = roomManager.getRoom(roomCode);
    if (!engine) return;
    const publicState = engine.getPublicState();
    io.to(roomCode).emit('state_update', publicState);
}

// Send private hand to every player in the room
function sendAllHands(roomCode) {
    const engine = roomManager.getRoom(roomCode);
    if (!engine) return;
    for (const p of engine.players) {
        if (p.connected) {
            const ps = engine.getPlayerState(p.id);
            io.to(p.socketId).emit('hand_update', ps);
        }
    }
}

// Send private hand to a single player
function sendHand(engine, playerId) {
    const p = engine.getPlayer(playerId);
    if (!p || !p.connected) return;
    const ps = engine.getPlayerState(playerId);
    io.to(p.socketId).emit('hand_update', ps);
}

// ─── Socket.IO connection ──────────────────────────────────────────────────
io.on('connection', (socket) => {
    let currentPlayerId = null;
    let currentRoomCode = null;

    // ──── TV: create_room ────────────────────────────────────────────────────
    socket.on('create_room', (callback) => {
        const roomCode = roomManager.createRoom();
        socket.join(roomCode);
        currentRoomCode = roomCode;
        const cb = typeof callback === 'function' ? callback : () => { };
        cb({ ok: true, roomCode });
        // Also emit for non-callback listeners
        socket.emit('room_created', { roomCode });
    });

    // ──── Phone: join_room ───────────────────────────────────────────────────
    socket.on('join_room', ({ roomCode, playerName, playerId: existingId }, callback) => {
        const code = roomCode?.toUpperCase();
        const engine = roomManager.getRoom(code);
        const cb = typeof callback === 'function' ? callback : () => { };

        if (!engine) return cb({ ok: false, reason: 'Room not found' });

        // Reconnection: reuse existing ID if provided and player exists
        let playerId = existingId;
        if (playerId && engine.getPlayer(playerId)) {
            engine.reconnectPlayer(playerId, socket.id);
            roomManager.clearDisconnectTimer(playerId);
        } else {
            playerId = uuidv4();
            const joinResult = roomManager.joinRoom(code, playerId, playerName, socket.id);
            if (!joinResult.ok) return cb(joinResult);
        }

        currentPlayerId = playerId;
        currentRoomCode = code;
        socket.join(code);

        cb({ ok: true, playerId, roomCode: code });
        io.to(code).emit('player_joined', {
            playerId,
            playerName: engine.getPlayer(playerId).name,
            players: engine.getPublicState().players,
        });

        // If game in progress, send current state to reconnecting player
        if (engine.phase !== Phase.LOBBY) {
            broadcastState(code);
            sendHand(engine, playerId);
        }
    });

    // ──── TV: start_game ─────────────────────────────────────────────────────
    socket.on('start_game', (callback) => {
        const cb = typeof callback === 'function' ? callback : () => { };
        if (!currentRoomCode) return cb({ ok: false, reason: 'No room' });

        const engine = roomManager.getRoom(currentRoomCode);
        if (!engine) return cb({ ok: false, reason: 'Room not found' });

        const result = engine.startGame();
        if (!result.ok) return cb(result);

        cb({ ok: true });
        io.to(currentRoomCode).emit('game_started', {
            firstCard: result.firstCard,
            effects: result.effects,
        });
        broadcastState(currentRoomCode);
        sendAllHands(currentRoomCode);
    });

    // ──── Phone: play_card ───────────────────────────────────────────────────
    socket.on('play_card', ({ cardId }, callback) => {
        const cb = typeof callback === 'function' ? callback : () => { };
        if (!currentPlayerId || !currentRoomCode)
            return cb({ ok: false, reason: 'Not in a game' });

        const engine = roomManager.getRoom(currentRoomCode);
        if (!engine) return cb({ ok: false, reason: 'Room gone' });

        const result = engine.playCard(currentPlayerId, cardId);
        if (!result.ok) {
            socket.emit('invalid_move', { reason: result.reason });
            return cb(result);
        }

        cb({ ok: true });

        if (result.effect === 'awaiting_color') {
            socket.emit('color_selection_required', { playerId: currentPlayerId });
            broadcastState(currentRoomCode);
            sendAllHands(currentRoomCode);
            return;
        }

        if (result.roundOver) {
            io.to(currentRoomCode).emit(result.gameOver ? 'game_over' : 'round_over', {
                winnerId: result.winnerId,
                roundScore: result.roundScore,
                totalScore: result.totalScore,
                scores: result.scores,
                handScores: result.handScores,
            });
        }

        broadcastState(currentRoomCode);
        sendAllHands(currentRoomCode);

        // Emit card-specific animation events
        if (result.effects) {
            for (const eff of result.effects) {
                io.to(currentRoomCode).emit('card_effect', eff);
            }
        }
    });

    // ──── Phone: choose_color ────────────────────────────────────────────────
    socket.on('choose_color', ({ color }, callback) => {
        const cb = typeof callback === 'function' ? callback : () => { };
        if (!currentPlayerId || !currentRoomCode) return cb({ ok: false });

        const engine = roomManager.getRoom(currentRoomCode);
        if (!engine) return cb({ ok: false });

        const result = engine.chooseColor(currentPlayerId, color);
        if (!result.ok) {
            socket.emit('invalid_move', { reason: result.reason });
            return cb(result);
        }

        cb({ ok: true });

        if (result.effect === 'awaiting_challenge') {
            // Notify target player they can challenge
            const target = engine.getPlayer(result.challengeTarget);
            if (target && target.connected) {
                io.to(target.socketId).emit('challenge_available', {
                    offenderId: result.playerId,
                    color: result.color,
                });
            }
        }

        if (result.roundOver) {
            io.to(currentRoomCode).emit(result.gameOver ? 'game_over' : 'round_over', {
                winnerId: result.winnerId,
                roundScore: result.roundScore,
                scores: result.scores,
            });
        }

        broadcastState(currentRoomCode);
        sendAllHands(currentRoomCode);
    });

    // ──── Phone: challenge_wild ──────────────────────────────────────────────
    socket.on('challenge_wild', ({ doChallenge }, callback) => {
        const cb = typeof callback === 'function' ? callback : () => { };
        if (!currentPlayerId || !currentRoomCode) return cb({ ok: false });

        const engine = roomManager.getRoom(currentRoomCode);
        if (!engine) return cb({ ok: false });

        const result = engine.challengeWild(currentPlayerId, doChallenge);
        if (!result.ok) {
            socket.emit('invalid_move', { reason: result.reason });
            return cb(result);
        }

        cb({ ok: true });

        io.to(currentRoomCode).emit('challenge_result', {
            effect: result.effect,
            challengerId: result.challengerId,
            offenderId: result.offenderId,
            drew: result.drew,
            drewPlayer: result.drewPlayer,
        });

        broadcastState(currentRoomCode);
        sendAllHands(currentRoomCode);
    });

    // ──── Phone: draw_card ───────────────────────────────────────────────────
    socket.on('draw_card', (callback) => {
        const cb = typeof callback === 'function' ? callback : () => { };
        if (!currentPlayerId || !currentRoomCode) return cb({ ok: false });

        const engine = roomManager.getRoom(currentRoomCode);
        if (!engine) return cb({ ok: false });

        const result = engine.drawCard(currentPlayerId);
        if (!result.ok) {
            socket.emit('invalid_move', { reason: result.reason });
            return cb(result);
        }

        cb({ ok: true });
        broadcastState(currentRoomCode);
        sendAllHands(currentRoomCode);
    });

    // ──── Phone: say_uno ─────────────────────────────────────────────────────
    socket.on('say_uno', (callback) => {
        const cb = typeof callback === 'function' ? callback : () => { };
        if (!currentPlayerId || !currentRoomCode) return cb({ ok: false });

        const engine = roomManager.getRoom(currentRoomCode);
        if (!engine) return cb({ ok: false });

        const result = engine.sayUno(currentPlayerId);
        if (!result.ok) return cb(result);

        cb({ ok: true });
        io.to(currentRoomCode).emit('uno_event', result);
        broadcastState(currentRoomCode);
        sendAllHands(currentRoomCode);
    });

    // ──── TV/Phone: next_round ───────────────────────────────────────────────
    socket.on('next_round', (callback) => {
        const cb = typeof callback === 'function' ? callback : () => { };
        if (!currentRoomCode) return cb({ ok: false });

        const engine = roomManager.getRoom(currentRoomCode);
        if (!engine) return cb({ ok: false });

        const result = engine.startGame();
        if (!result.ok) return cb(result);

        cb({ ok: true });
        io.to(currentRoomCode).emit('game_started', {
            firstCard: result.firstCard,
            effects: result.effects,
        });
        broadcastState(currentRoomCode);
        sendAllHands(currentRoomCode);
    });

    // ──── Disconnection ──────────────────────────────────────────────────────
    socket.on('disconnect', () => {
        if (!currentPlayerId || !currentRoomCode) return;

        const engine = roomManager.getRoom(currentRoomCode);
        if (!engine) return;

        engine.disconnectPlayer(currentPlayerId);
        broadcastState(currentRoomCode);

        // Start reconnection grace period
        roomManager.startDisconnectTimer(
            socket.id,
            currentPlayerId,
            currentRoomCode,
            () => {
                // Timeout: remove player permanently
                const eng = roomManager.getRoom(currentRoomCode);
                if (eng) {
                    eng.removePlayer(currentPlayerId);
                    broadcastState(currentRoomCode);
                    roomManager.cleanupRoom(currentRoomCode);
                }
            }
        );
    });
});

// ─── Start ─────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
    console.log(`UNO Server listening on port ${PORT}`);
});
