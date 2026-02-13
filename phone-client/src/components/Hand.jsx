// ─── Hand Component ─────────────────────────────────────────────────────────
// Horizontally scrollable card hand with card reveal animation for the phone.

import React, { useMemo, useState, useEffect, useRef } from 'react';
import Card from './Card.jsx';

/**
 * Check if a card can be legally played (client-side preview only).
 */
function isPlayable(card, currentColor, topCard, drawStack) {
  if (!topCard) return false;
  // If +2 or +4 stack is active, only matching type is playable
  if (drawStack > 0) {
    if (topCard.value === 'draw2' && card.value !== 'draw2') return false;
    if (topCard.value === 'wild_draw4' && card.value !== 'wild_draw4') return false;
  }
  if (card.color === 'wild') return true;
  if (card.color === currentColor) return true;
  if (card.value === topCard.value) return true;
  return false;
}

export default function Hand({ cards, isMyTurn, currentColor, topCard, onPlay, drawStack = 0 }) {
  const [revealedCount, setRevealedCount] = useState(cards.length);
  const prevLengthRef = useRef(cards.length);
  const scrollRef = useRef(null);

  // Card reveal animation: when new cards arrive, reveal them one by one
  useEffect(() => {
    const prevLen = prevLengthRef.current;
    const newLen = cards.length;
    prevLengthRef.current = newLen;

    if (newLen > prevLen) {
      // New cards — animate revealing one by one
      setRevealedCount(prevLen);
      let count = prevLen;
      // Faster for initial deal (1000ms), slower for draws (1500ms)
      const delay = prevLen === 0 ? 1000 : 1500;
      const interval = setInterval(() => {
        count++;
        setRevealedCount(count);
        if (count >= newLen) clearInterval(interval);
      }, delay);
      return () => clearInterval(interval);
    } else {
      setRevealedCount(newLen);
    }
  }, [cards.length]);

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
    <div
      ref={scrollRef}
      style={{
        flex: 1,
        overflowX: 'auto',
        overflowY: 'hidden',
        padding: '16px 12px',
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        WebkitOverflowScrolling: 'touch',
        scrollbarWidth: 'none',
      }}
    >
      {sorted.map((card, i) => {
        const playable = isMyTurn && isPlayable(card, currentColor, topCard, drawStack);
        const revealed = i < revealedCount;

        return (
          <div
            key={card.id}
            style={{
              transition: 'opacity 0.2s ease, transform 0.25s ease',
              opacity: revealed ? 1 : 0,
              transform: revealed ? 'translateY(0) scale(1)' : 'translateY(30px) scale(0.8)',
            }}
          >
            <Card
              card={card}
              playable={playable}
              disabled={!isMyTurn}
              onPlay={onPlay}
            />
          </div>
        );
      })}

      {cards.length === 0 && (
        <div style={{
          flex: 1, textAlign: 'center', color: '#666',
          fontSize: '18px', padding: 40,
        }}>
          No cards — you win! 🎉
        </div>
      )}

      <style>{`div::-webkit-scrollbar { display: none; }`}</style>
    </div>
  );
}
