// ─── UNO Game Engine ────────────────────────────────────────────────────────
// Authoritative state machine for a single UNO game / round.

const { createShuffledDeck, shuffle, COLORS } = require('./deck');
const { scoreHand } = require('./utils');

const Phase = {
  LOBBY: 'lobby',
  PLAYING: 'playing',
  AWAITING_COLOR: 'awaiting_color',
  AWAITING_CHALLENGE: 'awaiting_challenge',
  ROUND_OVER: 'round_over',
  GAME_OVER: 'game_over',
};

const Step = {
  TURN_START: 'turn_start',
  PLAYER_ACTION: 'player_action',
  VALIDATE: 'validate',
  APPLY_EFFECT: 'apply_effect',
  CHECK_WIN: 'check_win',
  ADVANCE: 'advance',
};

const HAND_SIZE = 7;
const BASE_WIN_SCORE = 500;

// Avatar pool assigned round-robin
const AVATARS = [
  'cat', 'dog', 'fox', 'owl', 'bear',
  'rabbit', 'panda', 'koala', 'lion', 'penguin',
];

class GameEngine {
  constructor(roomCode) {
    this.roomCode = roomCode;
    this.phase = Phase.LOBBY;
    this.step = null;

    this.players = [];
    this.direction = 1;
    this.currentPlayerIndex = 0;

    this.drawPile = [];
    this.discardPile = [];
    this.currentColor = null;
    this.currentValue = null;

    // +2 stacking accumulator
    this.drawStack = 0;

    // Dynamic win score (scales with player count)
    this.winScore = BASE_WIN_SCORE;

    // Wild Draw 4 challenge tracking
    this._lastPlayerId = null;
    this._lastPlayerHandSnapshot = null;

    // Pending color choice
    this._pendingWildPlayerId = null;

    // UNO: player must press UNO when at 2 cards BEFORE playing.
    // If they don't, auto-penalty 1 card after their play drops them to 1.
    this._unoCalledBeforePlay = {};

    this._turnLock = false;
    this.challengeEnabled = false;
    this._drawStackType = null;
  }

  // ══════════════════════════════════════════════════════════════════
  // PLAYER MANAGEMENT
  // ══════════════════════════════════════════════════════════════════

  addPlayer(id, name, socketId) {
    if (this.phase !== Phase.LOBBY) return { ok: false, reason: 'Game already in progress' };
    if (this.players.length >= 10) return { ok: false, reason: 'Room is full (max 10)' };
    if (this.players.find(p => p.id === id)) return { ok: false, reason: 'Already joined' };

    // Unique name check
    const nameLower = name.trim().toLowerCase();
    if (this.players.find(p => p.name.toLowerCase() === nameLower)) {
      return { ok: false, reason: 'Name already taken in this room' };
    }

    this.players.push({
      id,
      name: name.trim(),
      socketId,
      hand: [],
      score: 0,
      saidUno: false,
      connected: true,
      avatar: AVATARS[this.players.length % AVATARS.length],
    });
    return { ok: true };
  }

  removePlayer(id) {
    this.players = this.players.filter(p => p.id !== id);
    if (this.currentPlayerIndex >= this.players.length && this.players.length > 0) {
      this.currentPlayerIndex = 0;
    }
  }

  reconnectPlayer(id, newSocketId) {
    const p = this.players.find(x => x.id === id);
    if (p) { p.socketId = newSocketId; p.connected = true; delete p.disconnectTime; }
    return p;
  }

  /** Find a player by name (case-insensitive) for reconnection. */
  findPlayerByName(name) {
    return this.players.find(p => p.name.toLowerCase() === name.trim().toLowerCase());
  }

  disconnectPlayer(id) {
    const p = this.players.find(x => x.id === id);
    if (p) { p.connected = false; p.disconnectTime = Date.now(); }
    return p;
  }

  getPlayer(id) {
    return this.players.find(x => x.id === id);
  }

  // ══════════════════════════════════════════════════════════════════
  // START GAME / ROUND
  // ══════════════════════════════════════════════════════════════════

  startGame() {
    if (this.players.length < 2) return { ok: false, reason: 'Need at least 2 players' };
    if (this.phase !== Phase.LOBBY && this.phase !== Phase.ROUND_OVER)
      return { ok: false, reason: 'Cannot start now' };
    return this._startRound();
  }

  _startRound() {
    this.drawPile = createShuffledDeck();
    this.discardPile = [];
    this.direction = 1;
    this.currentPlayerIndex = 0;

    // Scale win score: 500 for 2 players, +250 per extra player
    this.winScore = BASE_WIN_SCORE + Math.max(0, this.players.length - 2) * 250;
    this._turnLock = false;
    this.drawStack = 0;
    this._drawStackType = null;
    this._unoCalledBeforePlay = {};

    for (const p of this.players) { p.hand = []; p.saidUno = false; }

    // Build a dealing sequence for client-side animation
    const dealSequence = [];
    for (let i = 0; i < HAND_SIZE; i++) {
      for (const p of this.players) {
        const card = this._drawOne();
        p.hand.push(card);
        dealSequence.push({ playerId: p.id, card });
      }
    }

    // First card (no wild_draw4 allowed as opening card)
    let firstCard = this._drawOne();
    while (firstCard.value === 'wild_draw4') {
      this.drawPile.push(firstCard);
      shuffle(this.drawPile);
      firstCard = this._drawOne();
    }

    this.discardPile.push(firstCard);
    this.currentColor = firstCard.color === 'wild' ? null : firstCard.color;
    this.currentValue = firstCard.value;

    this.phase = Phase.PLAYING;
    this.step = Step.TURN_START;

    const effects = this._applyFirstCardEffects(firstCard);

    if (firstCard.color === 'wild') {
      this.phase = Phase.AWAITING_COLOR;
      this._pendingWildPlayerId = this.players[this.currentPlayerIndex].id;
    }

    return { ok: true, firstCard, effects, dealSequence };
  }

  _applyFirstCardEffects(card) {
    const effects = [];
    const n = this.players.length;
    switch (card.value) {
      case 'skip':
        effects.push({ type: 'skip', playerId: this.players[this.currentPlayerIndex].id });
        this.currentPlayerIndex = this._nextIndex();
        break;
      case 'reverse':
        if (n === 2) {
          effects.push({ type: 'skip', playerId: this.players[this.currentPlayerIndex].id });
          this.currentPlayerIndex = this._nextIndex();
        } else {
          this.direction *= -1;
          effects.push({ type: 'reverse' });
          this.currentPlayerIndex = this._wrapIndex(0 + this.direction);
        }
        break;
      case 'draw2': {
        const target = this.players[this.currentPlayerIndex];
        for (let i = 0; i < 2; i++) target.hand.push(this._drawOne());
        effects.push({ type: 'draw2', playerId: target.id });
        this.currentPlayerIndex = this._nextIndex();
        break;
      }
      case 'wild':
        effects.push({ type: 'choose_color', playerId: this.players[this.currentPlayerIndex].id });
        break;
    }
    return effects;
  }

  // ══════════════════════════════════════════════════════════════════
  // PLAY CARD
  // ══════════════════════════════════════════════════════════════════

  playCard(playerId, cardId) {
    if (this._turnLock) return { ok: false, reason: 'Action in progress' };
    if (this.phase !== Phase.PLAYING)
      return { ok: false, reason: 'Not accepting plays right now' };

    const currentPlayer = this.players[this.currentPlayerIndex];
    if (currentPlayer.id !== playerId)
      return { ok: false, reason: 'Not your turn' };

    const cardIndex = currentPlayer.hand.findIndex(c => c.id === cardId);
    if (cardIndex === -1) return { ok: false, reason: 'Card not in hand' };

    const card = currentPlayer.hand[cardIndex];

    // Stacking: if stack is active, only matching type is allowed
    if (this.drawStack > 0) {
      if (this._drawStackType === 'draw2' && card.value !== 'draw2') {
        return { ok: false, reason: 'You must play a +2 or draw cards' };
      }
      if (this._drawStackType === 'draw4' && card.value !== 'wild_draw4') {
        return { ok: false, reason: 'You must play a +4 or draw cards' };
      }
    }

    if (!this._isPlayable(card))
      return { ok: false, reason: 'Card cannot be played' };

    this._turnLock = true;

    // Snapshot for W+4 challenge
    if (card.value === 'wild_draw4') {
      this._lastPlayerId = playerId;
      this._lastPlayerHandSnapshot = currentPlayer.hand.map(c => ({ ...c }));
    }

    currentPlayer.hand.splice(cardIndex, 1);
    this.discardPile.push(card);
    this.currentValue = card.value;

    // UNO enforcement: player had 2 cards → now 1
    let unoPenalty = null;
    if (currentPlayer.hand.length === 1) {
      if (!this._unoCalledBeforePlay[playerId]) {
        const penaltyCard = this._drawOne();
        currentPlayer.hand.push(penaltyCard);
        unoPenalty = { playerId, penaltyCard };
        currentPlayer.saidUno = false;
      } else {
        currentPlayer.saidUno = true;
      }
      delete this._unoCalledBeforePlay[playerId];
    } else {
      currentPlayer.saidUno = false;
      delete this._unoCalledBeforePlay[playerId];
    }

    // Wild cards → need color choice
    if (card.color === 'wild') {
      this._pendingWildPlayerId = playerId;
      this.phase = Phase.AWAITING_COLOR;
      this._turnLock = false;
      return {
        ok: true, card,
        effect: 'awaiting_color',
        playerId,
        handCount: currentPlayer.hand.length,
        unoPenalty,
      };
    }

    this.currentColor = card.color;
    const result = this._applyCardEffect(card, currentPlayer);
    this._turnLock = false;
    return { ...result, unoPenalty };
  }

  // ══════════════════════════════════════════════════════════════════
  // COLOR CHOICE
  // ══════════════════════════════════════════════════════════════════

  chooseColor(playerId, color) {
    if (this.phase !== Phase.AWAITING_COLOR)
      return { ok: false, reason: 'No color choice pending' };
    if (this._pendingWildPlayerId !== playerId)
      return { ok: false, reason: 'Not your color choice' };
    if (!COLORS.includes(color))
      return { ok: false, reason: 'Invalid color' };

    this.currentColor = color;
    this._pendingWildPlayerId = null;

    const topCard = this.discardPile[this.discardPile.length - 1];
    const currentPlayer = this.players.find(p => p.id === playerId);

    if (topCard.value === 'wild_draw4') {
      if (this.challengeEnabled) {
        this.phase = Phase.AWAITING_CHALLENGE;
        const nextIdx = this._nextIndex();
        const nextPlayer = this.players[nextIdx];
        return {
          ok: true,
          effect: 'awaiting_challenge',
          color,
          challengeTarget: nextPlayer.id,
          playerId,
        };
      } else {
        // Challenge disabled — stack +4 and advance
        this.drawStack += 4;
        this._drawStackType = 'draw4';
        this.phase = Phase.PLAYING;
        this.currentPlayerIndex = this._nextIndex();
        this.step = Step.TURN_START;
        return {
          ok: true, color,
          effects: [{ type: 'wild_draw4', stack: this.drawStack }],
        };
      }
    }

    // Normal wild – advance turn
    this.phase = Phase.PLAYING;
    const result = this._applyCardEffect(topCard, currentPlayer);
    return { ...result, color };
  }

  // ══════════════════════════════════════════════════════════════════
  // CHALLENGE WILD DRAW 4
  // ══════════════════════════════════════════════════════════════════

  challengeWild(challengerId, doChallenge) {
    if (this.phase !== Phase.AWAITING_CHALLENGE)
      return { ok: false, reason: 'No challenge pending' };

    const nextIdx = this._nextIndex();
    const challenger = this.players[nextIdx];
    if (challenger.id !== challengerId)
      return { ok: false, reason: 'Not your challenge' };

    const offender = this.players.find(p => p.id === this._lastPlayerId);
    this.phase = Phase.PLAYING;

    if (!doChallenge) {
      for (let i = 0; i < 4; i++) challenger.hand.push(this._drawOne());
      this.currentPlayerIndex = this._nextIndex();
      this.currentPlayerIndex = this._nextIndex();
      this.step = Step.TURN_START;
      return {
        ok: true, effect: 'challenge_declined',
        challengerId: challenger.id, offenderId: offender.id,
        drew: 4, drewPlayer: challenger.id,
      };
    }

    const prevColor = this._getPreviousColor();
    const hadMatch = this._lastPlayerHandSnapshot.some(
      c => c.color === prevColor && c.value !== 'wild_draw4' && c.value !== 'wild'
    );

    if (hadMatch) {
      for (let i = 0; i < 4; i++) offender.hand.push(this._drawOne());
      this.currentPlayerIndex = nextIdx;
      this.step = Step.TURN_START;
      return {
        ok: true, effect: 'challenge_success',
        challengerId: challenger.id, offenderId: offender.id,
        drew: 4, drewPlayer: offender.id,
      };
    } else {
      for (let i = 0; i < 6; i++) challenger.hand.push(this._drawOne());
      this.currentPlayerIndex = this._nextIndex();
      this.currentPlayerIndex = this._nextIndex();
      this.step = Step.TURN_START;
      return {
        ok: true, effect: 'challenge_fail',
        challengerId: challenger.id, offenderId: offender.id,
        drew: 6, drewPlayer: challenger.id,
      };
    }
  }

  // ══════════════════════════════════════════════════════════════════
  // DRAW CARD
  // ══════════════════════════════════════════════════════════════════

  drawCard(playerId) {
    if (this._turnLock) return { ok: false, reason: 'Action in progress' };
    if (this.phase !== Phase.PLAYING)
      return { ok: false, reason: 'Cannot draw now' };

    const currentPlayer = this.players[this.currentPlayerIndex];
    if (currentPlayer.id !== playerId)
      return { ok: false, reason: 'Not your turn' };

    this._turnLock = true;

    // If +2 stack is active, draw the full stack
    const drawCount = this.drawStack > 0 ? this.drawStack : 1;
    const drawnCards = [];
    for (let i = 0; i < drawCount; i++) {
      const c = this._drawOne();
      currentPlayer.hand.push(c);
      drawnCards.push(c);
    }
    this.drawStack = 0;
    this._drawStackType = null;

    this.currentPlayerIndex = this._nextIndex();
    this.step = Step.TURN_START;
    this._turnLock = false;

    return {
      ok: true, effect: 'draw', playerId,
      drawnCards, drawCount,
      handCount: currentPlayer.hand.length,
    };
  }

  // ══════════════════════════════════════════════════════════════════
  // SAY UNO — press when at 2 cards, before playing
  // ══════════════════════════════════════════════════════════════════

  sayUno(playerId) {
    const player = this.players.find(p => p.id === playerId);
    if (!player) return { ok: false, reason: 'Player not found' };

    if (player.hand.length !== 2) {
      return { ok: false, reason: 'Can only call UNO with 2 cards' };
    }
    if (this._unoCalledBeforePlay[playerId]) {
      return { ok: false, reason: 'Already called UNO' };
    }

    this._unoCalledBeforePlay[playerId] = true;
    player.saidUno = true;
    return { ok: true, effect: 'uno_said', playerId, playerName: player.name };
  }

  setChallengeEnabled(enabled) {
    if (this.phase !== Phase.LOBBY && this.phase !== Phase.ROUND_OVER)
      return { ok: false, reason: 'Can only change in lobby' };
    this.challengeEnabled = !!enabled;
    return { ok: true };
  }

  // ══════════════════════════════════════════════════════════════════
  // INTERNAL HELPERS
  // ══════════════════════════════════════════════════════════════════

  _isPlayable(card) {
    if (card.color === 'wild') return true;
    if (card.color === this.currentColor) return true;
    if (card.value === this.currentValue) return true;
    return false;
  }

  _applyCardEffect(card, player) {
    const effects = [];
    const n = this.players.length;

    switch (card.value) {
      case 'skip':
        this.currentPlayerIndex = this._nextIndex();
        effects.push({ type: 'skip', skippedId: this.players[this.currentPlayerIndex].id });
        this.currentPlayerIndex = this._nextIndex();
        break;

      case 'reverse':
        if (n === 2) {
          this.currentPlayerIndex = this._nextIndex();
          effects.push({ type: 'skip', skippedId: this.players[this.currentPlayerIndex].id });
          this.currentPlayerIndex = this._nextIndex();
        } else {
          this.direction *= -1;
          effects.push({ type: 'reverse', direction: this.direction });
          this.currentPlayerIndex = this._nextIndex();
        }
        break;

      case 'draw2':
        this.drawStack += 2;
        this._drawStackType = 'draw2';
        effects.push({ type: 'draw2', stack: this.drawStack });
        this.currentPlayerIndex = this._nextIndex();
        break;

      case 'wild':
        this.currentPlayerIndex = this._nextIndex();
        effects.push({ type: 'wild' });
        break;

      case 'wild_draw4':
        effects.push({ type: 'wild_draw4' });
        break;

      default:
        this.currentPlayerIndex = this._nextIndex();
        break;
    }

    this.step = Step.TURN_START;

    if (player.hand.length === 0) {
      return this._handleRoundWin(player, card, effects);
    }

    return { ok: true, card, effects, playerId: player.id, handCount: player.hand.length };
  }

  _handleRoundWin(winner, card, effects) {
    let roundScore = 0;
    const handScores = {};
    for (const p of this.players) {
      if (p.id !== winner.id) {
        const s = scoreHand(p.hand);
        roundScore += s;
        handScores[p.id] = s;
      }
    }
    winner.score += roundScore;

    const isGameOver = winner.score >= this.winScore;
    this.phase = isGameOver ? Phase.GAME_OVER : Phase.ROUND_OVER;

    return {
      ok: true, card, effects,
      playerId: winner.id, handCount: 0,
      roundOver: true, gameOver: isGameOver,
      winnerId: winner.id, roundScore,
      totalScore: winner.score, handScores,
      scores: this._getScores(),
    };
  }

  _drawOne() {
    if (this.drawPile.length === 0) this._reshuffleDiscard();
    if (this.drawPile.length === 0) this.drawPile = createShuffledDeck();
    return this.drawPile.pop();
  }

  _reshuffleDiscard() {
    if (this.discardPile.length <= 1) return;
    const top = this.discardPile.pop();
    this.drawPile = shuffle(this.discardPile);
    this.discardPile = [top];
  }

  _nextIndex() {
    return this._wrapIndex(this.currentPlayerIndex + this.direction);
  }

  _wrapIndex(idx) {
    const n = this.players.length;
    return ((idx % n) + n) % n;
  }

  _getPreviousColor() {
    if (this.discardPile.length < 2) return this.currentColor;
    const prev = this.discardPile[this.discardPile.length - 2];
    return prev.color === 'wild' ? this.currentColor : prev.color;
  }

  _getScores() {
    return this.players.map(p => ({ id: p.id, name: p.name, score: p.score }));
  }

  // ══════════════════════════════════════════════════════════════════
  // PUBLIC / PRIVATE STATE
  // ══════════════════════════════════════════════════════════════════

  getPublicState() {
    return {
      roomCode: this.roomCode,
      phase: this.phase,
      direction: this.direction,
      currentPlayerIndex: this.currentPlayerIndex,
      currentPlayerId: this.players[this.currentPlayerIndex]?.id || null,
      currentColor: this.currentColor,
      currentValue: this.currentValue,
      topCard: this.discardPile[this.discardPile.length - 1] || null,
      drawPileCount: this.drawPile.length,
      drawStack: this.drawStack,
      challengeEnabled: this.challengeEnabled,
      players: this.players.map(p => ({
        id: p.id,
        name: p.name,
        cardCount: p.hand.length,
        score: p.score,
        saidUno: p.saidUno,
        connected: p.connected,
        avatar: p.avatar,
        disconnectTime: p.disconnectTime || null,
      })),
    };
  }

  getPlayerState(playerId) {
    const p = this.players.find(x => x.id === playerId);
    if (!p) return null;
    return {
      hand: p.hand,
      isCurrentTurn: this.players[this.currentPlayerIndex]?.id === playerId,
      phase: this.phase,
      currentColor: this.currentColor,
      currentValue: this.currentValue,
      topCard: this.discardPile[this.discardPile.length - 1] || null,
      drawStack: this.drawStack,
    };
  }
}

module.exports = { GameEngine, Phase };
