// ─── Lobby Component ────────────────────────────────────────────────────────
// Join room screen for the phone controller.

import React, { useState } from 'react';

export default function Lobby({ onJoin, joined, error, roomCode, playerName, players }) {
    const [name, setName] = useState('');
    const [code, setCode] = useState('');

    const handleSubmit = (e) => {
        e.preventDefault();
        if (name.trim() && code.trim()) {
            onJoin(name.trim(), code.trim().toUpperCase());
        }
    };

    if (joined) {
        return (
            <div style={styles.container}>
                <div style={styles.header}>
                    <span style={styles.logo}>🎴</span>
                    <h1 style={styles.title}>UNO</h1>
                </div>

                <div style={styles.joinedCard}>
                    <div style={styles.checkmark}>✓</div>
                    <h2 style={{ color: '#2ecc71', margin: '8px 0' }}>Joined!</h2>
                    <p style={{ color: '#aaa' }}>Room: <strong style={{ color: '#f1c40f' }}>{roomCode}</strong></p>
                    <p style={{ color: '#aaa' }}>Name: <strong style={{ color: '#e0e0e0' }}>{playerName}</strong></p>
                </div>

                <div style={styles.waitingBox}>
                    <p style={{ color: '#e0e0e0', marginBottom: 12, fontSize: '18px' }}>
                        🎮 Waiting for host to start...
                    </p>
                    <div style={{ color: '#aaa', fontSize: '14px' }}>
                        {players.map((p, i) => (
                            <div key={p.id || i} style={{ padding: '4px 0' }}>
                                {i + 1}. {p.name}
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div style={styles.container}>
            <div style={styles.header}>
                <span style={styles.logo}>🎴</span>
                <h1 style={styles.title}>UNO</h1>
                <p style={styles.subtitle}>Multiplayer</p>
            </div>

            <form onSubmit={handleSubmit} style={styles.form}>
                <input
                    type="text"
                    placeholder="Your Name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    maxLength={16}
                    style={styles.input}
                    autoComplete="off"
                />
                <input
                    type="text"
                    placeholder="Room Code"
                    value={code}
                    onChange={(e) => setCode(e.target.value.toUpperCase())}
                    maxLength={6}
                    style={{ ...styles.input, letterSpacing: '4px', textAlign: 'center' }}
                    autoComplete="off"
                />
                <button
                    type="submit"
                    disabled={!name.trim() || !code.trim()}
                    style={{
                        ...styles.joinBtn,
                        opacity: name.trim() && code.trim() ? 1 : 0.5,
                    }}
                >
                    JOIN GAME
                </button>
            </form>

            {error && (
                <div style={styles.error}>
                    ❌ {error}
                </div>
            )}
        </div>
    );
}

const styles = {
    container: {
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px',
        minHeight: '100vh',
    },
    header: {
        textAlign: 'center',
        marginBottom: 40,
    },
    logo: {
        fontSize: '64px',
        display: 'block',
        marginBottom: 8,
    },
    title: {
        fontSize: '48px',
        fontWeight: 'bold',
        color: '#e94560',
        margin: 0,
        letterSpacing: '8px',
    },
    subtitle: {
        color: '#aaa',
        fontSize: '16px',
        marginTop: 4,
    },
    form: {
        display: 'flex',
        flexDirection: 'column',
        gap: 14,
        width: '100%',
        maxWidth: 320,
    },
    input: {
        padding: '14px 16px',
        fontSize: '18px',
        borderRadius: 12,
        border: '2px solid #333',
        background: '#16213e',
        color: '#e0e0e0',
        outline: 'none',
        transition: 'border-color 0.2s',
    },
    joinBtn: {
        padding: '16px',
        fontSize: '20px',
        fontWeight: 'bold',
        borderRadius: 12,
        border: 'none',
        background: '#e94560',
        color: '#fff',
        cursor: 'pointer',
        marginTop: 8,
        transition: 'all 0.2s',
    },
    error: {
        marginTop: 16,
        padding: '10px 20px',
        background: '#c0392b33',
        border: '1px solid #e74c3c',
        borderRadius: 8,
        color: '#e74c3c',
        fontSize: '14px',
    },
    joinedCard: {
        textAlign: 'center',
        background: '#16213e',
        padding: '24px 32px',
        borderRadius: 16,
        marginBottom: 24,
        border: '2px solid #2ecc71',
    },
    checkmark: {
        width: 50,
        height: 50,
        borderRadius: '50%',
        background: '#2ecc71',
        color: '#fff',
        fontSize: '28px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        margin: '0 auto 8px',
        fontWeight: 'bold',
    },
    waitingBox: {
        textAlign: 'center',
        padding: 20,
    },
};
