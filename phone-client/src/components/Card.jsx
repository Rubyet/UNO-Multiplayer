// ─── Card Component ─────────────────────────────────────────────────────────
// Renders a single UNO card with authentic UNO styling for the phone hand.

import React from 'react';

const COLOR_MAP = {
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

export default function Card({ card, playable, onPlay, disabled, style: extraStyle }) {
  const bgColor = COLOR_MAP[card.color] || '#555';
  const label = VALUE_LABELS[card.value] ?? card.value;
  const isWild = card.color === 'wild';
  const isNumber = !isNaN(label) && label.length <= 2;

  return (
    <div
      onClick={() => !disabled && playable && onPlay(card.id)}
      style={{
        width: 72,
        height: 104,
        borderRadius: 10,
        background: '#fff',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
        cursor: playable && !disabled ? 'pointer' : 'default',
        border: playable ? '3px solid #fff' : '3px solid rgba(255,255,255,0.15)',
        boxShadow: playable
          ? '0 0 14px rgba(255,255,255,0.5), 0 4px 12px rgba(0,0,0,0.4)'
          : '0 2px 8px rgba(0,0,0,0.4)',
        opacity: disabled ? 0.45 : playable ? 1 : 0.65,
        transition: 'all 0.15s ease',
        transform: playable ? 'translateY(-8px) scale(1.02)' : 'none',
        position: 'relative',
        userSelect: 'none',
        WebkitUserSelect: 'none',
        overflow: 'hidden',
        ...extraStyle,
      }}
    >
      {/* Inner colored fill */}
      {isWild ? (
        // 4-color quadrant for wild cards
        <div style={{
          position: 'absolute', inset: 3, borderRadius: 7, overflow: 'hidden',
          display: 'grid', gridTemplateColumns: '1fr 1fr', gridTemplateRows: '1fr 1fr',
        }}>
          <div style={{ background: '#e74c3c' }} />
          <div style={{ background: '#f1c40f' }} />
          <div style={{ background: '#27ae60' }} />
          <div style={{ background: '#2980b9' }} />
        </div>
      ) : (
        <div style={{
          position: 'absolute', inset: 3, borderRadius: 7,
          background: bgColor,
        }} />
      )}

      {/* White center oval */}
      <div style={{
        position: 'relative',
        width: 46,
        height: 36,
        borderRadius: '50%',
        background: 'rgba(255,255,255,0.9)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        transform: 'rotate(-12deg)',
        zIndex: 2,
      }}>
        <span style={{
          fontSize: isNumber ? '22px' : '16px',
          fontWeight: 900,
          color: isWild ? '#1a1a2e' : bgColor,
          transform: 'rotate(12deg)',
          textShadow: '0 1px 0 rgba(255,255,255,0.3)',
        }}>
          {label}
        </span>
      </div>

      {/* Top-left corner */}
      <span style={{
        position: 'absolute', top: 5, left: 7,
        fontSize: '11px', fontWeight: 'bold',
        color: '#fff', zIndex: 3,
        textShadow: '0 1px 2px rgba(0,0,0,0.5)',
      }}>
        {label}
      </span>

      {/* Bottom-right corner */}
      <span style={{
        position: 'absolute', bottom: 5, right: 7,
        fontSize: '11px', fontWeight: 'bold',
        color: '#fff', zIndex: 3,
        transform: 'rotate(180deg)',
        textShadow: '0 1px 2px rgba(0,0,0,0.5)',
      }}>
        {label}
      </span>
    </div>
  );
}

export { COLOR_MAP, VALUE_LABELS };
