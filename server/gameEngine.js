// ─── UNO Game Engine ────────────────────────────────────────────────────────
// Authoritative state machine for a single UNO game / round.
// Server calls methods here; return values describe what happened so the
// caller can emit the right socket events.

const { createShuffledDeck, shuffle, COLORS } = require('./deck');
const { scoreHand, deepClone } = require('./utils');

// Game-phase constants
const Phase = {
    LOBBY: 'lobby',
    PLAYING: 'playing',
    AWAITING_COLOR: 'awaiting_color',       // wild played, waiting for color choice
    AWAITING_CHALLENGE: 'awaiting_challenge', // wild_draw4 played, next player may challenge
    ROUND_OVER: 'round_over',
    GAME_OVER: 'game_over',
};

// Turn-step constants (internal state machine)
const Step = {
    TURN_START: 'turn_start',
    PLAYER_ACTION: 'player_action',
    VALIDATE: 'validate',
    APPLY_EFFECT: 'apply_effect',
    CHECK_WIN: 'check_win',
    ADVANCE: 'advance',
};

const HAND_SIZE = 7;
const WIN_SCORE = 500;

class GameEngine {
    constructor(roomCode) {
        this.roomCode = roomCode;
        this.phase = Phase.LOBBY;
        this.step = null;

        // Players array – order determines seating; index = turn position
        this.players = [];        // { id, name, socketId, hand[], score, saidUno, connected }
        this.direction = 1;       // 1 = clockwise, -1 = counter-clockwise
        this.currentPlayerIndex = 0;

        this.drawPile = [];
        this.discardPile = [];
        this.currentColor = null; // effective color (may differ from top card when wild)
        this.currentValue = null;

        // For wild_draw4 challenge tracking
        this._lastPlayerId = null;
        this._lastPlayerHandSnapshot = null; // hand BEFORE the wild_draw4 was played

        // Pending color selection tracking
        this._pendingWildPlayerId = null;

        // UNO call tracking
        this._unoDeadline = {};  // playerId -> timestamp; window to call UNO

        // Turn lock to prevent duplicate actions
        this._turnLock = false;
    }

    // ──────────────────────────────────────────────────────────────────────────
    // PLAYER MANAGEMENT
    // ──────────────────────────────────────────────────────────────────────────

    addPlayer(id, name, socketId) {
        if (this.phase !== Phase.LOBBY) return { ok: false, reason: 'Game already in progress' };
        if (this.players.length >= 10) return { ok: false, reason: 'Room is full (max 10)' };
        if (this.players.find(p => p.id === id)) return { ok: false, reason: 'Already joined' };

        this.players.push({
            id,
            name,
            socketId,
            hand: [],
            score: 0,
            saidUno: false,
            connected: true,
        });
        return { ok: true };
    }

    removePlayer(id) {
        this.players = this.players.filter(p => p.id !== id);
    }

    reconnectPlayer(id, newSocketId) {
        const p = this.players.find(p => p.id === id);
        if (p) {
            p.socketId = newSocketId;
            p.connected = true;
        }
        return p;
    }

    disconnectPlayer(id) {
        const p = this.players.find(p => p.id === id);
        if (p) p.connected = false;
        return p;
    }

    getPlayer(id) {
        return this.players.find(p => p.id === id);
    }

    // ──────────────────────────────────────────────────────────────────────────
    // START GAME / ROUND
    // ──────────────────────────────────────────────────────────────────────────

    startGame() {
        if (this.players.length < 2) return { ok: false, reason: 'Need at least 2 players' };
        if (this.phase !== Phase.LOBBY && this.phase !== Phase.ROUND_OVER)
            return { ok: false, reason: 'Cannot start now' };

        return this._startRound();
    }

    _startRound() {
        // Build & shuffle deck
        this.drawPile = createShuffledDeck();
        this.discardPile = [];
        this.direction = 1;
        this.currentPlayerIndex = 0;
        this._turnLock = false;

        // Reset per-round player state
        for (const p of this.players) {
            p.hand = [];
            p.saidUno = false;
        }

        // Deal cards
        for (let i = 0; i < HAND_SIZE; i++) {
            for (const p of this.players) {
                p.hand.push(this._drawOne());
            }
        }

        // Flip first card – if it's a wild_draw4, reshuffle until it isn't (official rule)
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

        // Apply first-card effects
        const effects = this._applyFirstCardEffects(firstCard);

        // If first card is a wild, we need a color choice from the first player
        if (firstCard.color === 'wild') {
            this.phase = Phase.AWAITING_COLOR;
            this._pendingWildPlayerId = this.players[this.currentPlayerIndex].id;
        }

        return { ok: true, firstCard, effects };
    }

    _applyFirstCardEffects(card) {
        const effects = [];
        const n = this.players.length;

        switch (card.value) {
            case 'skip':
                // First player is skipped
                effects.push({ type: 'skip', playerId: this.players[this.currentPlayerIndex].id });
                this.currentPlayerIndex = this._nextIndex();
                break;

            case 'reverse':
                if (n === 2) {
                    // Acts as skip in 2-player
                    effects.push({ type: 'skip', playerId: this.players[this.currentPlayerIndex].id });
                    this.currentPlayerIndex = this._nextIndex();
                } else {
                    this.direction *= -1;
                    effects.push({ type: 'reverse' });
                    // Dealer's turn is effectively reversed; first player changes
                    this.currentPlayerIndex = this._wrapIndex(0 + this.direction);
                }
                break;

            case 'draw2':
                // First player draws 2 and is skipped
                {
                    const target = this.players[this.currentPlayerIndex];
                    for (let i = 0; i < 2; i++) target.hand.push(this._drawOne());
                    effects.push({ type: 'draw2', playerId: target.id });
                    this.currentPlayerIndex = this._nextIndex();
                }
                break;

            case 'wild':
                // First player chooses color – handled by caller
                effects.push({ type: 'choose_color', playerId: this.players[this.currentPlayerIndex].id });
                break;
        }

        return effects;
    }

    // ──────────────────────────────────────────────────────────────────────────
    // PLAY CARD
    // ──────────────────────────────────────────────────────────────────────────

    playCard(playerId, cardId) {
        // Prevent duplicate actions within the same turn
        if (this._turnLock) return { ok: false, reason: 'Action in progress' };

        if (this.phase !== Phase.PLAYING)
            return { ok: false, reason: 'Not accepting plays right now' };

        const currentPlayer = this.players[this.currentPlayerIndex];
        if (currentPlayer.id !== playerId)
            return { ok: false, reason: 'Not your turn' };

        const cardIndex = currentPlayer.hand.findIndex(c => c.id === cardId);
        if (cardIndex === -1) return { ok: false, reason: 'Card not in hand' };

        const card = currentPlayer.hand[cardIndex];

        // ── VALIDATE ──
        if (!this._isPlayable(card, currentPlayer))
            return { ok: false, reason: 'Card cannot be played' };

        this._turnLock = true;

        // Snapshot hand BEFORE playing (for wild_draw4 challenge)
        if (card.value === 'wild_draw4') {
            this._lastPlayerId = playerId;
            this._lastPlayerHandSnapshot = currentPlayer.hand.map(c => ({ ...c }));
        }

        // Remove card from hand
        currentPlayer.hand.splice(cardIndex, 1);

        // Place on discard
        this.discardPile.push(card);
        this.currentValue = card.value;

        // ── UNO tracking ──
        if (currentPlayer.hand.length === 1) {
            // Player has 1 card left – start UNO call window (2 seconds)
            this._unoDeadline[playerId] = Date.now() + 2000;
            currentPlayer.saidUno = false;
        } else {
            delete this._unoDeadline[playerId];
            currentPlayer.saidUno = false;
        }

        // ── APPLY EFFECT ──
        if (card.color === 'wild') {
            // Need color choice before continuing
            this._pendingWildPlayerId = playerId;

            if (card.value === 'wild_draw4') {
                // After color choice, next player gets the challenge window
                this.phase = Phase.AWAITING_COLOR;
            } else {
                this.phase = Phase.AWAITING_COLOR;
            }

            this._turnLock = false;
            return {
                ok: true,
                card,
                effect: 'awaiting_color',
                playerId,
                handCount: currentPlayer.hand.length,
            };
        }

        // Colored card – set current color
        this.currentColor = card.color;

        const result = this._applyCardEffect(card, currentPlayer);
        this._turnLock = false;
        return result;
    }

    // ──────────────────────────────────────────────────────────────────────────
    // COLOR CHOICE (after wild)
    // ──────────────────────────────────────────────────────────────────────────

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
            // Move to challenge window for the next player
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
        }

        // Normal wild – just advance turn
        const result = this._applyCardEffect(topCard, currentPlayer);
        return { ...result, color };
    }

    // ──────────────────────────────────────────────────────────────────────────
    // CHALLENGE WILD DRAW 4
    // ──────────────────────────────────────────────────────────────────────────

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
            // Decline challenge → next player draws 4 and is skipped
            for (let i = 0; i < 4; i++) challenger.hand.push(this._drawOne());
            this.currentPlayerIndex = this._nextIndex(); // skip challenger
            this.currentPlayerIndex = this._nextIndex(); // move to player after
            this.step = Step.TURN_START;
            return {
                ok: true,
                effect: 'challenge_declined',
                challengerId: challenger.id,
                offenderId: offender.id,
                drew: 4,
                drewPlayer: challenger.id,
            };
        }

        // ── Challenge accepted: check legality ──
        // Wild Draw 4 is illegal if offender had a card matching the PREVIOUS color
        const prevColor = this._getPreviousColor();
        const hadMatch = this._lastPlayerHandSnapshot.some(
            c => c.color === prevColor && c.value !== 'wild_draw4' && c.value !== 'wild'
        );

        if (hadMatch) {
            // Challenge succeeds → offender draws 4 instead
            for (let i = 0; i < 4; i++) offender.hand.push(this._drawOne());
            // Challenger's turn continues (current index already points to challenger via _nextIndex)
            this.currentPlayerIndex = nextIdx;
            this.step = Step.TURN_START;
            return {
                ok: true,
                effect: 'challenge_success',
                challengerId: challenger.id,
                offenderId: offender.id,
                drew: 4,
                drewPlayer: offender.id,
            };
        } else {
            // Challenge fails → challenger draws 6 (4 + 2 penalty) and is skipped
            for (let i = 0; i < 6; i++) challenger.hand.push(this._drawOne());
            this.currentPlayerIndex = this._nextIndex(); // skip challenger
            this.currentPlayerIndex = this._nextIndex();
            this.step = Step.TURN_START;
            return {
                ok: true,
                effect: 'challenge_fail',
                challengerId: challenger.id,
                offenderId: offender.id,
                drew: 6,
                drewPlayer: challenger.id,
            };
        }
    }

    // ──────────────────────────────────────────────────────────────────────────
    // DRAW CARD
    // ──────────────────────────────────────────────────────────────────────────

    drawCard(playerId) {
        if (this._turnLock) return { ok: false, reason: 'Action in progress' };
        if (this.phase !== Phase.PLAYING)
            return { ok: false, reason: 'Cannot draw now' };

        const currentPlayer = this.players[this.currentPlayerIndex];
        if (currentPlayer.id !== playerId)
            return { ok: false, reason: 'Not your turn' };

        this._turnLock = true;

        const drawn = this._drawOne();
        currentPlayer.hand.push(drawn);

        // After drawing, turn advances (classic UNO: draw 1, turn ends)
        this.currentPlayerIndex = this._nextIndex();
        this.step = Step.TURN_START;
        this._turnLock = false;

        return {
            ok: true,
            effect: 'draw',
            playerId,
            drawnCard: drawn,          // only send to the owning player
            handCount: currentPlayer.hand.length,
        };
    }

    // ──────────────────────────────────────────────────────────────────────────
    // SAY UNO
    // ──────────────────────────────────────────────────────────────────────────

    sayUno(playerId) {
        const player = this.players.find(p => p.id === playerId);
        if (!player) return { ok: false, reason: 'Player not found' };

        if (player.hand.length === 1 && this._unoDeadline[playerId]) {
            player.saidUno = true;
            delete this._unoDeadline[playerId];
            return { ok: true, effect: 'uno_said', playerId };
        }

        // Can also catch another player who didn't say UNO
        // Check if any OTHER player has 1 card and missed the window
        for (const other of this.players) {
            if (
                other.id !== playerId &&
                other.hand.length === 1 &&
                !other.saidUno &&
                this._unoDeadline[other.id] &&
                Date.now() > this._unoDeadline[other.id]
            ) {
                // Penalty: draw 2
                for (let i = 0; i < 2; i++) other.hand.push(this._drawOne());
                delete this._unoDeadline[other.id];
                return {
                    ok: true,
                    effect: 'uno_catch',
                    catcherId: playerId,
                    caughtId: other.id,
                    penalty: 2,
                };
            }
        }

        return { ok: false, reason: 'Nothing to call UNO on' };
    }

    // ──────────────────────────────────────────────────────────────────────────
    // INTERNAL HELPERS
    // ──────────────────────────────────────────────────────────────────────────

    _isPlayable(card, player) {
        // Wild cards are always playable (legality of wild_draw4 checked via challenge)
        if (card.color === 'wild') return true;
        // Match color
        if (card.color === this.currentColor) return true;
        // Match value
        if (card.value === this.currentValue) return true;
        return false;
    }

    _applyCardEffect(card, player) {
        const effects = [];
        const n = this.players.length;

        switch (card.value) {
            case 'skip':
                this.currentPlayerIndex = this._nextIndex(); // skip player
                effects.push({ type: 'skip', skippedId: this.players[this.currentPlayerIndex].id });
                this.currentPlayerIndex = this._nextIndex();
                break;

            case 'reverse':
                if (n === 2) {
                    // Acts as skip in 2-player games
                    this.currentPlayerIndex = this._nextIndex();
                    effects.push({ type: 'skip', skippedId: this.players[this.currentPlayerIndex].id });
                    this.currentPlayerIndex = this._nextIndex();
                } else {
                    this.direction *= -1;
                    effects.push({ type: 'reverse', direction: this.direction });
                    this.currentPlayerIndex = this._nextIndex();
                }
                break;

            case 'draw2': {
                const nextIdx = this._nextIndex();
                const target = this.players[nextIdx];
                for (let i = 0; i < 2; i++) target.hand.push(this._drawOne());
                effects.push({ type: 'draw2', targetId: target.id });
                this.currentPlayerIndex = nextIdx;            // lands on the target
                this.currentPlayerIndex = this._nextIndex();  // then skip them
                break;
            }

            case 'wild':
                // Color already set; just advance
                this.currentPlayerIndex = this._nextIndex();
                effects.push({ type: 'wild' });
                break;

            case 'wild_draw4':
                // Cards drawn during challenge resolution, not here
                // Don't advance yet – challenge phase handles advancement
                effects.push({ type: 'wild_draw4' });
                break;

            default:
                // Number card – just advance
                this.currentPlayerIndex = this._nextIndex();
                break;
        }

        this.step = Step.TURN_START;

        // ── CHECK WIN ──
        if (player.hand.length === 0) {
            return this._handleRoundWin(player, card, effects);
        }

        return {
            ok: true,
            card,
            effects,
            playerId: player.id,
            handCount: player.hand.length,
        };
    }

    _handleRoundWin(winner, card, effects) {
        // Tally points from other players' hands
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

        if (winner.score >= WIN_SCORE) {
            this.phase = Phase.GAME_OVER;
            return {
                ok: true,
                card,
                effects,
                playerId: winner.id,
                handCount: 0,
                roundOver: true,
                gameOver: true,
                winnerId: winner.id,
                roundScore,
                totalScore: winner.score,
                handScores,
                scores: this._getScores(),
            };
        }

        this.phase = Phase.ROUND_OVER;
        return {
            ok: true,
            card,
            effects,
            playerId: winner.id,
            handCount: 0,
            roundOver: true,
            gameOver: false,
            winnerId: winner.id,
            roundScore,
            totalScore: winner.score,
            handScores,
            scores: this._getScores(),
        };
    }

    _drawOne() {
        if (this.drawPile.length === 0) {
            this._reshuffleDiscard();
        }
        // If still empty after reshuffle (extremely rare), create fresh deck
        if (this.drawPile.length === 0) {
            const { createShuffledDeck } = require('./deck');
            this.drawPile = createShuffledDeck();
        }
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
        // Color that was active BEFORE the wild_draw4 was played
        if (this.discardPile.length < 2) return this.currentColor;
        const prevCard = this.discardPile[this.discardPile.length - 2];
        return prevCard.color === 'wild' ? this.currentColor : prevCard.color;
    }

    _getScores() {
        return this.players.map(p => ({ id: p.id, name: p.name, score: p.score }));
    }

    // ──────────────────────────────────────────────────────────────────────────
    // PUBLIC STATE (filtered for broadcast)
    // ──────────────────────────────────────────────────────────────────────────

    /**
     * Returns the state visible to ALL clients (TV screen).
     * NEVER includes any player's hand cards.
     */
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
            players: this.players.map(p => ({
                id: p.id,
                name: p.name,
                cardCount: p.hand.length,
                score: p.score,
                saidUno: p.saidUno,
                connected: p.connected,
            })),
        };
    }

    /**
     * Returns private state for a specific player (their hand).
     */
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
        };
    }
}

module.exports = { GameEngine, Phase };
