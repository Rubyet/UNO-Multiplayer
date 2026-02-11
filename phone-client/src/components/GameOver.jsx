// ─── GameOver Component ─────────────────────────────────────────────────────
// Displays round-over or game-over results on the phone.

import React from 'react';

export default function GameOver({ data, playerId, isFinal, onNextRound }) {
    if (!data) return null;

    const scores = data.scores || [];
    const sorted = [...scores].sort((a, b) => b.score - a.score);
    const winnerName = sorted[0]?.name || 'Unknown';
    const isWinner = data.winnerId === playerId;
    const medals = ['🥇', '🥈', '🥉'];

    return (
        <div style={styles.container}>
            <div style={{ fontSize: '56px', marginBottom: 8 }}>
                {isFinal ? '🏆' : '🎉'}
            </div>

            <h1 style={styles.title}>
                {isFinal ? 'GAME OVER' : 'ROUND OVER'}
            </h1>

            <p style={{
                fontSize: '24px',
                color: isWinner ? '#f1c40f' : '#e0e0e0',
                fontWeight: 'bold',
                marginBottom: 8,
            }}>
                {isWinner ? 'YOU WON!' : `${winnerName} wins!`}
            </p>

            <p style={{ color: '#2ecc71', fontSize: '18px', marginBottom: 24 }}>
                +{data.roundScore} points this round
            </p>

            {/* Scoreboard */}
            <div style={styles.scoreboard}>
                <h3 style={{ color: '#f1c40f', marginBottom: 12 }}>
                    {isFinal ? 'Final Standings' : 'Scoreboard'}
                </h3>
                {sorted.map((s, i) => (
                    <div
                        key={s.id}
                        style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            padding: '8px 0',
                            borderBottom: '1px solid #333',
                            color: s.id === playerId ? '#f1c40f' : '#e0e0e0',
                            fontWeight: s.id === playerId ? 'bold' : 'normal',
                        }}
                    >
                        <span>{medals[i] || `${i + 1}.`} {s.name}</span>
                        <span>{s.score} pts</span>
                    </div>
                ))}
            </div>

            {!isFinal && onNextRound && (
                <p style={{ color: '#aaa', marginTop: 24, fontSize: '16px' }}>
                    ⏳ Waiting for host to start next round...
                </p>
            )}

            {isFinal && (
                <p style={{ color: '#aaa', marginTop: 24, fontSize: '16px' }}>
                    Thanks for playing! 🎴
                </p>
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
        padding: 24,
        textAlign: 'center',
        minHeight: '100vh',
    },
    title: {
        fontSize: '36px',
        fontWeight: 'bold',
        color: '#e94560',
        marginBottom: 12,
    },
    scoreboard: {
        width: '100%',
        maxWidth: 320,
        background: '#16213e',
        borderRadius: 12,
        padding: '16px 20px',
    },
};
