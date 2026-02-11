// ─── Phaser Entry Point ─────────────────────────────────────────────────────
import Phaser from 'phaser';
import { LobbyScene } from './scenes/LobbyScene.js';
import { GameScene } from './scenes/GameScene.js';
import { RoundOverScene } from './scenes/RoundOverScene.js';
import { GameOverScene } from './scenes/GameOverScene.js';

const config = {
    type: Phaser.AUTO,
    parent: 'game-container',
    width: 1920,
    height: 1080,
    backgroundColor: '#16213e',
    scale: {
        mode: Phaser.Scale.FIT,
        autoCenter: Phaser.Scale.CENTER_BOTH,
    },
    scene: [LobbyScene, GameScene, RoundOverScene, GameOverScene],
};

const game = new Phaser.Game(config);
export default game;
