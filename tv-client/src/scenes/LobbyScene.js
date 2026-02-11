// ─── LobbyScene ─────────────────────────────────────────────────────────────
// Shows room code, player list with avatars, start button.
// Players visible immediately upon joining. Starting player highlighted.

import Phaser from 'phaser';
import socket from '../socket.js';

const AVATAR_EMOJI = {
  cat: '🐱', dog: '🐶', fox: '🦊', owl: '🦉', bear: '🐻',
  rabbit: '🐰', panda: '🐼', koala: '🐨', lion: '🦁', penguin: '🐧',
};

export class LobbyScene extends Phaser.Scene {
  constructor() {
    super({ key: 'LobbyScene' });
    this.roomCode = null;
    this.playerTexts = [];
  }

  create() {
    const cx = 1920 / 2;
    const cy = 1080 / 2;

    // Background
    const bg = this.add.graphics();
    bg.fillGradientStyle(0x0b1e3d, 0x0b1e3d, 0x0d1525, 0x0d1525, 1);
    bg.fillRect(0, 0, 1920, 1080);

    // Decorative UNO cards scattered in background
    this._drawDecorativeCards();

    // Title
    this.add.text(cx, 80, 'UNO', {
      fontFamily: 'Arial Black, Impact, sans-serif',
      fontSize: '96px',
      color: '#e94560',
      fontStyle: 'bold',
      stroke: '#000',
      strokeThickness: 6,
    }).setOrigin(0.5);

    this.add.text(cx, 155, 'MULTIPLAYER', {
      fontFamily: 'Arial, sans-serif',
      fontSize: '28px',
      color: '#f1c40f',
      letterSpacing: 12,
    }).setOrigin(0.5);

    // Room code placeholder
    this.codeText = this.add.text(cx, 260, 'Creating room...', {
      fontFamily: 'Courier New, monospace',
      fontSize: '88px',
      color: '#f1c40f',
      fontStyle: 'bold',
      stroke: '#000',
      strokeThickness: 3,
    }).setOrigin(0.5);

    this.instructionText = this.add.text(cx, 340, 'Join from your phone browser', {
      fontFamily: 'Arial, sans-serif',
      fontSize: '24px',
      color: '#778899',
    }).setOrigin(0.5);

    // Player list header
    this.add.text(cx, 420, '── PLAYERS ──', {
      fontFamily: 'Arial Black',
      fontSize: '28px',
      color: '#ffffff',
    }).setOrigin(0.5);

    // Player list container
    this.playerListContainer = this.add.container(cx, 480);

    // Waiting dots animation
    this.waitingText = this.add.text(cx, 880, 'Waiting for players...', {
      fontFamily: 'Arial', fontSize: '22px', color: '#556677',
    }).setOrigin(0.5);
    this.tweens.add({
      targets: this.waitingText,
      alpha: { from: 1, to: 0.3 },
      yoyo: true, repeat: -1, duration: 1000,
    });

    // Start button (hidden until ≥ 2 players)
    const btnBg = this.add.graphics();
    btnBg.fillStyle(0x27ae60, 1);
    btnBg.fillRoundedRect(cx - 180, 920, 360, 70, 16);
    btnBg.setInteractive(new Phaser.Geom.Rectangle(cx - 180, 920, 360, 70), Phaser.Geom.Rectangle.Contains);
    btnBg.setVisible(false);

    this.startBtnBg = btnBg;
    this.startBtnText = this.add.text(cx, 955, '▶  START GAME', {
      fontFamily: 'Arial Black', fontSize: '36px', color: '#fff',
    }).setOrigin(0.5).setVisible(false);

    btnBg.on('pointerover', () => {
      btnBg.clear();
      btnBg.fillStyle(0x1e8449, 1);
      btnBg.fillRoundedRect(cx - 180, 920, 360, 70, 16);
    });
    btnBg.on('pointerout', () => {
      btnBg.clear();
      btnBg.fillStyle(0x27ae60, 1);
      btnBg.fillRoundedRect(cx - 180, 920, 360, 70, 16);
    });
    btnBg.on('pointerdown', () => this._startGame());

    // ── Challenge +4 toggle ──
    this.challengeEnabled = false;
    const toggleY = 860;
    this.toggleBg = this.add.graphics();
    this._drawToggle(cx, toggleY, false);
    this.toggleBg.setInteractive(
      new Phaser.Geom.Rectangle(cx - 200, toggleY - 22, 400, 44),
      Phaser.Geom.Rectangle.Contains
    );
    this.challengeText = this.add.text(cx, toggleY, '⚔️  +4 Challenge: OFF', {
      fontFamily: 'Arial', fontSize: '22px', color: '#888',
    }).setOrigin(0.5);

    this.toggleBg.on('pointerdown', () => {
      this.challengeEnabled = !this.challengeEnabled;
      this._drawToggle(cx, toggleY, this.challengeEnabled);
      this.challengeText.setText(`⚔️  +4 Challenge: ${this.challengeEnabled ? 'ON' : 'OFF'}`);
      this.challengeText.setColor(this.challengeEnabled ? '#2ecc71' : '#888');
      socket.emit('set_challenge', { enabled: this.challengeEnabled });
    });

    // Create room on server
    socket.emit('create_room', (response) => {
      if (response.ok) {
        this.roomCode = response.roomCode;
        this.codeText.setText(response.roomCode);
        this.instructionText.setText(
          `Open phone browser → http://<YOUR_IP>:5174  •  Code: ${response.roomCode}`
        );
      }
    });

    socket.on('room_created', (data) => {
      if (!this.roomCode) {
        this.roomCode = data.roomCode;
        this.codeText.setText(data.roomCode);
      }
    });

    socket.on('setting_changed', (data) => {
      if (data.challengeEnabled !== undefined) {
        this.challengeEnabled = data.challengeEnabled;
        const cx = 1920 / 2;
        const toggleY = 860;
        this._drawToggle(cx, toggleY, data.challengeEnabled);
        this.challengeText.setText(`⚔️  +4 Challenge: ${data.challengeEnabled ? 'ON' : 'OFF'}`);
        this.challengeText.setColor(data.challengeEnabled ? '#2ecc71' : '#888');
      }
    });

    socket.on('player_joined', (data) => {
      this._updatePlayerList(data.players);
    });

    socket.on('game_started', (data) => {
      this.scene.start('GameScene', {
        firstCard: data.firstCard,
        effects: data.effects,
        dealSequence: data.dealSequence,
        players: data.players,
        roomCode: this.roomCode,
      });
    });
  }

  _drawToggle(x, y, enabled) {
    this.toggleBg.clear();
    this.toggleBg.fillStyle(enabled ? 0x27ae60 : 0x2c3e50, 0.8);
    this.toggleBg.fillRoundedRect(x - 200, y - 22, 400, 44, 10);
    this.toggleBg.lineStyle(2, enabled ? 0x2ecc71 : 0x555555, 0.8);
    this.toggleBg.strokeRoundedRect(x - 200, y - 22, 400, 44, 10);
  }

  _drawDecorativeCards() {
    const colors = [0xe74c3c, 0xf1c40f, 0x27ae60, 0x2980b9];
    for (let i = 0; i < 6; i++) {
      const x = Phaser.Math.Between(50, 1870);
      const y = Phaser.Math.Between(500, 1000);
      const color = Phaser.Math.RND.pick(colors);
      const angle = Phaser.Math.Between(-30, 30);
      const g = this.add.graphics();
      g.fillStyle(color, 0.08);
      g.fillRoundedRect(-35, -50, 70, 100, 8);
      g.setPosition(x, y);
      g.setAngle(angle);
    }
  }

  _updatePlayerList(players) {
    this.playerListContainer.removeAll(true);
    this.playerTexts = [];

    players.forEach((p, i) => {
      const yOff = i * 56;
      const emoji = AVATAR_EMOJI[p.avatar] || '🎮';

      // Row background
      const rowBg = this.add.graphics();
      rowBg.fillStyle(0x16213e, 0.8);
      rowBg.fillRoundedRect(-200, yOff - 20, 400, 48, 10);
      this.playerListContainer.add(rowBg);

      // Avatar
      const avatarText = this.add.text(-170, yOff + 4, emoji, {
        fontSize: '28px',
      }).setOrigin(0.5);
      this.playerListContainer.add(avatarText);

      // Player name
      const nameText = this.add.text(-130, yOff + 4, p.name, {
        fontFamily: 'Arial, sans-serif',
        fontSize: '26px',
        color: '#e0e0e0',
        fontStyle: i === 0 ? 'bold' : 'normal',
      }).setOrigin(0, 0.5);
      this.playerListContainer.add(nameText);

      // First player indicator
      if (i === 0) {
        const starText = this.add.text(170, yOff + 4, '⭐ First', {
          fontFamily: 'Arial', fontSize: '16px', color: '#f1c40f',
        }).setOrigin(0.5);
        this.playerListContainer.add(starText);
      }

      // Join animation
      rowBg.setAlpha(0);
      avatarText.setAlpha(0);
      nameText.setAlpha(0);
      this.tweens.add({
        targets: [rowBg, avatarText, nameText],
        alpha: 1,
        duration: 300,
        delay: i * 80,
        ease: 'Quad.easeOut',
      });
    });

    // Show/hide start button
    const canStart = players.length >= 2;
    this.startBtnBg.setVisible(canStart);
    this.startBtnText.setVisible(canStart);
    this.waitingText.setVisible(!canStart);
  }

  _startGame() {
    this.startBtnBg.disableInteractive();
    this.startBtnText.setAlpha(0.5);
    socket.emit('start_game', (res) => {
      if (!res.ok) {
        this.startBtnBg.setInteractive();
        this.startBtnText.setAlpha(1);
      }
    });
  }
}
