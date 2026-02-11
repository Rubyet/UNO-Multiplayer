# 🎴 UNO Multiplayer

Real-time multiplayer UNO game with a TV display (Phaser 3) and phone controllers (React).

## Architecture

```
┌──────────────┐        ┌──────────────────┐        ┌──────────────┐
│  TV Display  │◄──────►│   Node.js Server │◄──────►│   Phone 1    │
│  (Phaser 3)  │ ws     │   (Authoritative)│ ws     │   (React)    │
│  Port 5173   │        │   Port 3000      │        │   Port 5174  │
└──────────────┘        └──────────────────┘        └──────────────┘
                                                     ┌──────────────┐
                                                     │   Phone 2    │
                                                     │   (React)    │
                                                     └──────────────┘
                                                          ...
                                                     (up to 10 players)
```

## Quick Start (Local Development)

### Prerequisites
- Node.js 18+ installed
- All devices on the **same WiFi network**

### 1. Start the Server

```bash
cd server
npm install
npm run dev
```

Server starts on **port 3000**.

### 2. Start the TV Client

```bash
cd tv-client
npm install
npm run dev
```

TV display available at **http://localhost:5173**

### 3. Start the Phone Client

```bash
cd phone-client
npm install
npm run dev
```

Phone controller available at **http://localhost:5174**

### 4. Find Your Local IP

**Windows:**
```powershell
ipconfig
# Look for "IPv4 Address" under your WiFi adapter
```

**Mac/Linux:**
```bash
ifconfig | grep "inet "
# or
ip addr show | grep "inet "
```

### 5. Connect Devices

| Device | URL |
|--------|-----|
| **TV** (laptop/desktop browser) | `http://<LOCAL_IP>:5173` |
| **Phone** (mobile browser) | `http://<LOCAL_IP>:5174` |

### 6. Play!

1. The TV screen creates a room automatically → displays a **4-letter room code**
2. Each player opens the phone URL and enters the room code + their name
3. When all players have joined, press **START GAME** on the TV
4. Players take turns playing cards from their phones
5. First player to empty their hand wins the round
6. First player to reach 500 points wins the game!

## Game Rules

Official classic UNO rules:

- **7 cards** dealt to each player
- **108-card deck** (standard UNO deck)
- Match by **color**, **value**, or play a **wild**
- **No stacking** (can't chain +2 / +4 cards)
- **One card per turn**
- **Wild Draw Four** — can be challenged if played illegally
- **Reverse** = Skip in 2-player mode
- **UNO call** — must say UNO when down to 1 card (2-second window)
- **Penalty** for not calling UNO: draw 2 cards
- **Deck reshuffles** when draw pile is empty

### Scoring (per round)

| Card | Points |
|------|--------|
| Number cards (0–9) | Face value |
| Skip / Reverse / +2 | 20 points |
| Wild / Wild Draw Four | 50 points |

Winner of each round scores the sum of all other players' remaining cards.
**First to 500 points wins the game.**

## Project Structure

```
uno-multiplayer/
├── server/
│   ├── package.json
│   ├── index.js          # Express + Socket.IO entry point
│   ├── gameEngine.js     # Authoritative game state machine
│   ├── roomManager.js    # Multi-room management
│   ├── deck.js           # 108-card deck builder
│   └── utils.js          # Helpers (scoring, room codes)
│
├── tv-client/
│   ├── package.json
│   ├── vite.config.js
│   ├── index.html
│   └── src/
│       ├── main.js       # Phaser 3 config
│       ├── socket.js     # Socket.IO client
│       ├── CardGraphics.js
│       └── scenes/
│           ├── LobbyScene.js
│           ├── GameScene.js
│           ├── RoundOverScene.js
│           └── GameOverScene.js
│
├── phone-client/
│   ├── package.json
│   ├── vite.config.js
│   ├── index.html
│   └── src/
│       ├── main.jsx
│       ├── socket.js
│       ├── App.jsx
│       └── components/
│           ├── Lobby.jsx
│           ├── Hand.jsx
│           ├── Card.jsx
│           ├── ColorPicker.jsx
│           └── GameOver.jsx
│
└── README.md
```

## Socket Events

### Client → Server

| Event | Source | Payload |
|-------|--------|---------|
| `create_room` | TV | — |
| `start_game` | TV | — |
| `join_room` | Phone | `{ roomCode, playerName, playerId? }` |
| `play_card` | Phone | `{ cardId }` |
| `draw_card` | Phone | — |
| `say_uno` | Phone | — |
| `choose_color` | Phone | `{ color }` |
| `challenge_wild` | Phone | `{ doChallenge: boolean }` |
| `next_round` | TV | — |

### Server → Client

| Event | Target | Description |
|-------|--------|-------------|
| `room_created` | TV | Room code |
| `player_joined` | Room | Player list update |
| `game_started` | Room | First card + effects |
| `state_update` | Room | Public game state |
| `hand_update` | Player | Private hand |
| `invalid_move` | Player | Rejection reason |
| `color_selection_required` | Player | Wild card color prompt |
| `challenge_available` | Player | +4 challenge prompt |
| `challenge_result` | Room | Challenge outcome |
| `card_effect` | Room | Animation triggers |
| `uno_event` | Room | UNO call / catch |
| `round_over` | Room | Round results |
| `game_over` | Room | Final results |

## Security

- Server is **fully authoritative** — validates every move
- Clients never see other players' hands
- Turn lock prevents duplicate actions
- Wild Draw 4 legality enforced via challenge system
- 120-second reconnection grace period
