// ─── Card Component ─────────────────────────────────────────────────────────
// Renders a single UNO card for the phone hand.

import React from 'react';

const COLOR_MAP = {
    red: '#e74c3c',
    yellow: '#f1c40f',
    green: '#2ecc71',
    blue: '#3498db',
    wild: '#8e44ad',
};

const VALUE_LABELS = {
    skip: '⊘',
    reverse: '⇄',
    draw2: '+2',
    wild: 'W',
    wild_draw4: '+4',
};

export default function Card({ card, playable, onPlay, disabled }) {
    const bgColor = COLOR_MAP[card.color] || '#555';
    const label = VALUE_LABELS[card.value] || card.value;
    const textColor = card.color === 'yellow' ? '#333' : '#fff';

    return (
        <div
            onClick={() => !disabled && playable && onPlay(card.id)}
            style={{
                width: 70,
                height: 100,
                borderRadius: 10,
                background: bgColor,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
                cursor: playable && !disabled ? 'pointer' : 'default',
                border: playable ? '3px solid #fff' : '3px solid transparent',
                boxShadow: playable
                    ? '0 0 12px rgba(255,255,255,0.4)'
                    : '0 2px 6px rgba(0,0,0,0.3)',
                opacity: disabled ? 0.4 : playable ? 1 : 0.6,
                transition: 'all 0.15s ease',
                transform: playable ? 'translateY(-6px)' : 'none',
                position: 'relative',
                userSelect: 'none',
                WebkitUserSelect: 'none',
            }}
        >
            {/* Corner label */}
            <span style={{
                position: 'absolute',
                top: 4,
                left: 6,
                fontSize: '11px',
                fontWeight: 'bold',
                color: textColor,
            }}>
                {label}
            </span>

            {/* Center */}
            <div style={{
                width: 44,
                height: 34,
                borderRadius: '50%',
                background: 'rgba(255,255,255,0.85)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
            }}>
                <span style={{
                    fontSize: card.value.length > 2 ? '14px' : '20px',
                    fontWeight: 'bold',
                    color: bgColor,
                }}>
                    {label}
                </span>
            </div>

            {/* Wild card rainbow stripe */}
            {card.color === 'wild' && (
                <div style={{
                    position: 'absolute',
                    bottom: 6,
                    display: 'flex',
                    gap: 2,
                }}>
                    {['#e74c3c', '#f1c40f', '#2ecc71', '#3498db'].map((c, i) => (
                        <div key={i} style={{
                            width: 8, height: 8, borderRadius: '50%', background: c,
                        }} />
                    ))}
                </div>
            )}
        </div>
    );
}

export { COLOR_MAP, VALUE_LABELS };
