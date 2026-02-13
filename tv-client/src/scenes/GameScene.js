// ─── GameScene ──────────────────────────────────────────────────────────────
// Main TV gameplay display: avatars, deal/play animations, orbiting direction
// indicator, card-back fan display, enhanced active player glow, sounds.

import Phaser from 'phaser';
import socket from '../socket.js';
import { drawCard, drawCardBack, getColorHex, COLOR_MAP, COLOR_HEX_STR } from '../CardGraphics.js';

// ── MP3 Sound Imports ──
import cardDealUrl from '../resources/sound_effects/card-deal.mp3';
import unoUrl from '../resources/sound_effects/uno.mp3';
import oopsUrl from '../resources/sound_effects/oops.mp3';
import reversUrl from '../resources/sound_effects/revers.mp3';
import skipUrl from '../resources/sound_effects/skip.mp3';
import draw2Url from '../resources/sound_effects/draw2.mp3';
import draw4Url from '../resources/sound_effects/draw4.mp3';
import successUrl from '../resources/sound_effects/success.mp3';
import draw2CardsUrl from '../resources/sound_effects/draw-2-cards.mp3';
import draw4CardsUrl from '../resources/sound_effects/draw-4-cards.mp3';
import draw6CardsUrl from '../resources/sound_effects/draw-6-cards.mp3';
import draw8CardsUrl from '../resources/sound_effects/draw-8-cards.mp3';
import draw10CardsUrl from '../resources/sound_effects/draw-10-cards.mp3';
import draw12CardsUrl from '../resources/sound_effects/draw-12-cards.mp3';
import draw14CardsUrl from '../resources/sound_effects/draw-14-cards.mp3';
import draw16CardsUrl from '../resources/sound_effects/draw-16-cards.mp3';
import draw18CardsUrl from '../resources/sound_effects/draw-18-cards.mp3';

// ── Color / Wild Sound Imports ──
import redUrl from '../resources/sound_effects/red.mp3';
import blueUrl from '../resources/sound_effects/blue.mp3';
import greenUrl from '../resources/sound_effects/green.mp3';
import yellowUrl from '../resources/sound_effects/yellow.mp3';
import changeUrl from '../resources/sound_effects/change.mp3';

// ── Avatar emoji map ──
const AVATAR_EMOJI = {
  cat: '🐱', dog: '🐶', fox: '🦊', owl: '🦉', bear: '🐻',
  rabbit: '🐰', panda: '🐼', koala: '🐨', lion: '🦁', penguin: '🐧',
};

// ── MP3 Sound System ──
const sfx = {};
function initSounds() {
  const map = {
    'card-deal': cardDealUrl, 'uno': unoUrl, 'oops': oopsUrl,
    'revers': reversUrl, 'skip': skipUrl, 'draw2': draw2Url,
    'draw4': draw4Url, 'success': successUrl,
    'draw-2-cards': draw2CardsUrl, 'draw-4-cards': draw4CardsUrl,
    'draw-6-cards': draw6CardsUrl, 'draw-8-cards': draw8CardsUrl,
    'draw-10-cards': draw10CardsUrl, 'draw-12-cards': draw12CardsUrl,
    'draw-14-cards': draw14CardsUrl, 'draw-16-cards': draw16CardsUrl,
    'draw-18-cards': draw18CardsUrl,
    'red': redUrl, 'blue': blueUrl, 'green': greenUrl, 'yellow': yellowUrl,
    'change': changeUrl,
  };
  for (const [name, url] of Object.entries(map)) {
    const audio = new Audio(url);
    audio.preload = 'auto';
    sfx[name] = audio;
  }
}
initSounds();

function playSound(name) {
  const audio = sfx[name];
  if (audio) {
    const clone = audio.cloneNode();
    clone.volume = audio.volume;
    clone.play().catch(() => {});
  }
}

function playDrawNCards(count) {
  const n = Math.min(18, Math.max(2, Math.floor(count / 2) * 2));
  playSound(`draw-${n}-cards`);
}

const W = 1920;
const H = 1080;
const CX = W / 2;
const CY = H / 2;
const TABLE_RX = 500;   // table ellipse half-width
const TABLE_RY = 300;   // table ellipse half-height
const ORBIT_RX = 520;   // orbit ring slightly outside table
const ORBIT_RY = 318;
const PLAYER_RX = 720;  // player positions radius
const PLAYER_RY = 430;

export class GameScene extends Phaser.Scene {
  constructor() {
    super({ key: 'GameScene' });
    this.state = null;
    this.playerPanels = [];
    this.discardStack = [];
    this._dealing = false;
    this._lastTopCardId = null;
    this._orbitAngle = 0;
    this._orbitDir = 1;
    this._currentDir = 1;
    this._initialPlayers = null;
    this._disconnectTexts = [];
    this._roomCode = null;
  }

  init(data) {
    this.firstCard = data?.firstCard;
    this.firstEffects = data?.effects;
    this.dealSequence = data?.dealSequence || [];
    // Zero out card counts so deal animation can increment them
    this._initialPlayers = (data?.players || []).map(p => ({ ...p, cardCount: 0 }));
    this._roomCode = data?.roomCode || null;
  }

  create() {
    // ── Background with subtle ambient particles ──
    const bg = this.add.graphics();
    bg.fillGradientStyle(0x0a1628, 0x0a1628, 0x1a0a2e, 0x1a0a2e, 1);
    bg.fillRect(0, 0, W, H);
    // Subtle stars / sparkles
    for (let i = 0; i < 40; i++) {
      bg.fillStyle(0xffffff, Phaser.Math.FloatBetween(0.015, 0.06));
      bg.fillCircle(Phaser.Math.Between(0, W), Phaser.Math.Between(0, H), Phaser.Math.Between(1, 3));
    }

    // ── Table: 3D look with shadow, rim, gold trim ──
    // Shadow
    const shadow = this.add.graphics();
    shadow.fillStyle(0x000000, 0.35);
    shadow.fillEllipse(CX, CY + 14, TABLE_RX * 2 + 50, TABLE_RY * 2 + 50);
    // Wooden rim
    const rim = this.add.graphics();
    rim.fillStyle(0x4e342e, 1);
    rim.fillEllipse(CX, CY, TABLE_RX * 2 + 34, TABLE_RY * 2 + 34);
    rim.lineStyle(3, 0x795548, 0.8);
    rim.strokeEllipse(CX, CY, TABLE_RX * 2 + 34, TABLE_RY * 2 + 34);
    // Gold trim
    const gold = this.add.graphics();
    gold.lineStyle(3, 0xd4af37, 0.6);
    gold.strokeEllipse(CX, CY, TABLE_RX * 2 + 18, TABLE_RY * 2 + 18);
    // Felt — multi-layer gradient for depth
    const felt = this.add.graphics();
    felt.fillStyle(0x0d4a24, 1);
    felt.fillEllipse(CX, CY, TABLE_RX * 2, TABLE_RY * 2);
    felt.fillStyle(0x156b35, 0.6);
    felt.fillEllipse(CX, CY, TABLE_RX * 1.6, TABLE_RY * 1.6);
    felt.fillStyle(0x1e8449, 0.35);
    felt.fillEllipse(CX, CY, TABLE_RX * 1.1, TABLE_RY * 1.1);
    // Inner border ring
    felt.lineStyle(2, 0x2ecc71, 0.25);
    felt.strokeEllipse(CX, CY, TABLE_RX * 2 - 12, TABLE_RY * 2 - 12);
    felt.lineStyle(1, 0x27ae60, 0.12);
    felt.strokeEllipse(CX, CY, TABLE_RX * 2 - 30, TABLE_RY * 2 - 30);

    // ── Room code at top ──
    if (this._roomCode) {
      this.add.text(1820, 28, `ROOM: ${this._roomCode}`, {
        fontFamily: 'Courier New, monospace', fontSize: '28px',
        color: '#f1c40f', fontStyle: 'bold',
        stroke: '#000', strokeThickness: 2,
      }).setOrigin(0.5).setAlpha(0.8);
    }

    // ── Color glow ring behind discard ──
    this.colorGlow = this.add.graphics();
    this._drawColorGlow(0x27ae60);

    // ── Discard pile layer ──
    this.discardGroup = this.add.container(CX - 60, CY);

    // ── Draw pile area ──
    this.drawPileGroup = this.add.container(CX + 120, CY);
    for (let i = 2; i >= 0; i--) {
      const back = drawCardBack(this, i * 2, -i * 2, 1.05);
      this.drawPileGroup.add(back);
    }
    this.add.text(CX + 120, CY + 90, 'DRAW', {
      fontFamily: 'Arial Black', fontSize: '16px', color: '#f1c40f',
    }).setOrigin(0.5);
    this.drawCountText = this.add.text(CX + 120, CY - 90, '', {
      fontFamily: 'Arial Black', fontSize: '20px', color: '#f1c40f',
    }).setOrigin(0.5);

    // ── +2 Stack indicator ──
    this.stackText = this.add.text(CX - 60, CY + 110, '', {
      fontFamily: 'Arial Black', fontSize: '28px', color: '#e74c3c',
      stroke: '#000', strokeThickness: 3,
    }).setOrigin(0.5).setAlpha(0);

    // ── Current color indicator ──
    this.colorIndicator = this.add.container(CX - 60, CY + 150);
    this.colorDot = this.add.graphics();
    this.colorIndicator.add(this.colorDot);
    this.colorText = this.add.text(22, 0, '', {
      fontFamily: 'Arial Black', fontSize: '18px', color: '#fff',
    }).setOrigin(0, 0.5);
    this.colorIndicator.add(this.colorText);

    // ══════════════════════════════════════════════════════════════
    // DIRECTION ORBIT — continuous orbiting dot around the table
    // ══════════════════════════════════════════════════════════════
    this.orbitGfx = this.add.graphics();
    this.orbitTrailGfx = this.add.graphics();
    this._orbitAngle = 0;
    this._orbitDir = 1;

    // ── Player panels container ──
    this.panelsContainer = this.add.container(0, 0);

    // ── Message overlay ──
    this.messageText = this.add.text(CX, 80, '', {
      fontFamily: 'Arial Black', fontSize: '40px', color: '#e94560',
      stroke: '#000', strokeThickness: 4,
    }).setOrigin(0.5).setAlpha(0);

    // ── UNO call overlay ──
    this.unoCallText = this.add.text(CX, CY, '', {
      fontFamily: 'Arial Black', fontSize: '72px', color: '#f1c40f',
      stroke: '#e74c3c', strokeThickness: 6,
    }).setOrigin(0.5).setAlpha(0).setDepth(100);

    // ══════════════════════════════════════════════════════════════
    // RENDER INITIAL PLAYERS before deal animation — FIX #3
    // ══════════════════════════════════════════════════════════════
    if (this._initialPlayers.length > 0) {
      // Build a temporary state so players are visible immediately
      this.state = {
        players: this._initialPlayers,
        currentPlayerId: this._initialPlayers[0]?.id,
        direction: 1,
        topCard: null,
        drawPileCount: 0,
        currentColor: null,
        drawStack: 0,
      };
      this._renderPlayers(this._initialPlayers, null);
    }

    // ── Clean up prior socket listeners ──
    socket.off('state_update');
    socket.off('card_effect');
    socket.off('challenge_result');
    socket.off('uno_event');
    socket.off('uno_penalty');
    socket.off('round_over');
    socket.off('game_over');
    socket.off('draw_event');
    socket.off('game_started');
    socket.off('color_chosen');

    // ── Socket listeners ──
    socket.on('state_update', (state) => {
      if (!this._dealing) this._onStateUpdate(state);
      else this._pendingState = state;
    });
    socket.on('card_effect', (effect) => this._onCardEffect(effect));
    socket.on('challenge_result', (data) => {
      const msg = data.effect === 'challenge_success'
        ? `Challenge SUCCESS! Offender draws ${data.drew}`
        : data.effect === 'challenge_fail'
          ? `Challenge FAILED! Challenger draws ${data.drew}`
          : `Challenge declined. Draws ${data.drew}`;
      this._showMessage(msg);
    });
    // ── Color chosen sound (both wild and +4) ──
    socket.on('color_chosen', (data) => {
      // Play the color announcement sound
      if (['red', 'blue', 'green', 'yellow'].includes(data.color)) {
        playSound(data.color);
      }
      // Play change.mp3 for normal wild (not wild_draw4)
      if (data.cardType === 'wild') {
        setTimeout(() => playSound('change'), 600);
      }
    });
    socket.on('uno_event', (data) => {
      if (data.effect === 'uno_said') {
        this._showUnoCall(data.playerName || 'Player');
        playSound('uno');
      }
    });
    socket.on('uno_penalty', () => {
      this._showMessage('UNO Penalty! +1 card');
      playSound('oops');
    });
    socket.on('round_over', (data) => {
      playSound('success');
      this.scene.start('RoundOverScene', data);
    });
    socket.on('game_over', (data) => {
      playSound('success');
      this.scene.start('GameOverScene', data);
    });

    // ── Draw event animation ──
    socket.on('draw_event', (data) => this._animateDrawEvent(data));

    // ── Run deal animation (FIX #2: 100ms per card) ──
    if (this.dealSequence.length > 0) {
      this._playDealAnimation();
    }
  }

  // Phaser update loop — drive the orbiting direction indicator + countdown
  update(time, delta) {
    this._updateOrbit(delta);
    // Update disconnect countdowns
    if (this._disconnectTexts) {
      for (const dt of this._disconnectTexts) {
        const remaining = Math.max(0, Math.ceil(120 - (Date.now() - dt.disconnectTime) / 1000));
        dt.text.setText(`⏳ ${remaining}s`);
      }
    }
  }

  // ══════════════════════════════════════════════════════════════════
  // ORBITING DIRECTION INDICATOR — Two arrows with tails, 180° apart
  // ══════════════════════════════════════════════════════════════════

  _updateOrbit(delta) {
    const speed = 0.0012; // radians per ms
    this._orbitAngle += speed * delta * this._orbitDir;

    // Wrap
    if (this._orbitAngle > Math.PI * 2) this._orbitAngle -= Math.PI * 2;
    if (this._orbitAngle < -Math.PI * 2) this._orbitAngle += Math.PI * 2;

    this.orbitGfx.clear();
    this.orbitTrailGfx.clear();

    // Draw two arrows 180° apart
    for (let a = 0; a < 2; a++) {
      const baseAngle = this._orbitAngle + a * Math.PI;
      this._drawOrbitArrow(baseAngle);
    }
  }

  /**
   * Draw a single arrow with glowing tail along the orbit ellipse.
   */
  _drawOrbitArrow(baseAngle) {
    const gfx = this.orbitGfx;
    const trailGfx = this.orbitTrailGfx;

    // Arrow head position
    const hx = CX + Math.cos(baseAngle) * ORBIT_RX;
    const hy = CY + Math.sin(baseAngle) * ORBIT_RY;

    // Tangent direction (derivative of ellipse parametric equation)
    const tx = -Math.sin(baseAngle) * ORBIT_RX * this._orbitDir;
    const ty = Math.cos(baseAngle) * ORBIT_RY * this._orbitDir;
    const tLen = Math.sqrt(tx * tx + ty * ty);
    const nx = tx / tLen; // normalized tangent x
    const ny = ty / tLen; // normalized tangent y

    // Perpendicular for arrow width
    const px = -ny;
    const py = nx;

    const arrowLen = 22;
    const arrowHalfW = 10;

    // Arrow tip (forward along tangent)
    const tipX = hx + nx * arrowLen * 0.5;
    const tipY = hy + ny * arrowLen * 0.5;

    // Arrow base corners
    const baseX = hx - nx * arrowLen * 0.5;
    const baseY = hy - ny * arrowLen * 0.5;
    const lx = baseX + px * arrowHalfW;
    const ly = baseY + py * arrowHalfW;
    const rx = baseX - px * arrowHalfW;
    const ry = baseY - py * arrowHalfW;

    // Outer glow for the arrow
    gfx.fillStyle(0x2ecc71, 0.15);
    gfx.fillCircle(hx, hy, 24);
    gfx.fillStyle(0x2ecc71, 0.08);
    gfx.fillCircle(hx, hy, 34);

    // Arrow head (triangle)
    gfx.fillStyle(0x2ecc71, 0.9);
    gfx.fillTriangle(tipX, tipY, lx, ly, rx, ry);

    // White core highlight
    const coreLen = 14;
    const coreHW = 5;
    const ctipX = hx + nx * coreLen * 0.5;
    const ctipY = hy + ny * coreLen * 0.5;
    const cbaseX = hx - nx * coreLen * 0.5;
    const cbaseY = hy - ny * coreLen * 0.5;
    gfx.fillStyle(0xffffff, 0.7);
    gfx.fillTriangle(
      ctipX, ctipY,
      cbaseX + px * coreHW, cbaseY + py * coreHW,
      cbaseX - px * coreHW, cbaseY - py * coreHW
    );

    // Tail — fading segments trailing behind the arrow
    const tailSegments = 8;
    for (let i = 1; i <= tailSegments; i++) {
      const trailAngle = baseAngle - i * 0.06 * this._orbitDir;
      const sx = CX + Math.cos(trailAngle) * ORBIT_RX;
      const sy = CY + Math.sin(trailAngle) * ORBIT_RY;
      const alpha = 0.35 - i * 0.04;
      const width = arrowHalfW * (1 - i / (tailSegments + 1)) * 0.7;

      // Trail tangent at this position
      const stx = -Math.sin(trailAngle) * ORBIT_RX * this._orbitDir;
      const sty = Math.cos(trailAngle) * ORBIT_RY * this._orbitDir;
      const stLen = Math.sqrt(stx * stx + sty * sty);
      const spx = -(sty / stLen);
      const spy = stx / stLen;

      trailGfx.fillStyle(0x2ecc71, Math.max(alpha, 0.02));
      trailGfx.fillTriangle(
        sx + spx * width, sy + spy * width,
        sx - spx * width, sy - spy * width,
        CX + Math.cos(trailAngle - 0.04 * this._orbitDir) * ORBIT_RX,
        CY + Math.sin(trailAngle - 0.04 * this._orbitDir) * ORBIT_RY
      );
    }
  }

  // ══════════════════════════════════════════════════════════════════
  // DEAL ANIMATION — FIX #2: 1000ms per card
  // ══════════════════════════════════════════════════════════════════

  _playDealAnimation() {
    this._dealing = true;
    const seq = this.dealSequence;
    const deckX = CX + 120;
    const deckY = CY;
    let idx = 0;

    const dealNext = () => {
      if (idx >= seq.length) {
        // Deal done — animate first card onto discard pile
        this.time.delayedCall(400, () => {
          if (this.firstCard) this._animateFirstCard();
          this.time.delayedCall(600, () => {
            this._dealing = false;
            if (this._pendingState) {
              this._onStateUpdate(this._pendingState);
              this._pendingState = null;
            }
          });
        });
        return;
      }

      const entry = seq[idx];
      idx++;

      // Increment card count for this player and re-render panels
      if (this.state) {
        const sp = this.state.players.find(p => p.id === entry.playerId);
        if (sp) sp.cardCount = (sp.cardCount || 0) + 1;
        this._renderPlayers(this.state.players, null);
      }

      // Create a card back at deck position
      const cardBack = drawCardBack(this, deckX, deckY, 0.8);
      cardBack.setDepth(50);

      // Target position — find player panel position
      const playerPos = this._getPlayerPanelPos(entry.playerId);
      if (!playerPos) {
        cardBack.destroy();
        this.time.delayedCall(150, dealNext);
        return;
      }

      playSound('card-deal');

      this.tweens.add({
        targets: cardBack,
        x: playerPos.x,
        y: playerPos.y + 40,
        scaleX: 0.4,
        scaleY: 0.4,
        alpha: 0,
        duration: 400,
        ease: 'Quad.easeOut',
        onComplete: () => {
          cardBack.destroy();
        },
      });

      // Schedule next card at 150ms interval
      this.time.delayedCall(150, dealNext);
    };

    // Start after a short delay so players can see the table
    this.time.delayedCall(800, dealNext);
  }

  _animateFirstCard() {
    if (!this.firstCard) return;
    const offX = Phaser.Math.Between(-4, 4);
    const offY = Phaser.Math.Between(-4, 4);
    const rot = Phaser.Math.Between(-6, 6);
    // Create card inside discardGroup (positioned at CX-60, CY)
    // Deck is at CX+120 on screen → 180px right of discardGroup origin
    const card = drawCard(this, 180, 0, this.firstCard, 1.3);
    card.setAngle(rot);
    card.setDepth(60);
    card.setScale(0);
    card.setAlpha(0);
    this.discardGroup.add(card);

    playSound('card-deal');

    this.tweens.add({
      targets: card,
      x: offX,
      y: offY,
      scaleX: 1, scaleY: 1,
      alpha: 1,
      duration: 500,
      ease: 'Back.easeOut',
      onComplete: () => {
        // Keep card in discard stack — don't destroy
        this.discardStack.push(card);
        this._lastTopCardId = this.firstCard.id;
      },
    });
  }

  _getPlayerPanelPos(playerId) {
    if (!this.state) return null;
    const idx = this.state.players.findIndex(p => p.id === playerId);
    if (idx === -1) return null;
    const positions = this._getPlayerPositions(this.state.players.length);
    return positions[idx] || null;
  }

  // ══════════════════════════════════════════════════════════════════
  // STATE UPDATE
  // ══════════════════════════════════════════════════════════════════

  _onStateUpdate(state) {
    const prevTopId = this._lastTopCardId;
    this.state = state;
    if (state.roomCode && !this._roomCode) this._roomCode = state.roomCode;

    // Update orbit direction
    if (state.direction !== this._currentDir) {
      this._currentDir = state.direction;
      this._orbitDir = state.direction;
    }

    this._renderDiscard(state.topCard, prevTopId);
    this._renderColorGlow(state.currentColor);
    this._renderPlayers(state.players, state.currentPlayerId);
    this._renderDrawCount(state.drawPileCount);
    this._renderColorLabel(state.currentColor);
    this._renderDrawStack(state.drawStack);
    this._lastTopCardId = state.topCard?.id || null;
  }

  // ══════════════════════════════════════════════════════════════════
  // DISCARD PILE with stacking
  // ══════════════════════════════════════════════════════════════════

  _renderDiscard(topCard, prevTopId) {
    if (!topCard) return;
    if (topCard.id === prevTopId) return;

    if (this.discardStack.length > 3) {
      const oldest = this.discardStack.shift();
      if (oldest) oldest.destroy();
    }
    for (const child of this.discardStack) child.setAlpha(0.5);

    const offX = Phaser.Math.Between(-4, 4);
    const offY = Phaser.Math.Between(-4, 4);
    const rot = Phaser.Math.Between(-6, 6);

    const card = drawCard(this, offX, offY, topCard, 1.3);
    card.setAngle(rot);
    this.discardGroup.add(card);
    this.discardStack.push(card);

    card.setScale(0.3);
    card.setAlpha(0);
    playSound('card-deal');
    this.tweens.add({
      targets: card,
      scaleX: 1, scaleY: 1, alpha: 1,
      duration: 300,
      ease: 'Back.easeOut',
    });
  }

  // ══════════════════════════════════════════════════════════════════
  // COLOR GLOW
  // ══════════════════════════════════════════════════════════════════

  _drawColorGlow(colorHex) {
    this.colorGlow.clear();
    this.colorGlow.fillStyle(colorHex, 0.12);
    this.colorGlow.fillCircle(CX - 60, CY, 140);
    this.colorGlow.lineStyle(3, colorHex, 0.5);
    this.colorGlow.strokeCircle(CX - 60, CY, 140);
    this.colorGlow.lineStyle(1, colorHex, 0.2);
    this.colorGlow.strokeCircle(CX - 60, CY, 160);
  }
  _renderColorGlow(colorName) {
    const hex = getColorHex(colorName);
    this._drawColorGlow(hex);
  }

  // ══════════════════════════════════════════════════════════════════
  // PLAYER PANELS — FIX #5 (enhanced glow) + FIX #6 (card back fan)
  // ══════════════════════════════════════════════════════════════════

  _renderPlayers(players, currentPlayerId) {
    this.panelsContainer.removeAll(true);
    this.playerPanels = [];
    this._disconnectTexts = [];

    const n = players.length;
    const positions = this._getPlayerPositions(n);

    players.forEach((p, i) => {
      const pos = positions[i];
      const isCurrent = p.id === currentPlayerId;

      // ── Active player gets a LARGER panel ── FIX #5
      const BASE_W = 220;
      const BASE_H = 100;
      const scale = isCurrent ? 1.15 : 1;
      const panelW = BASE_W * scale;
      const panelH = BASE_H * scale;

      const panel = this.add.graphics();

      if (isCurrent) {
        // ── Outer glow halos — BIG & VIBRANT ──
        panel.fillStyle(0xe94560, 0.04);
        panel.fillRoundedRect(pos.x - panelW / 2 - 36, pos.y - panelH / 2 - 36, panelW + 72, panelH + 72, 30);
        panel.fillStyle(0xe94560, 0.08);
        panel.fillRoundedRect(pos.x - panelW / 2 - 26, pos.y - panelH / 2 - 26, panelW + 52, panelH + 52, 26);
        panel.fillStyle(0xe94560, 0.14);
        panel.fillRoundedRect(pos.x - panelW / 2 - 16, pos.y - panelH / 2 - 16, panelW + 32, panelH + 32, 22);
        panel.fillStyle(0xe94560, 0.22);
        panel.fillRoundedRect(pos.x - panelW / 2 - 8, pos.y - panelH / 2 - 8, panelW + 16, panelH + 16, 18);

        // Panel body
        panel.fillStyle(0x1a1a2e, 0.95);
        panel.fillRoundedRect(pos.x - panelW / 2, pos.y - panelH / 2, panelW, panelH, 14);
        panel.lineStyle(4, 0xe94560, 1);
        panel.strokeRoundedRect(pos.x - panelW / 2, pos.y - panelH / 2, panelW, panelH, 14);
      } else {
        panel.fillStyle(0x1a1a2e, 0.8);
        panel.fillRoundedRect(pos.x - panelW / 2, pos.y - panelH / 2, panelW, panelH, 12);
        panel.lineStyle(2, 0x333366, 0.6);
        panel.strokeRoundedRect(pos.x - panelW / 2, pos.y - panelH / 2, panelW, panelH, 12);
      }
      this.panelsContainer.add(panel);

      // ── Avatar emoji ──
      const emoji = AVATAR_EMOJI[p.avatar] || '🎮';
      const avatarSize = isCurrent ? '38px' : '32px';
      const avatarText = this.add.text(pos.x - panelW / 2 + 30 * scale, pos.y - 6, emoji, {
        fontSize: avatarSize,
      }).setOrigin(0.5);
      this.panelsContainer.add(avatarText);

      // ── Player name ──
      const nameColor = isCurrent ? '#ff6b8a' : '#e0e0e0';
      const nameSize = isCurrent ? '22px' : '18px';
      const nameText = this.add.text(pos.x + 12 * scale, pos.y - 18 * scale, p.name, {
        fontFamily: 'Arial, sans-serif',
        fontSize: nameSize,
        color: nameColor,
        fontStyle: 'bold',
      }).setOrigin(0.5);
      this.panelsContainer.add(nameText);

      // ── Score ──
      const scoreText = this.add.text(pos.x + 12 * scale, pos.y + 6 * scale, `${p.score} pts`, {
        fontFamily: 'Arial, sans-serif',
        fontSize: '14px',
        color: '#aaa',
      }).setOrigin(0.5);
      this.panelsContainer.add(scoreText);

      // ══════════════════════════════════════════════════════════
      // CARD BACK FAN DISPLAY — FIX #6
      // Show mini card backs fanned out below the player panel
      // ══════════════════════════════════════════════════════════
      const cardCount = p.cardCount || 0;
      if (cardCount > 0) {
        const fanContainer = this.add.container(pos.x, pos.y + panelH / 2 + 28);
        const maxVisible = Math.min(cardCount, 12); // cap at 12 visible cards
        const fanSpread = Math.min(maxVisible * 10, 100); // total width of fan
        const cardScale = 0.32;

        for (let c = 0; c < maxVisible; c++) {
          const progress = maxVisible === 1 ? 0.5 : c / (maxVisible - 1);
          const xOff = (progress - 0.5) * fanSpread;
          const angle = (progress - 0.5) * 30; // ±15 degrees

          const miniBack = drawCardBack(this, xOff, 0, cardScale);
          miniBack.setAngle(angle);
          fanContainer.add(miniBack);
        }

        // If more cards than visible, show count badge
        if (cardCount > maxVisible) {
          const badge = this.add.text(fanSpread / 2 + 16, -6, `+${cardCount - maxVisible}`, {
            fontFamily: 'Arial', fontSize: '12px', color: '#f1c40f',
            fontStyle: 'bold',
          }).setOrigin(0.5);
          fanContainer.add(badge);
        }

        this.panelsContainer.add(fanContainer);
      }

      // ── UNO badge ──
      if (p.cardCount === 1 && p.saidUno) {
        const unoBadge = this.add.text(pos.x + panelW / 2 - 5, pos.y - panelH / 2 - 8, 'UNO!', {
          fontFamily: 'Arial Black', fontSize: '18px', color: '#f1c40f',
          stroke: '#e74c3c', strokeThickness: 3,
        }).setOrigin(0.5);
        this.panelsContainer.add(unoBadge);
        this.tweens.add({
          targets: unoBadge,
          scaleX: 1.2, scaleY: 1.2,
          yoyo: true, repeat: -1, duration: 350,
        });
      }

      // ── Disconnected overlay with countdown ──
      if (!p.connected) {
        const dcOverlay = this.add.graphics();
        dcOverlay.fillStyle(0x000000, 0.6);
        dcOverlay.fillRoundedRect(pos.x - panelW / 2, pos.y - panelH / 2, panelW, panelH, 12);
        this.panelsContainer.add(dcOverlay);
        const dcLabel = this.add.text(pos.x, pos.y - 10, 'Disconnected', {
          fontFamily: 'Arial', fontSize: '13px', color: '#e74c3c', fontStyle: 'bold',
        }).setOrigin(0.5);
        this.panelsContainer.add(dcLabel);
        const remaining = p.disconnectTime
          ? Math.max(0, Math.ceil(120 - (Date.now() - p.disconnectTime) / 1000))
          : 120;
        const dcCountdown = this.add.text(pos.x, pos.y + 10, `\u23f3 ${remaining}s`, {
          fontFamily: 'Arial Black', fontSize: '22px', color: '#f39c12', fontStyle: 'bold',
        }).setOrigin(0.5);
        this.panelsContainer.add(dcCountdown);
        if (p.disconnectTime) {
          this._disconnectTexts.push({ text: dcCountdown, disconnectTime: p.disconnectTime });
        }
      }

      // ── Active player pulsing glow — BIG & VIBRANT ──
      if (isCurrent && p.connected) {
        // Outer pulsing ring
        const pulseOuter = this.add.graphics();
        pulseOuter.lineStyle(3, 0xe94560, 0.5);
        pulseOuter.strokeRoundedRect(
          pos.x - panelW / 2 - 20, pos.y - panelH / 2 - 20,
          panelW + 40, panelH + 40, 22
        );
        this.panelsContainer.add(pulseOuter);
        this.tweens.add({
          targets: pulseOuter,
          alpha: { from: 0.6, to: 0 },
          scaleX: { from: 1, to: 1.08 },
          scaleY: { from: 1, to: 1.08 },
          yoyo: true, repeat: -1, duration: 800,
        });

        // Inner pulsing ring
        const pulse = this.add.graphics();
        pulse.lineStyle(5, 0xe94560, 1);
        pulse.strokeRoundedRect(
          pos.x - panelW / 2 - 8, pos.y - panelH / 2 - 8,
          panelW + 16, panelH + 16, 18
        );
        this.panelsContainer.add(pulse);
        this.tweens.add({
          targets: pulse,
          alpha: { from: 1, to: 0.2 },
          yoyo: true, repeat: -1, duration: 500,
        });

        // Arrow indicator pointing at active player
        const arrowY = pos.y - panelH / 2 - 28;
        const arrow = this.add.text(pos.x, arrowY, '▼', {
          fontFamily: 'Arial', fontSize: '24px', color: '#e94560',
        }).setOrigin(0.5);
        this.panelsContainer.add(arrow);
        this.tweens.add({
          targets: arrow,
          y: arrowY + 6,
          yoyo: true, repeat: -1, duration: 500, ease: 'Sine.easeInOut',
        });
      }

      this.playerPanels.push({ pos, playerId: p.id });
    });
  }

  _getPlayerPositions(n) {
    const positions = [];
    for (let i = 0; i < n; i++) {
      const angle = (Math.PI * 2 * i) / n - Math.PI / 2;
      positions.push({
        x: CX + Math.cos(angle) * PLAYER_RX,
        y: CY + Math.sin(angle) * PLAYER_RY,
      });
    }
    return positions;
  }

  // ══════════════════════════════════════════════════════════════════
  // DRAW COUNT + COLOR + STACK
  // ══════════════════════════════════════════════════════════════════

  _renderDrawCount(count) {
    this.drawCountText.setText(`${count}`);
  }

  _renderColorLabel(colorName) {
    this.colorDot.clear();
    if (!colorName) { this.colorText.setText(''); return; }
    const hex = getColorHex(colorName);
    this.colorDot.fillStyle(hex, 1);
    this.colorDot.fillCircle(0, 0, 10);
    this.colorDot.lineStyle(2, 0xffffff, 0.5);
    this.colorDot.strokeCircle(0, 0, 10);
    this.colorText.setText(colorName.toUpperCase());
    this.colorText.setColor(COLOR_HEX_STR[colorName] || '#fff');
  }

  _renderDrawStack(stack) {
    if (stack > 0) {
      this.stackText.setText(`+${stack} STACKED!`);
      this.stackText.setAlpha(1);
      this.tweens.add({
        targets: this.stackText,
        scaleX: 1.1, scaleY: 1.1,
        yoyo: true, repeat: 0, duration: 300,
      });
    } else {
      this.stackText.setAlpha(0);
    }
  }

  // ══════════════════════════════════════════════════════════════════
  // CARD EFFECTS
  // ══════════════════════════════════════════════════════════════════

  _onCardEffect(effect) {
    switch (effect.type) {
      case 'reverse':
        this._showMessage('REVERSE! ⇄');
        playSound('revers');
        break;
      case 'skip':
        this._showMessage('SKIP! ⊘');
        playSound('skip');
        break;
      case 'draw2':
        this._showMessage(`+2 DRAW! (Stack: ${effect.stack || 2})`);
        this._screenShake(5);
        playSound('draw2');
        break;
      case 'wild_draw4':
        this._showMessage('+4 WILD! 💀');
        this._screenShake(10);
        playSound('draw4');
        break;
      case 'wild':
        this._showMessage('WILD! 🌈');
        this._screenShake(5);
        playSound('change');
        break;
    }
  }

  // ══════════════════════════════════════════════════════════════════
  // UNO CALL ANIMATION
  // ══════════════════════════════════════════════════════════════════

  _showUnoCall(playerName) {
    this.unoCallText.setText(`${playerName}: UNO!`);
    this.unoCallText.setAlpha(0).setScale(0.3).setDepth(100);
    this.tweens.add({
      targets: this.unoCallText,
      alpha: 1, scaleX: 1.3, scaleY: 1.3,
      duration: 400, ease: 'Back.easeOut',
      yoyo: true, hold: 800,
      onComplete: () => this.unoCallText.setAlpha(0),
    });
    const flash = this.add.graphics();
    flash.fillStyle(0xf1c40f, 0.15);
    flash.fillRect(0, 0, W, H);
    flash.setDepth(99);
    this.tweens.add({
      targets: flash, alpha: 0, duration: 600,
      onComplete: () => flash.destroy(),
    });
  }

  // ══════════════════════════════════════════════════════════════════
  // MESSAGES & EFFECTS
  // ══════════════════════════════════════════════════════════════════

  _showMessage(text) {
    this.messageText.setText(text);
    this.messageText.setAlpha(1).setScale(0.5);
    this.tweens.add({
      targets: this.messageText,
      scaleX: 1.1, scaleY: 1.1, alpha: 0,
      duration: 2200, ease: 'Cubic.easeOut',
    });
  }

  _screenShake(intensity = 8) {
    this.cameras.main.shake(400, intensity / 1000);
  }

  // ══════════════════════════════════════════════════════════════
  // DRAW EVENT ANIMATION — cards fly from pile to player
  // ══════════════════════════════════════════════════════════════

  _animateDrawEvent(data) {
    const { playerId, drawCount } = data;
    const playerPos = this._getPlayerPanelPos(playerId);
    if (!playerPos) return;

    // Play draw-N-cards announcement for stacked draws
    if (drawCount >= 2) {
      playDrawNCards(drawCount);
    }

    const count = Math.min(drawCount, 10); // cap visual cards
    for (let i = 0; i < count; i++) {
      this.time.delayedCall(i * 300, () => {
        const cardBack = drawCardBack(this, CX + 120, CY, 0.8);
        cardBack.setDepth(50);
        playSound('card-deal');

        this.tweens.add({
          targets: cardBack,
          x: playerPos.x,
          y: playerPos.y + 40,
          scaleX: 0.35,
          scaleY: 0.35,
          alpha: 0,
          duration: 800,
          ease: 'Quad.easeOut',
          onComplete: () => cardBack.destroy(),
        });
      });
    }
  }
}
