// ─── Utility helpers ────────────────────────────────────────────────────────

/**
 * Generate a short uppercase room code (e.g. "A3F8").
 */
function generateRoomCode(length = 4) {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no ambiguous chars
    let code = '';
    for (let i = 0; i < length; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
}

/**
 * Card point value for scoring.
 */
function cardPoints(card) {
    const num = parseInt(card.value, 10);
    if (!isNaN(num)) return num;                          // 0-9
    if (['skip', 'reverse', 'draw2'].includes(card.value)) return 20;
    if (['wild', 'wild_draw4'].includes(card.value)) return 50;
    return 0;
}

/**
 * Calculate a player's hand score.
 */
function scoreHand(hand) {
    return hand.reduce((sum, c) => sum + cardPoints(c), 0);
}

/**
 * Deep-clone a plain object (no functions/dates).
 */
function deepClone(obj) {
    return JSON.parse(JSON.stringify(obj));
}

module.exports = { generateRoomCode, cardPoints, scoreHand, deepClone };
