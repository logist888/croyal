# Architecture

## Monorepo
npm workspaces with three packages:

- **`@croyal/shared`** — pure TypeScript shared by both sides: constants, card
  catalog, validation rules, domain types, and the WebSocket protocol. Imported as
  source (no build step needed for dev) so client and server can never disagree on
  the contract.
- **`@croyal/server`** — Express REST API + `ws` WebSocket server, the authoritative
  battle/boss simulations, matchmaking, and the data store.
- **`@croyal/client`** — Phaser 3 + Vite Telegram Mini App.

## Authority model (anti-cheat)
The **server is authoritative**. Clients send *intents* only:

```
client → server:  "deploy card X at (x, y)"
server:           validates elixir, hand membership, deploy zone; mutates state
server → client:  full state snapshots (10/s)
client:           renders snapshots; never decides truth
```

The client cannot fabricate elixir, units, or outcomes — every deploy is
re-validated server-side (`Simulation.deploy`). Position legality, card cost, and
hand membership are all checked on the server.

## Tick loop
- Simulation advances at **`TICK_RATE = 20`/s** (`Match` runs a `setInterval` at
  50 ms). Each tick: regen elixir → step every entity (acquire target, move with
  bridge routing, attack) → check end conditions.
- **Snapshots** are sent at **`SNAPSHOT_RATE = 10`/s** to halve bandwidth.
- The simulation is **deterministic** (seeded shuffle via mulberry32), so a match
  is reproducible from its seed + input log — useful for the no-draw tiebreak and
  future replays.

## Components

```
                   ┌─────────────── client (Phaser + DOM) ───────────────┐
   REST  ◄────────►│  net.ts (api)      main.ts (router)   ui.ts (screens) │
   WS    ◄────────►│  net.ts (socket)   field.ts (Phaser)  battle/boss.ts  │
                   └──────────────────────────────────────────────────────┘
                                    │ http + ws
                   ┌──────────────── server ──────────────────────────────┐
   http.ts (REST)  ─ auth.ts (Telegram initData) ─ store.ts (data)         │
   ws.ts (sockets) ─ manager.ts (matchmaking, rooms)                       │
                     └ game/match.ts ─ game/simulation.ts (1v1)            │
                     └ game/boss.ts   (clan boss co-op)                    │
                   └──────────────────────────────────────────────────────┘
```

- **`manager.ts`** owns matchmaking (one waiting slot + 6 s bot fallback), the map
  of live matches, and the per-clan boss rooms.
- **`match.ts`** wraps one `Simulation`, drives the loop, runs the bot opponent, and
  persists results to the store.
- **`boss.ts`** is a self-contained co-op raid room with live difficulty scaling.

## Data flow for a battle
1. `POST /api/auth` → identify Telegram user → returns session token (or "register").
2. Client opens WS, sends `{t:'auth', token}` → `authOk`.
3. Client sends `{t:'queue'}` → `manager` pairs two players (or a bot) → `matchFound`.
4. `Match` streams `{t:'battle', snapshot}` 10×/s; client sends `{t:'deploy', …}`.
5. On end, `{t:'matchEnd', result}` to both; trophies/wins persisted.

## Persistence
The default `Store` is **in-memory** so the MVP runs with zero dependencies. It is a
narrow interface (users, sessions, clans) designed to be swapped for **PostgreSQL +
Redis** in production — see [DATABASE.md](DATABASE.md).

## Production notes
- Set `BOT_TOKEN` to enable real Telegram `initData` HMAC verification.
- Serve the client over HTTPS (Telegram requirement).
- Scale-out would move match/room state and matchmaking into Redis and shard match
  loops across worker processes; the simulation is already isolated per match.
