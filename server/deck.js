// ─── UNO Deck Module ───────────────────────────────────────────────────────
// Builds and manages the standard 108-card UNO deck.

const { v4: uuidv4 } = require('uuid');

const COLORS = ['red', 'yellow', 'green', 'blue'];
const VALUES = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', 'skip', 'reverse', 'draw2'];

/**
 * Build the standard 108-card UNO deck.
 * - One 0 per color, two of every other number/action per color = 76 colored cards
 * - 4 Wild + 4 Wild Draw Four = 8 wild cards
 * Total = 108
 */
function buildDeck() {
    const deck = [];

    for (const color of COLORS) {
        // One zero per color
        deck.push({ id: uuidv4(), color, value: '0' });

        // Two of each 1–9, skip, reverse, draw2
        for (const value of VALUES) {
            if (value === '0') continue;
            deck.push({ id: uuidv4(), color, value });
            deck.push({ id: uuidv4(), color, value });
        }
    }

    // 4 Wilds
    for (let i = 0; i < 4; i++) {
        deck.push({ id: uuidv4(), color: 'wild', value: 'wild' });
    }

    // 4 Wild Draw Fours
    for (let i = 0; i < 4; i++) {
        deck.push({ id: uuidv4(), color: 'wild', value: 'wild_draw4' });
    }

    return deck;
}

/**
 * Fisher–Yates shuffle (in-place, returns same array).
 */
function shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
}

/**
 * Create a shuffled deck ready to play.
 */
function createShuffledDeck() {
    return shuffle(buildDeck());
}

module.exports = { buildDeck, shuffle, createShuffledDeck, COLORS, VALUES };
