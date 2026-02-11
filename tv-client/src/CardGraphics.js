// ─── Card Drawing Utility ───────────────────────────────────────────────────
// Programmatically draws UNO cards as Phaser graphics (no sprite assets needed).

const COLOR_MAP = {
    red: 0xe74c3c,
    yellow: 0xf1c40f,
    green: 0x2ecc71,
    blue: 0x3498db,
    wild: 0x2c3e50,
};

const VALUE_LABELS = {
    skip: '⊘',
    reverse: '⇄',
    draw2: '+2',
    wild: 'W',
    wild_draw4: '+4',
};

/**
 * Draw a card at (x, y) and return the container.
 */
export function drawCard(scene, x, y, card, scale = 1) {
    const W = 90 * scale;
    const H = 130 * scale;
    const R = 8 * scale;

    const container = scene.add.container(x, y);

    // Card background
    const bg = scene.add.graphics();
    const fillColor = COLOR_MAP[card.color] || 0x333333;
    bg.fillStyle(0xffffff, 1);
    bg.fillRoundedRect(-W / 2, -H / 2, W, H, R);
    bg.fillStyle(fillColor, 1);
    bg.fillRoundedRect(-W / 2 + 4, -H / 2 + 4, W - 8, H - 8, R - 2);
    container.add(bg);

    // White oval center
    const oval = scene.add.graphics();
    oval.fillStyle(0xffffff, 0.9);
    oval.fillEllipse(0, 0, W * 0.55, H * 0.45);
    container.add(oval);

    // Card text
    const label = VALUE_LABELS[card.value] || card.value;
    const fontSize = card.value.length > 1 ? 22 * scale : 32 * scale;
    const textColor = card.color === 'wild' ? '#2c3e50' : '#1a1a2e';
    const txt = scene.add.text(0, 0, label, {
        fontFamily: 'Arial Black, Arial, sans-serif',
        fontSize: `${fontSize}px`,
        color: textColor,
        fontStyle: 'bold',
    }).setOrigin(0.5);
    container.add(txt);

    // Small corner label
    const cornerSize = 14 * scale;
    const corner = scene.add.text(-W / 2 + 10, -H / 2 + 6, label, {
        fontFamily: 'Arial, sans-serif',
        fontSize: `${cornerSize}px`,
        color: '#ffffff',
        fontStyle: 'bold',
    });
    container.add(corner);

    container.setSize(W, H);
    return container;
}

/**
 * Draw a card back (for draw pile / other players' cards).
 */
export function drawCardBack(scene, x, y, scale = 1) {
    const W = 90 * scale;
    const H = 130 * scale;
    const R = 8 * scale;

    const container = scene.add.container(x, y);

    const bg = scene.add.graphics();
    bg.fillStyle(0xffffff, 1);
    bg.fillRoundedRect(-W / 2, -H / 2, W, H, R);
    bg.fillStyle(0x2c3e50, 1);
    bg.fillRoundedRect(-W / 2 + 4, -H / 2 + 4, W - 8, H - 8, R - 2);
    container.add(bg);

    const oval = scene.add.graphics();
    oval.fillStyle(0xe74c3c, 1);
    oval.fillEllipse(0, 0, W * 0.55, H * 0.45);
    container.add(oval);

    const txt = scene.add.text(0, 0, 'UNO', {
        fontFamily: 'Arial Black, Arial, sans-serif',
        fontSize: `${18 * scale}px`,
        color: '#f1c40f',
        fontStyle: 'bold',
    }).setOrigin(0.5);
    container.add(txt);

    container.setSize(W, H);
    return container;
}

/**
 * HEX int to glow-friendly color.
 */
export function getColorHex(colorName) {
    return COLOR_MAP[colorName] || 0x333333;
}

export { COLOR_MAP };
