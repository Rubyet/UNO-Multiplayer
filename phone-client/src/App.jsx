// ─── App.jsx ────────────────────────────────────────────────────────────────
// Root component: manages screen routing and all socket communication.

import React, { useState, useEffect, useCallback } from 'react';
import socket from './socket.js';
import Lobby from './components/Lobby.jsx';
import Hand from './components/Hand.jsx';
import ColorPicker from './components/ColorPicker.jsx';
import GameOver from './components/GameOver.jsx';

const SCREENS = {
    LOBBY: 'lobby',
    GAME: 'game',
    COLOR_PICK: 'color_pick',
    CHALLENGE: 'challenge',
    ROUND_OVER: 'round_over',
    GAME_OVER: 'game_over',
};

export default function App() {
    const [screen, setScreen] = useState(SCREENS.LOBBY);
    const [playerId, setPlayerId] = useState(() => localStorage.getItem('uno_playerId'));
    const [playerName, setPlayerName] = useState('');
    const [roomCode, setRoomCode] = useState('');
    const [joined, setJoined] = useState(false);
    const [error, setError] = useState('');

    // Game state (private hand + public info)
    const [hand, setHand] = useState([]);
    const [isMyTurn, setIsMyTurn] = useState(false);
    const [phase, setPhase] = useState('lobby');
    const [currentColor, setCurrentColor] = useState(null);
    const [topCard, setTopCard] = useState(null);
    const [players, setPlayers] = useState([]);
    const [message, setMessage] = useState('');

    // Round/game over data
    const [resultData, setResultData] = useState(null);

    // Challenge state
    const [challengeInfo, setChallengeInfo] = useState(null);

    // ── Socket listeners ──────────────────────────────────────────────────
    useEffect(() => {
        socket.on('hand_update', (data) => {
            setHand(data.hand || []);
            setIsMyTurn(data.isCurrentTurn);
            setPhase(data.phase);
            setCurrentColor(data.currentColor);
            setTopCard(data.topCard);
        });

        socket.on('state_update', (data) => {
            setPlayers(data.players || []);
            setCurrentColor(data.currentColor);
            setPhase(data.phase);

            // Check if it's my turn
            if (playerId) {
                setIsMyTurn(data.currentPlayerId === playerId);
            }
        });

        socket.on('game_started', () => {
            setScreen(SCREENS.GAME);
            setMessage('');
        });

        socket.on('invalid_move', (data) => {
            setMessage(`❌ ${data.reason}`);
            setTimeout(() => setMessage(''), 3000);
        });

        socket.on('color_selection_required', (data) => {
            if (data.playerId === playerId) {
                setScreen(SCREENS.COLOR_PICK);
            }
        });

        socket.on('challenge_available', (data) => {
            setChallengeInfo(data);
            setScreen(SCREENS.CHALLENGE);
        });

        socket.on('challenge_result', (data) => {
            const msg = data.effect === 'challenge_success'
                ? `Challenge succeeded! ${data.drewPlayer === playerId ? 'You draw' : 'Offender draws'} ${data.drew}`
                : data.effect === 'challenge_fail'
                    ? `Challenge failed! ${data.drewPlayer === playerId ? 'You draw' : 'Challenger draws'} ${data.drew}`
                    : `Challenge declined. ${data.drew} cards drawn.`;
            setMessage(msg);
            setScreen(SCREENS.GAME);
            setTimeout(() => setMessage(''), 4000);
        });

        socket.on('uno_event', (data) => {
            if (data.effect === 'uno_said') {
                setMessage('UNO called! 🎉');
            } else if (data.effect === 'uno_catch') {
                const caught = data.caughtId === playerId;
                setMessage(caught ? 'You were caught! +2 penalty 😱' : 'Someone was caught! +2 penalty');
            }
            setTimeout(() => setMessage(''), 3000);
        });

        socket.on('card_effect', (effect) => {
            if (effect.type === 'skip' && effect.skippedId === playerId) {
                setMessage('You were skipped! ⊘');
                setTimeout(() => setMessage(''), 2000);
            }
        });

        socket.on('round_over', (data) => {
            setResultData(data);
            setScreen(SCREENS.ROUND_OVER);
        });

        socket.on('game_over', (data) => {
            setResultData(data);
            setScreen(SCREENS.GAME_OVER);
        });

        return () => {
            socket.off('hand_update');
            socket.off('state_update');
            socket.off('game_started');
            socket.off('invalid_move');
            socket.off('color_selection_required');
            socket.off('challenge_available');
            socket.off('challenge_result');
            socket.off('uno_event');
            socket.off('card_effect');
            socket.off('round_over');
            socket.off('game_over');
        };
    }, [playerId]);

    // ── Actions ───────────────────────────────────────────────────────────
    const joinRoom = useCallback((name, code) => {
        setError('');
        socket.emit('join_room', {
            roomCode: code,
            playerName: name,
            playerId: playerId, // may be null for fresh join
        }, (res) => {
            if (res.ok) {
                setPlayerId(res.playerId);
                setRoomCode(res.roomCode);
                setPlayerName(name);
                setJoined(true);
                localStorage.setItem('uno_playerId', res.playerId);
            } else {
                setError(res.reason || 'Failed to join');
            }
        });
    }, [playerId]);

    const playCard = useCallback((cardId) => {
        socket.emit('play_card', { cardId }, (res) => {
            if (!res.ok) {
                setMessage(`❌ ${res.reason}`);
                setTimeout(() => setMessage(''), 3000);
            }
        });
    }, []);

    const drawCard = useCallback(() => {
        socket.emit('draw_card', (res) => {
            if (!res.ok) {
                setMessage(`❌ ${res.reason}`);
                setTimeout(() => setMessage(''), 3000);
            }
        });
    }, []);

    const sayUno = useCallback(() => {
        socket.emit('say_uno', (res) => {
            if (!res.ok) {
                setMessage(res.reason || 'Cannot call UNO');
                setTimeout(() => setMessage(''), 2000);
            }
        });
    }, []);

    const chooseColor = useCallback((color) => {
        socket.emit('choose_color', { color }, (res) => {
            if (res.ok) setScreen(SCREENS.GAME);
        });
    }, []);

    const respondChallenge = useCallback((doChallenge) => {
        socket.emit('challenge_wild', { doChallenge }, () => {
            setScreen(SCREENS.GAME);
            setChallengeInfo(null);
        });
    }, []);

    // ── Render ────────────────────────────────────────────────────────────
    const containerStyle = {
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        background: '#1a1a2e',
    };

    if (screen === SCREENS.LOBBY) {
        return (
            <div style={containerStyle}>
                <Lobby
                    onJoin={joinRoom}
                    joined={joined}
                    error={error}
                    roomCode={roomCode}
                    playerName={playerName}
                    players={players}
                />
            </div>
        );
    }

    if (screen === SCREENS.COLOR_PICK) {
        return (
            <div style={containerStyle}>
                <ColorPicker onChoose={chooseColor} />
            </div>
        );
    }

    if (screen === SCREENS.CHALLENGE) {
        return (
            <div style={containerStyle}>
                <ChallengeScreen info={challengeInfo} onRespond={respondChallenge} />
            </div>
        );
    }

    if (screen === SCREENS.ROUND_OVER) {
        return (
            <div style={containerStyle}>
                <GameOver
                    data={resultData}
                    playerId={playerId}
                    isFinal={false}
                    onNextRound={() => setScreen(SCREENS.GAME)}
                />
            </div>
        );
    }

    if (screen === SCREENS.GAME_OVER) {
        return (
            <div style={containerStyle}>
                <GameOver data={resultData} playerId={playerId} isFinal={true} />
            </div>
        );
    }

    // ── GAME SCREEN ──
    return (
        <div style={containerStyle}>
            {/* Status bar */}
            <StatusBar
                currentColor={currentColor}
                isMyTurn={isMyTurn}
                topCard={topCard}
                message={message}
                hand={hand}
                playerId={playerId}
                players={players}
            />

            {/* Hand */}
            <Hand
                cards={hand}
                isMyTurn={isMyTurn}
                currentColor={currentColor}
                topCard={topCard}
                onPlay={playCard}
            />

            {/* Action buttons */}
            <ActionBar
                isMyTurn={isMyTurn}
                handLength={hand.length}
                onDraw={drawCard}
                onUno={sayUno}
                phase={phase}
            />
        </div>
    );
}

// ─── Sub-components ─────────────────────────────────────────────────────────

function StatusBar({ currentColor, isMyTurn, topCard, message, hand, playerId, players }) {
    const colorMap = {
        red: '#e74c3c', yellow: '#f1c40f', green: '#2ecc71', blue: '#3498db',
    };
    const bgColor = colorMap[currentColor] || '#333';

    return (
        <div style={{
            background: bgColor,
            padding: '10px 16px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            transition: 'background 0.4s',
            flexShrink: 0,
        }}>
            <div style={{ fontWeight: 'bold', fontSize: '16px', color: '#fff' }}>
                {isMyTurn ? '🎯 YOUR TURN' : '⏳ Waiting...'}
            </div>
            <div style={{ fontSize: '14px', color: '#fff' }}>
                🃏 {hand.length} cards
            </div>
            {message && (
                <div style={{
                    position: 'fixed', top: 60, left: '50%', transform: 'translateX(-50%)',
                    background: '#e94560', color: '#fff', padding: '8px 20px', borderRadius: 8,
                    fontSize: '16px', fontWeight: 'bold', zIndex: 100,
                    animation: 'fadeIn 0.3s ease',
                }}>
                    {message}
                </div>
            )}
        </div>
    );
}

function ActionBar({ isMyTurn, handLength, onDraw, onUno, phase }) {
    const canDraw = isMyTurn && phase === 'playing';
    const canUno = handLength <= 2; // Show UNO button when 1 or 2 cards (for catching)

    return (
        <div style={{
            display: 'flex',
            gap: 12,
            padding: '12px 16px',
            justifyContent: 'center',
            flexShrink: 0,
            background: '#0f3460',
        }}>
            <button
                onClick={onDraw}
                disabled={!canDraw}
                style={{
                    flex: 1,
                    maxWidth: 200,
                    padding: '14px 0',
                    fontSize: '18px',
                    fontWeight: 'bold',
                    borderRadius: 12,
                    border: 'none',
                    background: canDraw ? '#3498db' : '#2c3e50',
                    color: canDraw ? '#fff' : '#666',
                    cursor: canDraw ? 'pointer' : 'not-allowed',
                    transition: 'all 0.2s',
                }}
            >
                📥 DRAW
            </button>

            <button
                onClick={onUno}
                style={{
                    flex: 1,
                    maxWidth: 200,
                    padding: '14px 0',
                    fontSize: '18px',
                    fontWeight: 'bold',
                    borderRadius: 12,
                    border: 'none',
                    background: handLength === 1 ? '#e94560' : canUno ? '#e67e22' : '#2c3e50',
                    color: canUno ? '#fff' : '#666',
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                    animation: handLength === 1 ? 'pulse 0.6s infinite alternate' : 'none',
                }}
            >
                🔔 UNO!
            </button>

            <style>{`
        @keyframes pulse {
          from { transform: scale(1); box-shadow: 0 0 0 rgba(233,69,96,0); }
          to { transform: scale(1.05); box-shadow: 0 0 20px rgba(233,69,96,0.6); }
        }
        @keyframes fadeIn {
          from { opacity: 0; transform: translateX(-50%) translateY(-10px); }
          to { opacity: 1; transform: translateX(-50%) translateY(0); }
        }
      `}</style>
        </div>
    );
}

function ChallengeScreen({ info, onRespond }) {
    return (
        <div style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 24,
            textAlign: 'center',
        }}>
            <div style={{ fontSize: '48px', marginBottom: 20 }}>⚠️</div>
            <h2 style={{ color: '#f1c40f', marginBottom: 12, fontSize: '28px' }}>
                Wild Draw 4 Played!
            </h2>
            <p style={{ color: '#ccc', marginBottom: 30, fontSize: '18px', lineHeight: 1.5 }}>
                The previous player played a Wild Draw 4.<br />
                Do you believe it was played illegally?
            </p>

            <div style={{ display: 'flex', gap: 16 }}>
                <button
                    onClick={() => onRespond(true)}
                    style={{
                        padding: '16px 32px',
                        fontSize: '20px',
                        fontWeight: 'bold',
                        borderRadius: 12,
                        border: 'none',
                        background: '#e94560',
                        color: '#fff',
                        cursor: 'pointer',
                    }}
                >
                    ⚔️ CHALLENGE
                </button>
                <button
                    onClick={() => onRespond(false)}
                    style={{
                        padding: '16px 32px',
                        fontSize: '20px',
                        fontWeight: 'bold',
                        borderRadius: 12,
                        border: 'none',
                        background: '#2c3e50',
                        color: '#e0e0e0',
                        cursor: 'pointer',
                    }}
                >
                    😔 ACCEPT (+4)
                </button>
            </div>
        </div>
    );
}
