// ─── LobbyScene ─────────────────────────────────────────────────────────────
// Shows room code, QR-hint, and the list of joined players. TV creates the room.

import Phaser from 'phaser';
import socket from '../socket.js';

export class LobbyScene extends Phaser.Scene {
    constructor() {
        super({ key: 'LobbyScene' });
        this.roomCode = null;
        this.playerTexts = [];
    }

    create() {
        const cx = this.cameras.main.centerX;
        const cy = this.cameras.main.centerY;

        // Background gradient
        const bg = this.add.graphics();
        bg.fillGradientStyle(0x0f3460, 0x0f3460, 0x16213e, 0x16213e, 1);
        bg.fillRect(0, 0, 1920, 1080);

        // Title
        this.add.text(cx, 100, '🎴 UNO MULTIPLAYER', {
            fontFamily: 'Arial Black, Arial, sans-serif',
            fontSize: '64px',
            color: '#e94560',
            fontStyle: 'bold',
        }).setOrigin(0.5);

        // Room code placeholder
        this.codeText = this.add.text(cx, 240, 'Creating room...', {
            fontFamily: 'Courier New, monospace',
            fontSize: '96px',
            color: '#f1c40f',
            fontStyle: 'bold',
        }).setOrigin(0.5);

        this.instructionText = this.add.text(cx, 340, 'Join from your phone at the URL shown by the server', {
            fontFamily: 'Arial, sans-serif',
            fontSize: '28px',
            color: '#a0a0c0',
        }).setOrigin(0.5);

        // Player list
        this.playersTitle = this.add.text(cx, 440, 'PLAYERS', {
            fontFamily: 'Arial Black, Arial, sans-serif',
            fontSize: '36px',
            color: '#ffffff',
        }).setOrigin(0.5);

        this.playerListContainer = this.add.container(cx, 520);

        // Start button (hidden until ≥ 2 players)
        this.startBtn = this.add.text(cx, 950, '▶  START GAME', {
            fontFamily: 'Arial Black, Arial, sans-serif',
            fontSize: '48px',
            color: '#1a1a2e',
            backgroundColor: '#2ecc71',
            padding: { x: 40, y: 16 },
        })
            .setOrigin(0.5)
            .setInteractive({ useHandCursor: true })
            .setVisible(false);

        this.startBtn.on('pointerover', () => this.startBtn.setStyle({ backgroundColor: '#27ae60' }));
        this.startBtn.on('pointerout', () => this.startBtn.setStyle({ backgroundColor: '#2ecc71' }));
        this.startBtn.on('pointerdown', () => this._startGame());

        // Create room on server
        socket.emit('create_room', (response) => {
            if (response.ok) {
                this.roomCode = response.roomCode;
                this.codeText.setText(response.roomCode);
                this.instructionText.setText(
                    `Open your phone browser → http://<YOUR_IP>:5174\nEnter code: ${response.roomCode}`
                );
            }
        });

        // Also listen for room_created event
        socket.on('room_created', (data) => {
            if (!this.roomCode) {
                this.roomCode = data.roomCode;
                this.codeText.setText(data.roomCode);
            }
        });

        // Player joined
        socket.on('player_joined', (data) => {
            this._updatePlayerList(data.players);
        });

        // If game started (could be triggered remotely)
        socket.on('game_started', (data) => {
            this.scene.start('GameScene', { firstCard: data.firstCard, effects: data.effects });
        });
    }

    _updatePlayerList(players) {
        // Clear old
        this.playerListContainer.removeAll(true);
        this.playerTexts = [];

        players.forEach((p, i) => {
            const row = this.add.text(0, i * 50, `${i + 1}. ${p.name}`, {
                fontFamily: 'Arial, sans-serif',
                fontSize: '32px',
                color: '#e0e0e0',
            }).setOrigin(0.5);
            this.playerListContainer.add(row);
            this.playerTexts.push(row);
        });

        // Show start button when ≥ 2 players
        this.startBtn.setVisible(players.length >= 2);
    }

    _startGame() {
        this.startBtn.disableInteractive();
        this.startBtn.setStyle({ backgroundColor: '#7f8c8d' });
        socket.emit('start_game', (res) => {
            if (!res.ok) {
                this.startBtn.setInteractive();
                this.startBtn.setStyle({ backgroundColor: '#2ecc71' });
            }
        });
    }
}
