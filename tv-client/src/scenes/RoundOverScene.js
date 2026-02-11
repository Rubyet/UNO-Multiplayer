// ─── RoundOverScene ─────────────────────────────────────────────────────────
// Displays round results with confetti and "Next Round" button.

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

    // Background
    const bg = this.add.graphics();
    bg.fillGradientStyle(0x0b1e3d, 0x0b1e3d, 0x0d1525, 0x0d1525, 1);
    bg.fillRect(0, 0, 1920, 1080);

    // Title
    this.add.text(cx, 100, '🏆 ROUND OVER', {
      fontFamily: 'Arial Black', fontSize: '64px', color: '#f1c40f',
      fontStyle: 'bold', stroke: '#000', strokeThickness: 4,
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
      const isWinner = s.id === this.resultData.winnerId;
      const color = isWinner ? '#f1c40f' : '#e0e0e0';
      const txt = this.add.text(cx, 440 + i * 48, `${i + 1}. ${s.name} — ${s.score} pts`, {
        fontFamily: 'Arial', fontSize: '28px', color,
        fontStyle: isWinner ? 'bold' : 'normal',
      }).setOrigin(0.5);
      // Animate in
      txt.setAlpha(0);
      this.tweens.add({ targets: txt, alpha: 1, duration: 300, delay: i * 100 });
    });

    // Next round button
    const btnY = Math.min(440 + scores.length * 48 + 80, 900);
    const btnBg = this.add.graphics();
    btnBg.fillStyle(0x27ae60, 1);
    btnBg.fillRoundedRect(cx - 160, btnY - 28, 320, 60, 14);
    btnBg.setInteractive(new Phaser.Geom.Rectangle(cx - 160, btnY - 28, 320, 60), Phaser.Geom.Rectangle.Contains);

    const btnText = this.add.text(cx, btnY + 2, '▶  NEXT ROUND', {
      fontFamily: 'Arial Black', fontSize: '32px', color: '#fff',
    }).setOrigin(0.5);

    btnBg.on('pointerover', () => {
      btnBg.clear(); btnBg.fillStyle(0x1e8449, 1);
      btnBg.fillRoundedRect(cx - 160, btnY - 28, 320, 60, 14);
    });
    btnBg.on('pointerout', () => {
      btnBg.clear(); btnBg.fillStyle(0x27ae60, 1);
      btnBg.fillRoundedRect(cx - 160, btnY - 28, 320, 60, 14);
    });
    btnBg.on('pointerdown', () => {
      btnBg.disableInteractive();
      btnText.setAlpha(0.5);
      socket.emit('next_round', (res) => {
        if (!res.ok) { btnBg.setInteractive(); btnText.setAlpha(1); }
      });
    });

    // Confetti
    this._showConfetti();

    socket.on('game_started', (data) => {
      this.scene.start('GameScene', {
        firstCard: data.firstCard,
        effects: data.effects,
        dealSequence: data.dealSequence,
        players: data.players,
        roomCode: data.roomCode,
      });
    });
  }

  _showConfetti() {
    for (let i = 0; i < 70; i++) {
      const x = Phaser.Math.Between(200, 1720);
      const color = Phaser.Math.RND.pick([0xe94560, 0xf1c40f, 0x27ae60, 0x2980b9, 0x9b59b6]);
      const rect = this.add.graphics();
      rect.fillStyle(color, 1);
      rect.fillRect(-4, -4, 8, 8);
      rect.setPosition(x, -20);
      this.tweens.add({
        targets: rect,
        y: 1100, x: x + Phaser.Math.Between(-100, 100),
        angle: Phaser.Math.Between(0, 720),
        duration: Phaser.Math.Between(1500, 3000),
        ease: 'Cubic.easeIn',
        onComplete: () => rect.destroy(),
      });
    }
  }
}
