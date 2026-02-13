// ─── Card Drawing Utility ───────────────────────────────────────────────────
// Programmatically draws UNO-style cards with authentic design (Phaser 3).

const COLOR_MAP = {
  red: 0xe74c3c,
  yellow: 0xf1c40f,
  green: 0x27ae60,
  blue: 0x2980b9,
  wild: 0x1a1a2e,
};

const COLOR_HEX_STR = {
  red: '#e74c3c',
  yellow: '#f1c40f',
  green: '#27ae60',
  blue: '#2980b9',
  wild: '#1a1a2e',
};

const VALUE_LABELS = {
  skip: '⊘',
  reverse: '⇄',
  draw2: '+2',
  wild: '★',
  wild_draw4: '+4',
};

/**
 * Draw a UNO-style card front at (x, y) and return the container.
 */
export function drawCard(scene, x, y, card, scale = 1) {
  const W = 90 * scale;
  const H = 130 * scale;
  const R = 10 * scale;

  const container = scene.add.container(x, y);
  const isWild = card.color === 'wild';
  const fillColor = COLOR_MAP[card.color] || 0x333333;

  // ── Outer white border ──
  const border = scene.add.graphics();
  border.fillStyle(0xffffff, 1);
  border.fillRoundedRect(-W / 2, -H / 2, W, H, R);
  container.add(border);

  if (isWild) {
    // ── Wild card: 4-color quadrants ──
    const inner = scene.add.graphics();
    const inX = -W / 2 + 3 * scale;
    const inY = -H / 2 + 3 * scale;
    const inW = W - 6 * scale;
    const inH = H - 6 * scale;
    const hw = inW / 2;
    const hh = inH / 2;

    // Top-left red
    inner.fillStyle(0xe74c3c, 1);
    inner.fillRect(inX, inY, hw, hh);
    // Top-right yellow
    inner.fillStyle(0xf1c40f, 1);
    inner.fillRect(inX + hw, inY, hw, hh);
    // Bottom-left green
    inner.fillStyle(0x27ae60, 1);
    inner.fillRect(inX, inY + hh, hw, hh);
    // Bottom-right blue
    inner.fillStyle(0x2980b9, 1);
    inner.fillRect(inX + hw, inY + hh, hw, hh);

    // Round the corners by overlaying a mask-like border
    const roundMask = scene.add.graphics();
    roundMask.fillStyle(0xffffff, 1);
    roundMask.fillRoundedRect(-W / 2, -H / 2, W, H, R);
    // We'll just keep it clean with the quadrants slightly inset

    container.add(inner);
  } else {
    // ── Colored background ──
    const bg = scene.add.graphics();
    bg.fillStyle(fillColor, 1);
    bg.fillRoundedRect(-W / 2 + 3 * scale, -H / 2 + 3 * scale, W - 6 * scale, H - 6 * scale, R - 2);
    container.add(bg);
  }

  // ── White center oval (tilted slightly) ──
  const oval = scene.add.graphics();
  oval.fillStyle(0xffffff, 0.92);
  oval.fillEllipse(0, 0, W * 0.62, H * 0.48);
  oval.setAngle(-15);
  container.add(oval);

  // ── Center label ──
  const label = VALUE_LABELS[card.value] ?? card.value;
  const isBigLabel = label.length <= 2 && !isNaN(label);
  const fontSize = isBigLabel ? Math.round(36 * scale) : Math.round(22 * scale);
  const textColor = isWild ? '#1a1a2e' : COLOR_HEX_STR[card.color] || '#1a1a2e';
  const centerText = scene.add.text(0, 0, label, {
    fontFamily: 'Arial Black, Impact, sans-serif',
    fontSize: `${fontSize}px`,
    color: textColor,
    fontStyle: 'bold',
    stroke: '#ffffff',
    strokeThickness: isBigLabel ? 1 * scale : 0,
  }).setOrigin(0.5);
  container.add(centerText);

  // ── Top-left corner ──
  const cornerLabel = VALUE_LABELS[card.value] ?? card.value;
  const cornerSize = Math.round(13 * scale);
  const cTopLeft = scene.add.text(-W / 2 + 7 * scale, -H / 2 + 5 * scale, cornerLabel, {
    fontFamily: 'Arial, sans-serif',
    fontSize: `${cornerSize}px`,
    color: '#ffffff',
    fontStyle: 'bold',
    stroke: '#00000044',
    strokeThickness: 1,
  });
  container.add(cTopLeft);

  // ── Bottom-right corner (upside down) ──
  const cBottomRight = scene.add.text(W / 2 - 7 * scale, H / 2 - 5 * scale, cornerLabel, {
    fontFamily: 'Arial, sans-serif',
    fontSize: `${cornerSize}px`,
    color: '#ffffff',
    fontStyle: 'bold',
    stroke: '#00000044',
    strokeThickness: 1,
  }).setOrigin(0, 0).setAngle(180);
  container.add(cBottomRight);

  container.setSize(W, H);
  return container;
}

/**
 * Draw a UNO card back (black with red oval and yellow "UNO" text).
 */
export function drawCardBack(scene, x, y, scale = 1) {
  const W = 90 * scale;
  const H = 130 * scale;
  const R = 10 * scale;

  const container = scene.add.container(x, y);

  // White border
  const border = scene.add.graphics();
  border.fillStyle(0xffffff, 1);
  border.fillRoundedRect(-W / 2, -H / 2, W, H, R);
  container.add(border);

  // Black inner
  const bg = scene.add.graphics();
  bg.fillStyle(0x1a1a1a, 1);
  bg.fillRoundedRect(-W / 2 + 3 * scale, -H / 2 + 3 * scale, W - 6 * scale, H - 6 * scale, R - 2);
  container.add(bg);

  // Red oval
  const oval = scene.add.graphics();
  oval.fillStyle(0xcc0000, 1);
  oval.fillEllipse(0, 0, W * 0.65, H * 0.45);
  oval.setAngle(-15);
  container.add(oval);

  // "UNO" text
  const txt = scene.add.text(0, 0, 'UNO', {
    fontFamily: 'Arial Black, Impact, sans-serif',
    fontSize: `${Math.round(22 * scale)}px`,
    color: '#f1c40f',
    fontStyle: 'bold',
    stroke: '#000000',
    strokeThickness: 2 * scale,
  }).setOrigin(0.5).setAngle(-15);
  container.add(txt);

  container.setSize(W, H);
  return container;
}

/**
 * Get a hex int color for a given color name.
 */
export function getColorHex(colorName) {
  return COLOR_MAP[colorName] || 0x333333;
}

export { COLOR_MAP, COLOR_HEX_STR };
