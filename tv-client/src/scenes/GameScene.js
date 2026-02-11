// ─── GameScene ──────────────────────────────────────────────────────────────
// Main TV gameplay display: discard pile, draw pile, player panels, direction
// arrow, current color glow, active player highlight, animations.

import Phaser from 'phaser';
import socket from '../socket.js';
import { drawCard, drawCardBack, getColorHex, COLOR_MAP } from '../CardGraphics.js';

export class GameScene extends Phaser.Scene {
    constructor() {
        super({ key: 'GameScene' });
        this.state = null;
        this.playerPanels = [];
        this.discardContainer = null;
        this.drawPileContainer = null;
        this.directionArrow = null;
        this.colorGlow = null;
        this.messageText = null;
    }

    init(data) {
        this.firstCard = data?.firstCard;
        this.firstEffects = data?.effects;
    }

    create() {
        const W = 1920;
        const H = 1080;
        const cx = W / 2;
        const cy = H / 2;

        // Background
        const bg = this.add.graphics();
        bg.fillGradientStyle(0x0f3460, 0x0f3460, 0x16213e, 0x16213e, 1);
        bg.fillRect(0, 0, W, H);

        // Table felt (oval)
        const felt = this.add.graphics();
        felt.fillStyle(0x1a5c3a, 1);
        felt.fillEllipse(cx, cy, 1000, 600);
        felt.lineStyle(4, 0x2ecc71, 0.6);
        felt.strokeEllipse(cx, cy, 1000, 600);

        // Color glow ring behind discard
        this.colorGlow = this.add.graphics();
        this._drawColorGlow(0x2ecc71);

        // Discard pile area
        this.discardGroup = this.add.container(cx - 60, cy);

        // Draw pile area
        this.drawPileGroup = this.add.container(cx + 120, cy);
        const backCard = drawCardBack(this, 0, 0, 1.1);
        this.drawPileGroup.add(backCard);
        const drawLabel = this.add.text(cx + 120, cy + 90, 'DRAW', {
            fontFamily: 'Arial Black', fontSize: '18px', color: '#aaa',
        }).setOrigin(0.5);

        // Draw pile count
        this.drawCountText = this.add.text(cx + 120, cy - 90, '', {
            fontFamily: 'Arial Black', fontSize: '20px', color: '#f1c40f',
        }).setOrigin(0.5);

        // Direction arrow
        this.directionText = this.add.text(cx, cy - 200, '→ Clockwise', {
            fontFamily: 'Arial, sans-serif',
            fontSize: '28px',
            color: '#2ecc71',
            fontStyle: 'bold',
        }).setOrigin(0.5);

        // Current color indicator
        this.colorLabel = this.add.text(cx, cy + 180, '', {
            fontFamily: 'Arial Black', fontSize: '24px', color: '#fff',
        }).setOrigin(0.5);

        // Player panels container
        this.panelsContainer = this.add.container(0, 0);

        // Message overlay (for effects)
        this.messageText = this.add.text(cx, 80, '', {
            fontFamily: 'Arial Black', fontSize: '36px', color: '#e94560',
        }).setOrigin(0.5).setAlpha(0);

        // Confetti emitter (for wins)
        this.confettiParticles = null;

        // ── Socket listeners ──
        socket.on('state_update', (state) => this._onStateUpdate(state));

        socket.on('card_effect', (effect) => this._onCardEffect(effect));

        socket.on('challenge_result', (data) => {
            const msg = data.effect === 'challenge_success'
                ? `Challenge SUCCESS! Offender draws ${data.drew}`
                : data.effect === 'challenge_fail'
                    ? `Challenge FAILED! Challenger draws ${data.drew}`
                    : `Challenge declined. Draws ${data.drew}`;
            this._showMessage(msg);
        });

        socket.on('uno_event', (data) => {
            if (data.effect === 'uno_said') {
                this._showMessage('UNO! 🎉');
            } else if (data.effect === 'uno_catch') {
                this._showMessage('Caught! +2 penalty 🚨');
            }
        });

        socket.on('round_over', (data) => {
            this.scene.start('RoundOverScene', data);
        });

        socket.on('game_over', (data) => {
            this.scene.start('GameOverScene', data);
        });
    }

    _onStateUpdate(state) {
        this.state = state;
        this._renderDiscard(state.topCard);
        this._renderColorGlow(state.currentColor);
        this._renderDirection(state.direction);
        this._renderPlayers(state.players, state.currentPlayerId);
        this._renderDrawCount(state.drawPileCount);
        this._renderColorLabel(state.currentColor);
    }

    _renderDiscard(topCard) {
        if (!topCard) return;
        this.discardGroup.removeAll(true);
        const card = drawCard(this, 0, 0, topCard, 1.3);
        this.discardGroup.add(card);

        // Animate card placement
        card.setScale(0.3);
        card.setAlpha(0);
        this.tweens.add({
            targets: card,
            scaleX: 1, scaleY: 1,
            alpha: 1,
            duration: 300,
            ease: 'Back.easeOut',
        });
    }

    _drawColorGlow(colorHex) {
        this.colorGlow.clear();
        this.colorGlow.fillStyle(colorHex, 0.15);
        this.colorGlow.fillCircle(1920 / 2 - 60, 1080 / 2, 130);
        this.colorGlow.lineStyle(4, colorHex, 0.5);
        this.colorGlow.strokeCircle(1920 / 2 - 60, 1080 / 2, 130);
    }

    _renderColorGlow(colorName) {
        const hex = getColorHex(colorName);
        this._drawColorGlow(hex);
    }

    _renderDirection(dir) {
        this.directionText.setText(dir === 1 ? '→ Clockwise' : '← Counter-Clockwise');

        // Spin animation on reverse
        this.tweens.add({
            targets: this.directionText,
            angle: { from: dir === 1 ? -360 : 360, to: 0 },
            duration: 600,
            ease: 'Cubic.easeOut',
        });
    }

    _renderPlayers(players, currentPlayerId) {
        this.panelsContainer.removeAll(true);
        this.playerPanels = [];

        const n = players.length;
        const W = 1920;
        const H = 1080;
        const cx = W / 2;

        // Arrange players around the table
        const positions = this._getPlayerPositions(n);

        players.forEach((p, i) => {
            const pos = positions[i];
            const isCurrent = p.id === currentPlayerId;

            // Panel background
            const panel = this.add.graphics();
            const panelW = 200;
            const panelH = 80;

            if (isCurrent) {
                panel.fillStyle(0xe94560, 0.3);
                panel.lineStyle(3, 0xe94560, 1);
            } else {
                panel.fillStyle(0x1a1a2e, 0.7);
                panel.lineStyle(2, 0x333366, 0.8);
            }
            panel.fillRoundedRect(pos.x - panelW / 2, pos.y - panelH / 2, panelW, panelH, 12);
            panel.strokeRoundedRect(pos.x - panelW / 2, pos.y - panelH / 2, panelW, panelH, 12);
            this.panelsContainer.add(panel);

            // Player name
            const nameColor = isCurrent ? '#e94560' : '#e0e0e0';
            const nameText = this.add.text(pos.x, pos.y - 16, p.name, {
                fontFamily: 'Arial, sans-serif',
                fontSize: '22px',
                color: nameColor,
                fontStyle: isCurrent ? 'bold' : 'normal',
            }).setOrigin(0.5);
            this.panelsContainer.add(nameText);

            // Card count
            const countText = this.add.text(pos.x, pos.y + 16, `🃏 ${p.cardCount}`, {
                fontFamily: 'Arial, sans-serif',
                fontSize: '20px',
                color: '#f1c40f',
            }).setOrigin(0.5);
            this.panelsContainer.add(countText);

            // Score
            const scoreText = this.add.text(pos.x + 80, pos.y - 16, `${p.score}pts`, {
                fontFamily: 'Arial, sans-serif',
                fontSize: '14px',
                color: '#aaa',
            }).setOrigin(0.5);
            this.panelsContainer.add(scoreText);

            // UNO indicator
            if (p.cardCount === 1 && p.saidUno) {
                const unoText = this.add.text(pos.x, pos.y + 42, 'UNO!', {
                    fontFamily: 'Arial Black',
                    fontSize: '18px',
                    color: '#e94560',
                    fontStyle: 'bold',
                }).setOrigin(0.5);
                this.panelsContainer.add(unoText);

                this.tweens.add({
                    targets: unoText,
                    scaleX: 1.2, scaleY: 1.2,
                    yoyo: true,
                    repeat: -1,
                    duration: 500,
                });
            }

            // Disconnected indicator
            if (!p.connected) {
                const dcText = this.add.text(pos.x, pos.y + 42, '⏳ Reconnecting...', {
                    fontFamily: 'Arial', fontSize: '14px', color: '#e74c3c',
                }).setOrigin(0.5);
                this.panelsContainer.add(dcText);
            }

            // Active player pulse
            if (isCurrent) {
                const pulse = this.add.graphics();
                pulse.lineStyle(3, 0xe94560, 0.8);
                pulse.strokeRoundedRect(pos.x - panelW / 2 - 4, pos.y - panelH / 2 - 4, panelW + 8, panelH + 8, 14);
                this.panelsContainer.add(pulse);

                this.tweens.add({
                    targets: pulse,
                    alpha: { from: 1, to: 0.3 },
                    yoyo: true,
                    repeat: -1,
                    duration: 800,
                });
            }

            this.playerPanels.push({ panel, nameText, countText, pos });
        });
    }

    _getPlayerPositions(n) {
        const positions = [];
        const W = 1920;
        const H = 1080;
        const cx = W / 2;
        const cy = H / 2;
        const rx = 700; // horizontal radius
        const ry = 420; // vertical radius

        for (let i = 0; i < n; i++) {
            // Distribute evenly around an ellipse, starting from the bottom
            const angle = (Math.PI * 2 * i) / n - Math.PI / 2;
            positions.push({
                x: cx + Math.cos(angle) * rx,
                y: cy + Math.sin(angle) * ry,
            });
        }
        return positions;
    }

    _renderDrawCount(count) {
        this.drawCountText.setText(`${count}`);
    }

    _renderColorLabel(colorName) {
        if (!colorName) {
            this.colorLabel.setText('');
            return;
        }
        const hex = COLOR_MAP[colorName];
        const hexStr = hex ? `#${hex.toString(16).padStart(6, '0')}` : '#fff';
        this.colorLabel.setText(`● ${colorName.toUpperCase()}`);
        this.colorLabel.setColor(hexStr);
    }

    _onCardEffect(effect) {
        switch (effect.type) {
            case 'reverse':
                this._showMessage('REVERSE! ⇄');
                this._spinDirectionArrow();
                break;
            case 'skip':
                this._showMessage('SKIP! ⊘');
                break;
            case 'draw2':
                this._showMessage('+2 DRAW! 🃏🃏');
                this._screenShake(5);
                break;
            case 'wild_draw4':
                this._showMessage('+4 WILD! 💀');
                this._screenShake(10);
                break;
            case 'wild':
                this._showMessage('WILD! 🌈');
                break;
        }
    }

    _showMessage(text) {
        this.messageText.setText(text);
        this.messageText.setAlpha(1).setScale(0.5);
        this.tweens.add({
            targets: this.messageText,
            scaleX: 1.2, scaleY: 1.2,
            alpha: 0,
            duration: 2000,
            ease: 'Cubic.easeOut',
        });
    }

    _spinDirectionArrow() {
        this.tweens.add({
            targets: this.directionText,
            angle: { from: 0, to: 360 },
            duration: 600,
            ease: 'Cubic.easeOut',
        });
    }

    _screenShake(intensity = 8) {
        this.cameras.main.shake(400, intensity / 1000);
    }

    _showConfetti() {
        // Simple confetti using graphics particles
        for (let i = 0; i < 80; i++) {
            const x = Phaser.Math.Between(200, 1720);
            const color = Phaser.Math.RND.pick([0xe94560, 0xf1c40f, 0x2ecc71, 0x3498db, 0x9b59b6]);
            const rect = this.add.graphics();
            rect.fillStyle(color, 1);
            rect.fillRect(-4, -4, 8, 8);
            rect.setPosition(x, -20);

            this.tweens.add({
                targets: rect,
                y: 1100,
                x: x + Phaser.Math.Between(-100, 100),
                angle: Phaser.Math.Between(0, 720),
                duration: Phaser.Math.Between(1500, 3000),
                ease: 'Cubic.easeIn',
                onComplete: () => rect.destroy(),
            });
        }
    }
}
