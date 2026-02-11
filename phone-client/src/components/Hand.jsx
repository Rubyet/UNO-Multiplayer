// ─── Hand Component ─────────────────────────────────────────────────────────
// Horizontally scrollable card hand for the phone player.

import React, { useMemo } from 'react';
import Card from './Card.jsx';

/**
 * Determine if a card can be legally played.
 * Note: this is for UI highlighting ONLY — the server still validates.
 */
function isPlayable(card, currentColor, topCard) {
    if (!topCard) return false;
    if (card.color === 'wild') return true;
    if (card.color === currentColor) return true;
    if (card.value === topCard.value) return true;
    return false;
}

export default function Hand({ cards, isMyTurn, currentColor, topCard, onPlay }) {
    // Sort hand: group by color, then by value
    const sorted = useMemo(() => {
        const colorOrder = { red: 0, yellow: 1, green: 2, blue: 3, wild: 4 };
        return [...cards].sort((a, b) => {
            const cA = colorOrder[a.color] ?? 5;
            const cB = colorOrder[b.color] ?? 5;
            if (cA !== cB) return cA - cB;
            return (a.value || '').localeCompare(b.value || '');
        });
    }, [cards]);

    return (
        <div style={{
            flex: 1,
            overflowX: 'auto',
            overflowY: 'hidden',
            padding: '16px 12px',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            WebkitOverflowScrolling: 'touch',
            scrollbarWidth: 'none',
        }}>
            {sorted.map((card) => {
                const playable = isMyTurn && isPlayable(card, currentColor, topCard);
                return (
                    <Card
                        key={card.id}
                        card={card}
                        playable={playable}
                        disabled={!isMyTurn}
                        onPlay={onPlay}
                    />
                );
            })}

            {cards.length === 0 && (
                <div style={{
                    flex: 1,
                    textAlign: 'center',
                    color: '#666',
                    fontSize: '18px',
                    padding: 40,
                }}>
                    No cards — you win! 🎉
                </div>
            )}

            <style>{`
        div::-webkit-scrollbar { display: none; }
      `}</style>
        </div>
    );
}
