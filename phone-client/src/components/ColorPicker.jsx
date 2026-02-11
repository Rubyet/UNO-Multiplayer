// ─── ColorPicker Component ──────────────────────────────────────────────────
// Modal overlay for choosing a color after playing a wild card.

import React from 'react';

const colors = [
    { name: 'red', hex: '#e74c3c', emoji: '🔴' },
    { name: 'yellow', hex: '#f1c40f', emoji: '🟡' },
    { name: 'green', hex: '#2ecc71', emoji: '🟢' },
    { name: 'blue', hex: '#3498db', emoji: '🔵' },
];

export default function ColorPicker({ onChoose }) {
    return (
        <div style={styles.overlay}>
            <div style={styles.modal}>
                <h2 style={styles.title}>Choose a Color</h2>
                <div style={styles.grid}>
                    {colors.map((c) => (
                        <button
                            key={c.name}
                            onClick={() => onChoose(c.name)}
                            style={{
                                ...styles.colorBtn,
                                background: c.hex,
                                color: c.name === 'yellow' ? '#333' : '#fff',
                            }}
                        >
                            <span style={{ fontSize: '36px' }}>{c.emoji}</span>
                            <span style={{ fontSize: '16px', fontWeight: 'bold', textTransform: 'uppercase' }}>
                                {c.name}
                            </span>
                        </button>
                    ))}
                </div>
            </div>
        </div>
    );
}

const styles = {
    overlay: {
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.8)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 200,
        padding: 20,
    },
    modal: {
        background: '#16213e',
        borderRadius: 20,
        padding: '28px 24px',
        width: '100%',
        maxWidth: 340,
        textAlign: 'center',
    },
    title: {
        color: '#f1c40f',
        fontSize: '24px',
        marginBottom: 20,
        fontWeight: 'bold',
    },
    grid: {
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: 14,
    },
    colorBtn: {
        padding: '20px 10px',
        borderRadius: 16,
        border: 'none',
        cursor: 'pointer',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 8,
        transition: 'transform 0.15s',
        boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
    },
};
