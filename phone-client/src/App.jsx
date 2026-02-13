// ─── App.jsx ────────────────────────────────────────────────────────────────
// Root component: manages screen routing, socket communication, fullscreen,
// +2 stacking display, UNO at 2 cards, and UNO penalty handling.

import React, { useState, useEffect, useCallback, useRef } from 'react';
import socket from './socket.js';
import Lobby from './components/Lobby.jsx';
import Hand from './components/Hand.jsx';
import ColorPicker from './components/ColorPicker.jsx';
import GameOver from './components/GameOver.jsx';
import winSfxUrl from './resources/sound_effects/win.mp3';
import loseSfxUrl from './resources/sound_effects/lose.mp3';

const winAudio = new Audio(winSfxUrl);
const loseAudio = new Audio(loseSfxUrl);
winAudio.preload = 'auto';
loseAudio.preload = 'auto';
function playSfx(audio) {
  const clone = audio.cloneNode();
  clone.play().catch(() => {});
}

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
  const playerIdRef = useRef(playerId);
  const [playerName, setPlayerName] = useState('');
  const [roomCode, setRoomCode] = useState('');
  const [joined, setJoined] = useState(false);
  const [error, setError] = useState('');

  // Game state
  const [hand, setHand] = useState([]);
  const [isMyTurn, setIsMyTurn] = useState(false);
  const [phase, setPhase] = useState('lobby');
  const [currentColor, setCurrentColor] = useState(null);
  const [topCard, setTopCard] = useState(null);
  const [players, setPlayers] = useState([]);
  const [message, setMessage] = useState('');
  const [drawStack, setDrawStack] = useState(0);

  // Round/game over data
  const [resultData, setResultData] = useState(null);

  // Challenge state
  const [challengeInfo, setChallengeInfo] = useState(null);

  // Fullscreen state
  const [isFullscreen, setIsFullscreen] = useState(false);
  const containerRef = useRef(null);

  // ── Fullscreen API (with iOS/Safari fallback) ──
  const toggleFullscreen = useCallback(() => {
    const el = containerRef.current || document.documentElement;
    if (!document.fullscreenElement && !document.webkitFullscreenElement) {
      if (el.requestFullscreen) {
        el.requestFullscreen().catch(() => {});
      } else if (el.webkitRequestFullscreen) {
        el.webkitRequestFullscreen(); // Safari
      } else {
        // iOS Safari fallback — scroll to hide address bar
        window.scrollTo(0, 1);
      }
      setIsFullscreen(true);
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen().catch(() => {});
      } else if (document.webkitExitFullscreen) {
        document.webkitExitFullscreen();
      }
      setIsFullscreen(false);
    }
  }, []);

  useEffect(() => {
    const onChange = () => setIsFullscreen(!!(document.fullscreenElement || document.webkitFullscreenElement));
    document.addEventListener('fullscreenchange', onChange);
    document.addEventListener('webkitfullscreenchange', onChange);
    return () => {
      document.removeEventListener('fullscreenchange', onChange);
      document.removeEventListener('webkitfullscreenchange', onChange);
    };
  }, []);

  // Keep playerIdRef in sync
  useEffect(() => { playerIdRef.current = playerId; }, [playerId]);

  // ── Socket listeners ──
  useEffect(() => {
    socket.on('hand_update', (data) => {
      setHand(data.hand || []);
      setIsMyTurn(data.isCurrentTurn);
      setPhase(data.phase);
      setCurrentColor(data.currentColor);
      setTopCard(data.topCard);
      setDrawStack(data.drawStack || 0);
    });

    socket.on('state_update', (data) => {
      setPlayers(data.players || []);
      setCurrentColor(data.currentColor);
      setPhase(data.phase);
      setDrawStack(data.drawStack || 0);
      if (playerIdRef.current) setIsMyTurn(data.currentPlayerId === playerIdRef.current);
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
      if (data.playerId === playerIdRef.current) setScreen(SCREENS.COLOR_PICK);
    });

    socket.on('challenge_available', (data) => {
      setChallengeInfo(data);
      setScreen(SCREENS.CHALLENGE);
    });

    socket.on('challenge_result', (data) => {
      const msg = data.effect === 'challenge_success'
        ? `Challenge succeeded! ${data.drewPlayer === playerIdRef.current ? 'You draw' : 'Offender draws'} ${data.drew}`
        : data.effect === 'challenge_fail'
          ? `Challenge failed! ${data.drewPlayer === playerIdRef.current ? 'You draw' : 'Challenger draws'} ${data.drew}`
          : `Challenge declined. ${data.drew} cards drawn.`;
      setMessage(msg);
      setScreen(SCREENS.GAME);
      setTimeout(() => setMessage(''), 4000);
    });

    socket.on('uno_event', (data) => {
      if (data.effect === 'uno_said') {
        setMessage(`${data.playerName}: UNO! 🎉`);
      }
      setTimeout(() => setMessage(''), 3000);
    });

    socket.on('uno_penalty', (data) => {
      if (data.playerId === playerIdRef.current) {
        setMessage('UNO Penalty! +1 card 😬');
      } else {
        setMessage('UNO Penalty! +1 card');
      }
      setTimeout(() => setMessage(''), 3000);
    });

    socket.on('card_effect', (effect) => {
      if (effect.type === 'skip' && effect.skippedId === playerIdRef.current) {
        setMessage('You were skipped! ⊘');
        setTimeout(() => setMessage(''), 2000);
      }
    });

    socket.on('round_over', (data) => {
      if (data.winnerId === playerIdRef.current) playSfx(winAudio);
      else playSfx(loseAudio);
      setResultData(data);
      setScreen(SCREENS.ROUND_OVER);
    });

    socket.on('game_over', (data) => {
      if (data.winnerId === playerIdRef.current) playSfx(winAudio);
      else playSfx(loseAudio);
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
      socket.off('uno_penalty');
      socket.off('card_effect');
      socket.off('round_over');
      socket.off('game_over');
    };
  }, []);

  // ── Actions ──
  const joinRoom = useCallback((name, code) => {
    setError('');
    socket.emit('join_room', {
      roomCode: code,
      playerName: name,
      playerId: playerId,
    }, (res) => {
      if (res.ok) {
        setPlayerId(res.playerId);
        setRoomCode(res.roomCode);
        setPlayerName(name);
        setJoined(true);
        localStorage.setItem('uno_playerId', res.playerId);
        // If game in progress (reconnecting), go directly to game
        if (res.gameInProgress) {
          setScreen(SCREENS.GAME);
        }
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
      } else if (res.drawCount > 1) {
        setMessage(`Drew ${res.drawCount} cards!`);
        setTimeout(() => setMessage(''), 2000);
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

  // ── Render ──
  const containerStyle = {
    minHeight: '100vh',
    display: 'flex',
    flexDirection: 'column',
    background: '#1a1a2e',
  };

  if (screen === SCREENS.LOBBY) {
    return (
      <div ref={containerRef} style={containerStyle}>
        <Lobby
          onJoin={joinRoom} joined={joined} error={error}
          roomCode={roomCode} playerName={playerName} players={players}
        />
      </div>
    );
  }

  if (screen === SCREENS.COLOR_PICK) {
    return (
      <div ref={containerRef} style={containerStyle}>
        <ColorPicker onChoose={chooseColor} />
      </div>
    );
  }

  if (screen === SCREENS.CHALLENGE) {
    return (
      <div ref={containerRef} style={containerStyle}>
        <ChallengeScreen info={challengeInfo} onRespond={respondChallenge} />
      </div>
    );
  }

  if (screen === SCREENS.ROUND_OVER) {
    return (
      <div ref={containerRef} style={containerStyle}>
        <GameOver
          data={resultData} playerId={playerId}
          isFinal={false} onNextRound={() => setScreen(SCREENS.GAME)}
        />
      </div>
    );
  }

  if (screen === SCREENS.GAME_OVER) {
    return (
      <div ref={containerRef} style={containerStyle}>
        <GameOver data={resultData} playerId={playerId} isFinal={true} />
      </div>
    );
  }

  // ── GAME SCREEN ──
  return (
    <div ref={containerRef} style={containerStyle}>
      {/* Status bar */}
      <StatusBar
        currentColor={currentColor}
        isMyTurn={isMyTurn}
        topCard={topCard}
        message={message}
        hand={hand}
        drawStack={drawStack}
        isFullscreen={isFullscreen}
        onToggleFullscreen={toggleFullscreen}
      />

      {/* Hand */}
      <Hand
        cards={hand}
        isMyTurn={isMyTurn}
        currentColor={currentColor}
        topCard={topCard}
        onPlay={playCard}
        drawStack={drawStack}
      />

      {/* Action buttons */}
      <ActionBar
        isMyTurn={isMyTurn}
        handLength={hand.length}
        onDraw={drawCard}
        onUno={sayUno}
        phase={phase}
        drawStack={drawStack}
      />
    </div>
  );
}

// ─── Sub-components ─────────────────────────────────────────────────────────

function StatusBar({ currentColor, isMyTurn, message, hand, drawStack, isFullscreen, onToggleFullscreen }) {
  const colorMap = { red: '#e74c3c', yellow: '#f1c40f', green: '#27ae60', blue: '#2980b9' };
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

      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        {drawStack > 0 && (
          <span style={{
            background: '#e74c3c', color: '#fff', padding: '2px 10px',
            borderRadius: 8, fontSize: '14px', fontWeight: 'bold',
            animation: 'pulse 0.6s infinite alternate',
          }}>
            +{drawStack} STACKED
          </span>
        )}
        <span style={{ fontSize: '14px', color: '#fff' }}>🃏 {hand.length}</span>
        <button
          onClick={onToggleFullscreen}
          style={{
            background: 'rgba(255,255,255,0.2)', border: 'none', borderRadius: 6,
            color: '#fff', fontSize: '16px', padding: '4px 8px', cursor: 'pointer',
          }}
        >
          {isFullscreen ? '⏏' : '⛶'}
        </button>
      </div>

      {message && (
        <div style={{
          position: 'fixed', top: 60, left: '50%', transform: 'translateX(-50%)',
          background: '#e94560', color: '#fff', padding: '8px 20px', borderRadius: 8,
          fontSize: '15px', fontWeight: 'bold', zIndex: 100,
          animation: 'fadeIn 0.3s ease',
          maxWidth: '90vw', textAlign: 'center',
        }}>
          {message}
        </div>
      )}
    </div>
  );
}

function ActionBar({ isMyTurn, handLength, onDraw, onUno, phase, drawStack }) {
  const canDraw = isMyTurn && phase === 'playing';
  // UNO button active at 2 cards (must press before playing to go to 1)
  const canUno = handLength === 2;
  const showUno = handLength <= 2;

  return (
    <div style={{
      display: 'flex', gap: 12, padding: '12px 16px',
      justifyContent: 'center', flexShrink: 0,
      background: '#0b1e3d',
    }}>
      <button
        onClick={onDraw}
        disabled={!canDraw}
        style={{
          flex: 1, maxWidth: 200, padding: '14px 0',
          fontSize: '18px', fontWeight: 'bold', borderRadius: 12,
          border: 'none',
          background: canDraw ? '#2980b9' : '#2c3e50',
          color: canDraw ? '#fff' : '#666',
          cursor: canDraw ? 'pointer' : 'not-allowed',
          transition: 'all 0.2s',
        }}
      >
        {drawStack > 0 && canDraw ? `📥 DRAW ${drawStack}` : '📥 DRAW'}
      </button>

      <button
        onClick={onUno}
        style={{
          flex: 1, maxWidth: 200, padding: '14px 0',
          fontSize: '18px', fontWeight: 'bold', borderRadius: 12,
          border: 'none',
          background: canUno ? '#e94560' : showUno ? '#e67e22' : '#2c3e50',
          color: showUno ? '#fff' : '#666',
          cursor: 'pointer',
          transition: 'all 0.2s',
          animation: canUno ? 'pulse 0.5s infinite alternate' : 'none',
          boxShadow: canUno ? '0 0 16px rgba(233,69,96,0.5)' : 'none',
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
      flex: 1, display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      padding: 24, textAlign: 'center',
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
            padding: '16px 32px', fontSize: '20px', fontWeight: 'bold',
            borderRadius: 12, border: 'none', background: '#e94560',
            color: '#fff', cursor: 'pointer',
          }}
        >
          ⚔️ CHALLENGE
        </button>
        <button
          onClick={() => onRespond(false)}
          style={{
            padding: '16px 32px', fontSize: '20px', fontWeight: 'bold',
            borderRadius: 12, border: 'none', background: '#2c3e50',
            color: '#e0e0e0', cursor: 'pointer',
          }}
        >
          😔 ACCEPT (+4)
        </button>
      </div>
    </div>
  );
}
