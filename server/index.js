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

app.get('/', (_req, res) => res.json({ status: 'UNO server running' }));

// ── Broadcast helpers ──────────────────────────────────────────────────────
function broadcastState(roomCode) {
  const engine = roomManager.getRoom(roomCode);
  if (!engine) return;
  io.to(roomCode).emit('state_update', engine.getPublicState());
}

function sendAllHands(roomCode) {
  const engine = roomManager.getRoom(roomCode);
  if (!engine) return;
  for (const p of engine.players) {
    if (p.connected) {
      io.to(p.socketId).emit('hand_update', engine.getPlayerState(p.id));
    }
  }
}

function sendHand(engine, playerId) {
  const p = engine.getPlayer(playerId);
  if (!p || !p.connected) return;
  io.to(p.socketId).emit('hand_update', engine.getPlayerState(playerId));
}

// ── Socket.IO ──────────────────────────────────────────────────────────────
io.on('connection', (socket) => {
  let currentPlayerId = null;
  let currentRoomCode = null;

  // ──── TV: create_room ────────────────────────────────────────────────
  socket.on('create_room', (callback) => {
    const roomCode = roomManager.createRoom();
    socket.join(roomCode);
    currentRoomCode = roomCode;
    const cb = typeof callback === 'function' ? callback : () => {};
    cb({ ok: true, roomCode });
    socket.emit('room_created', { roomCode });
  });

  // ──── Phone: join_room ───────────────────────────────────────────────
  socket.on('join_room', ({ roomCode, playerName, playerId: existingId }, callback) => {
    const code = roomCode?.toUpperCase();
    const engine = roomManager.getRoom(code);
    const cb = typeof callback === 'function' ? callback : () => {};

    if (!engine) return cb({ ok: false, reason: 'Room not found' });

    // 1. Reconnect by existing playerId
    let playerId = existingId;
    if (playerId && engine.getPlayer(playerId)) {
      engine.reconnectPlayer(playerId, socket.id);
      roomManager.clearDisconnectTimer(playerId);
    }
    // 2. Reconnect by name (same room + same name)
    else if (playerName) {
      const existing = engine.findPlayerByName(playerName);
      if (existing && !existing.connected) {
        // Reconnect this player
        playerId = existing.id;
        engine.reconnectPlayer(playerId, socket.id);
        roomManager.clearDisconnectTimer(playerId);
      } else if (existing && existing.connected && engine.phase !== Phase.LOBBY) {
        // Game in progress — allow reconnect (old socket hasn't timed out yet)
        playerId = existing.id;
        engine.reconnectPlayer(playerId, socket.id);
        roomManager.clearDisconnectTimer(playerId);
      } else if (existing && existing.connected) {
        return cb({ ok: false, reason: 'Name already taken in this room' });
      } else {
        // Fresh join
        playerId = uuidv4();
        const joinResult = roomManager.joinRoom(code, playerId, playerName, socket.id);
        if (!joinResult.ok) return cb(joinResult);
      }
    } else {
      playerId = uuidv4();
      const joinResult = roomManager.joinRoom(code, playerId, playerName || 'Player', socket.id);
      if (!joinResult.ok) return cb(joinResult);
    }

    currentPlayerId = playerId;
    currentRoomCode = code;
    socket.join(code);

    const player = engine.getPlayer(playerId);
    cb({ ok: true, playerId, roomCode: code, playerName: player.name, gameInProgress: engine.phase !== Phase.LOBBY });

    io.to(code).emit('player_joined', {
      playerId,
      playerName: player.name,
      players: engine.getPublicState().players,
    });

    // If game in progress, send full state to reconnecting player
    if (engine.phase !== Phase.LOBBY) {
      broadcastState(code);
      sendHand(engine, playerId);

      // Resend special prompts if needed
      if (engine.phase === Phase.AWAITING_COLOR && engine._pendingWildPlayerId === playerId) {
        socket.emit('color_selection_required', { playerId });
      }
      if (engine.phase === Phase.AWAITING_CHALLENGE) {
        const nextIdx = engine._nextIndex();
        const challenger = engine.players[nextIdx];
        if (challenger && challenger.id === playerId && engine.challengeEnabled) {
          socket.emit('challenge_available', {
            offenderId: engine._lastPlayerId,
            color: engine.currentColor,
          });
        }
      }
    }
  });

  // ──── TV: start_game ─────────────────────────────────────────────────
  socket.on('start_game', (callback) => {
    const cb = typeof callback === 'function' ? callback : () => {};
    if (!currentRoomCode) return cb({ ok: false, reason: 'No room' });

    const engine = roomManager.getRoom(currentRoomCode);
    if (!engine) return cb({ ok: false, reason: 'Room not found' });

    const result = engine.startGame();
    if (!result.ok) return cb(result);

    cb({ ok: true });

    // Emit dealing sequence for animation, then game start
    io.to(currentRoomCode).emit('game_started', {
      firstCard: result.firstCard,
      effects: result.effects,
      dealSequence: result.dealSequence,
      players: engine.getPublicState().players,
      roomCode: currentRoomCode,
    });

    broadcastState(currentRoomCode);
    sendAllHands(currentRoomCode);
  });

  // ──── Phone: play_card ───────────────────────────────────────────────
  socket.on('play_card', ({ cardId }, callback) => {
    const cb = typeof callback === 'function' ? callback : () => {};
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

    // Broadcast UNO penalty if it happened
    if (result.unoPenalty) {
      io.to(currentRoomCode).emit('uno_penalty', {
        playerId: result.unoPenalty.playerId,
      });
    }

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

    if (result.effects) {
      for (const eff of result.effects) {
        io.to(currentRoomCode).emit('card_effect', eff);
      }
    }
  });

  // ──── Phone: choose_color ────────────────────────────────────────────
  socket.on('choose_color', ({ color }, callback) => {
    const cb = typeof callback === 'function' ? callback : () => {};
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
      const target = engine.getPlayer(result.challengeTarget);
      if (target && target.connected) {
        io.to(target.socketId).emit('challenge_available', {
          offenderId: result.playerId,
          color: result.color,
        });
      }
    }

    // Broadcast effects (e.g. draw4 no-challenge)
    if (result.effects) {
      for (const eff of result.effects) {
        io.to(currentRoomCode).emit('card_effect', eff);
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

  // ──── Phone: challenge_wild ──────────────────────────────────────────
  socket.on('challenge_wild', ({ doChallenge }, callback) => {
    const cb = typeof callback === 'function' ? callback : () => {};
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

  // ──── Phone: draw_card ───────────────────────────────────────────────
  socket.on('draw_card', (callback) => {
    const cb = typeof callback === 'function' ? callback : () => {};
    if (!currentPlayerId || !currentRoomCode) return cb({ ok: false });

    const engine = roomManager.getRoom(currentRoomCode);
    if (!engine) return cb({ ok: false });

    const result = engine.drawCard(currentPlayerId);
    if (!result.ok) {
      socket.emit('invalid_move', { reason: result.reason });
      return cb(result);
    }

    cb({ ok: true, drawCount: result.drawCount });
    io.to(currentRoomCode).emit('draw_event', {
      playerId: currentPlayerId,
      drawCount: result.drawCount,
    });
    broadcastState(currentRoomCode);
    sendAllHands(currentRoomCode);
  });

  // ──── Phone: say_uno ─────────────────────────────────────────────────
  socket.on('say_uno', (callback) => {
    const cb = typeof callback === 'function' ? callback : () => {};
    if (!currentPlayerId || !currentRoomCode) return cb({ ok: false });

    const engine = roomManager.getRoom(currentRoomCode);
    if (!engine) return cb({ ok: false });

    const result = engine.sayUno(currentPlayerId);
    if (!result.ok) return cb(result);

    cb({ ok: true });
    // Broadcast UNO event with player info for TV animation
    io.to(currentRoomCode).emit('uno_event', {
      effect: result.effect,
      playerId: result.playerId,
      playerName: result.playerName,
    });
    broadcastState(currentRoomCode);
    sendAllHands(currentRoomCode);
  });

  // ──── TV/Phone: next_round ───────────────────────────────────────────
  socket.on('next_round', (callback) => {
    const cb = typeof callback === 'function' ? callback : () => {};
    if (!currentRoomCode) return cb({ ok: false });

    const engine = roomManager.getRoom(currentRoomCode);
    if (!engine) return cb({ ok: false });

    const result = engine.startGame();
    if (!result.ok) return cb(result);

    cb({ ok: true });
    io.to(currentRoomCode).emit('game_started', {
      firstCard: result.firstCard,
      effects: result.effects,
      dealSequence: result.dealSequence,
      players: engine.getPublicState().players,
      roomCode: currentRoomCode,
    });
    broadcastState(currentRoomCode);
    sendAllHands(currentRoomCode);
  });

  // ──── TV: set_challenge ─────────────────────────────────────────
  socket.on('set_challenge', ({ enabled }, callback) => {
    const cb = typeof callback === 'function' ? callback : () => {};
    if (!currentRoomCode) return cb({ ok: false });

    const engine = roomManager.getRoom(currentRoomCode);
    if (!engine) return cb({ ok: false });

    const result = engine.setChallengeEnabled(enabled);
    if (result.ok) {
      io.to(currentRoomCode).emit('setting_changed', { challengeEnabled: engine.challengeEnabled });
    }
    cb(result);
  });

  // ──── Disconnection ──────────────────────────────────────────────────
  socket.on('disconnect', () => {
    if (!currentPlayerId || !currentRoomCode) return;

    const engine = roomManager.getRoom(currentRoomCode);
    if (!engine) return;

    // Only disconnect if this socket is still the player's active socket
    const player = engine.getPlayer(currentPlayerId);
    if (!player || player.socketId !== socket.id) return;

    engine.disconnectPlayer(currentPlayerId);
    broadcastState(currentRoomCode);

    roomManager.startDisconnectTimer(
      socket.id,
      currentPlayerId,
      currentRoomCode,
      () => {
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

// ── Start ──────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`UNO Server listening on port ${PORT}`);
});
