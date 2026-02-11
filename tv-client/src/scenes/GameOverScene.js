// ─── GameOverScene ──────────────────────────────────────────────────────────
// Final game over screen (a player hit 500+ points).

import Phaser from 'phaser';
import socket from '../socket.js';

export class GameOverScene extends Phaser.Scene {
    constructor() {
        super({ key: 'GameOverScene' });
    }

    init(data) {
        this.resultData = data;
    }

    create() {
        const cx = 1920 / 2;

        // Background
        const bg = this.add.graphics();
        bg.fillGradientStyle(0x2c003e, 0x2c003e, 0x0f3460, 0x0f3460, 1);
        bg.fillRect(0, 0, 1920, 1080);

        // Title
        this.add.text(cx, 100, '🎉 GAME OVER 🎉', {
            fontFamily: 'Arial Black', fontSize: '72px', color: '#f1c40f', fontStyle: 'bold',
        }).setOrigin(0.5);

        // Champion
        const winnerName = this.resultData.scores?.find(s => s.id === this.resultData.winnerId)?.name || 'Unknown';
        this.add.text(cx, 240, `👑 ${winnerName} is the UNO Champion! 👑`, {
            fontFamily: 'Arial Black', fontSize: '48px', color: '#e94560',
        }).setOrigin(0.5);

        this.add.text(cx, 320, `Total: ${this.resultData.totalScore} points`, {
            fontFamily: 'Arial', fontSize: '36px', color: '#2ecc71',
        }).setOrigin(0.5);

        // Final scoreboard
        this.add.text(cx, 420, 'FINAL STANDINGS', {
            fontFamily: 'Arial Black', fontSize: '36px', color: '#fff',
        }).setOrigin(0.5);

        const scores = this.resultData.scores || [];
        scores.sort((a, b) => b.score - a.score);

        const medals = ['🥇', '🥈', '🥉'];
        scores.forEach((s, i) => {
            const medal = medals[i] || `${i + 1}.`;
            const color = i === 0 ? '#f1c40f' : '#e0e0e0';
            this.add.text(cx, 500 + i * 52, `${medal} ${s.name} — ${s.score} pts`, {
                fontFamily: 'Arial', fontSize: '30px', color,
            }).setOrigin(0.5);
        });

        // Massive confetti
        this._showConfetti();

        // Pulse crown animation
        const crown = this.add.text(cx, 160, '👑', {
            fontSize: '80px',
        }).setOrigin(0.5);
        this.tweens.add({
            targets: crown,
            scaleX: 1.3, scaleY: 1.3,
            yoyo: true, repeat: -1, duration: 700,
            ease: 'Sine.easeInOut',
        });
    }

    _showConfetti() {
        for (let i = 0; i < 120; i++) {
            const x = Phaser.Math.Between(100, 1820);
            const delay = Phaser.Math.Between(0, 2000);
            const color = Phaser.Math.RND.pick([0xe94560, 0xf1c40f, 0x2ecc71, 0x3498db, 0x9b59b6, 0xe67e22]);
            const rect = this.add.graphics();
            rect.fillStyle(color, 1);
            rect.fillRect(-5, -5, 10, 10);
            rect.setPosition(x, -30);

            this.tweens.add({
                targets: rect,
                y: 1120,
                x: x + Phaser.Math.Between(-150, 150),
                angle: Phaser.Math.Between(0, 1080),
                duration: Phaser.Math.Between(2000, 4000),
                delay,
                ease: 'Cubic.easeIn',
                onComplete: () => rect.destroy(),
            });
        }
    }
}
