// ─── GameOverScene ──────────────────────────────────────────────────────────
// Final game over screen with champion display and confetti.

import Phaser from 'phaser';

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
    bg.fillGradientStyle(0x2c003e, 0x2c003e, 0x0b1e3d, 0x0b1e3d, 1);
    bg.fillRect(0, 0, 1920, 1080);

    // Crown
    const crown = this.add.text(cx, 80, '👑', { fontSize: '80px' }).setOrigin(0.5);
    this.tweens.add({
      targets: crown,
      scaleX: 1.3, scaleY: 1.3,
      yoyo: true, repeat: -1, duration: 700, ease: 'Sine.easeInOut',
    });

    // Title
    this.add.text(cx, 180, 'GAME OVER', {
      fontFamily: 'Arial Black', fontSize: '72px', color: '#f1c40f',
      fontStyle: 'bold', stroke: '#000', strokeThickness: 5,
    }).setOrigin(0.5);

    // Champion
    const winnerName = this.resultData.scores?.find(s => s.id === this.resultData.winnerId)?.name || 'Unknown';
    this.add.text(cx, 280, `${winnerName} is the UNO Champion!`, {
      fontFamily: 'Arial Black', fontSize: '44px', color: '#e94560',
      stroke: '#000', strokeThickness: 3,
    }).setOrigin(0.5);

    this.add.text(cx, 340, `Total: ${this.resultData.totalScore || 0} points`, {
      fontFamily: 'Arial', fontSize: '32px', color: '#2ecc71',
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
      const txt = this.add.text(cx, 500 + i * 52, `${medal} ${s.name} — ${s.score} pts`, {
        fontFamily: 'Arial', fontSize: '30px', color,
        fontStyle: i === 0 ? 'bold' : 'normal',
      }).setOrigin(0.5);
      txt.setAlpha(0);
      this.tweens.add({ targets: txt, alpha: 1, duration: 400, delay: i * 120 });
    });

    // Massive confetti
    this._showConfetti();
  }

  _showConfetti() {
    for (let i = 0; i < 120; i++) {
      const x = Phaser.Math.Between(100, 1820);
      const delay = Phaser.Math.Between(0, 2000);
      const color = Phaser.Math.RND.pick([0xe94560, 0xf1c40f, 0x27ae60, 0x2980b9, 0x9b59b6, 0xe67e22]);
      const rect = this.add.graphics();
      rect.fillStyle(color, 1);
      rect.fillRect(-5, -5, 10, 10);
      rect.setPosition(x, -30);
      this.tweens.add({
        targets: rect,
        y: 1120, x: x + Phaser.Math.Between(-150, 150),
        angle: Phaser.Math.Between(0, 1080),
        duration: Phaser.Math.Between(2000, 4000),
        delay, ease: 'Cubic.easeIn',
        onComplete: () => rect.destroy(),
      });
    }
  }
}
