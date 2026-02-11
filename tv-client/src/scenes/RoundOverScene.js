// ─── RoundOverScene ─────────────────────────────────────────────────────────
// Displays round results and a "Next Round" button.

import Phaser from 'phaser';
import socket from '../socket.js';

export class RoundOverScene extends Phaser.Scene {
    constructor() {
        super({ key: 'RoundOverScene' });
    }

    init(data) {
        this.resultData = data;
    }

    create() {
        const cx = 1920 / 2;
        const cy = 1080 / 2;

        // Background
        const bg = this.add.graphics();
        bg.fillGradientStyle(0x0f3460, 0x0f3460, 0x16213e, 0x16213e, 1);
        bg.fillRect(0, 0, 1920, 1080);

        // Title
        this.add.text(cx, 100, '🏆 ROUND OVER', {
            fontFamily: 'Arial Black', fontSize: '64px', color: '#f1c40f', fontStyle: 'bold',
        }).setOrigin(0.5);

        // Winner
        const winnerName = this.resultData.scores?.find(s => s.id === this.resultData.winnerId)?.name || 'Unknown';
        this.add.text(cx, 220, `${winnerName} wins the round!`, {
            fontFamily: 'Arial', fontSize: '40px', color: '#2ecc71',
        }).setOrigin(0.5);

        this.add.text(cx, 290, `+${this.resultData.roundScore} points`, {
            fontFamily: 'Arial', fontSize: '32px', color: '#e94560',
        }).setOrigin(0.5);

        // Scoreboard
        this.add.text(cx, 380, 'SCOREBOARD', {
            fontFamily: 'Arial Black', fontSize: '32px', color: '#fff',
        }).setOrigin(0.5);

        const scores = this.resultData.scores || [];
        scores.sort((a, b) => b.score - a.score);

        scores.forEach((s, i) => {
            const color = s.id === this.resultData.winnerId ? '#f1c40f' : '#e0e0e0';
            this.add.text(cx, 440 + i * 48, `${i + 1}. ${s.name} — ${s.score} pts`, {
                fontFamily: 'Arial', fontSize: '28px', color,
            }).setOrigin(0.5);
        });

        // Next round button
        const btnY = Math.min(440 + scores.length * 48 + 80, 900);
        const btn = this.add.text(cx, btnY, '▶  NEXT ROUND', {
            fontFamily: 'Arial Black', fontSize: '42px', color: '#1a1a2e',
            backgroundColor: '#2ecc71', padding: { x: 40, y: 14 },
        }).setOrigin(0.5).setInteractive({ useHandCursor: true });

        btn.on('pointerover', () => btn.setStyle({ backgroundColor: '#27ae60' }));
        btn.on('pointerout', () => btn.setStyle({ backgroundColor: '#2ecc71' }));
        btn.on('pointerdown', () => {
            btn.disableInteractive();
            socket.emit('next_round', (res) => {
                if (!res.ok) btn.setInteractive();
            });
        });

        // Confetti
        this._showConfetti();

        // Listen for next game start
        socket.on('game_started', (data) => {
            this.scene.start('GameScene', { firstCard: data.firstCard, effects: data.effects });
        });
    }

    _showConfetti() {
        for (let i = 0; i < 60; i++) {
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
