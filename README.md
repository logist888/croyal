# Tower Clash

A real-time 1v1 tower-rush PvP game delivered as a **Telegram Mini App** — an
original, IP-clean clone of the Clash Royale formula. Built as a TypeScript
monorepo: a Phaser 3 client, an authoritative Node.js WebSocket server, and a
shared simulation contract.

> All units, art and names are original placeholders. No Supercell assets, names
> or artwork are used — only the game *mechanics* are reproduced.

## Features

- **Real-time 1v1 battles** — authoritative server simulation (20 ticks/s), elixir,
  8-card decks, three towers per side, bridges/river pathing.
- **No draws.** Rounds are capped at **4 minutes**; if you haven't won by then the
  match is decided by a deterministic tiebreak chain — failing to beat your
  opponent in time is an automatic loss. Leaving/disconnecting also auto-loses.
- **Bot opponent** fallback when no human is found within a few seconds.
- **Clans** — anyone can create or join a clan, **max 20 members**, clan names in
  **any language**. Roles, kick, leave, leader hand-off.
- **Clan boss raid (co-op)** — clanmates fight a shared boss together; **2+ players
  doubles the boss difficulty** (HP and damage). Per-player damage is tracked.
- **Immutable English nicknames** — chosen once at registration (with a permanent
  warning), English letters/digits/`_` only, no emoji. Cannot ever be changed.
- **Progression** — trophies, wins/losses, gold.

## Repository layout

```
shared/   @croyal/shared  — types, constants, card catalog, validation, WS protocol
server/   @croyal/server  — Express REST + ws WebSocket, authoritative simulation
client/   @croyal/client  — Phaser 3 + Vite Telegram Mini App
docs/                     — knowledge base (see below)
scripts/  backup.sh       — pre-coding backup tooling (see docs/BACKUP.md)
```

## Quick start (local, no external services)

The MVP runs with an **in-memory store** — no database required.

```bash
npm install

# Terminal 1 — server (http + ws on :3001, dev auth enabled when no BOT_TOKEN)
npm run dev:server

# Terminal 2 — client (Vite on :5173)
npm run dev:client
```

Open http://localhost:5173 in a browser. With no Telegram context, the client
uses a stable **dev user** so you can register and play. Open a second browser
profile / incognito window to matchmake two humans, or just wait ~6 s for the bot.

### Run the tests

```bash
npm test          # vitest: validation, store/clan rules, win resolution, boss x2
npm run typecheck # type-check all workspaces
```

## Telegram setup (production)

1. Create a bot with **@BotFather**, get the bot token.
2. Host the built client (`npm run build --workspace client`, output `client/dist`)
   over **HTTPS** (Telegram requires HTTPS for Mini Apps).
3. In BotFather, set the Mini App / menu button URL to your hosted client.
4. Run the server with `BOT_TOKEN=<token>` so `initData` is cryptographically
   verified (see `server/src/auth.ts`). Point the client at the server with
   `VITE_API_BASE=https://your-server`.

See `docs/ARCHITECTURE.md` and `docs/DATABASE.md` for the production path
(PostgreSQL + Redis), and `docs/` below for everything else.

## Documentation

| Doc | What |
| --- | --- |
| [docs/GAME_DESIGN.md](docs/GAME_DESIGN.md) | Mechanics, elixir, win conditions (no draws, 4-min cap) |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Authoritative server, tick loop, data flow |
| [docs/NETWORK_PROTOCOL.md](docs/NETWORK_PROTOCOL.md) | REST + WebSocket message protocol |
| [docs/CARDS.md](docs/CARDS.md) | Card catalog & stats |
| [docs/PLAYERS.md](docs/PLAYERS.md) | Nicknames (English, immutable), profile, progression |
| [docs/CLANS.md](docs/CLANS.md) | Clans (max 20, any-language names) & the co-op boss raid |
| [docs/DATABASE.md](docs/DATABASE.md) | Data model & the in-memory → Postgres/Redis path |
| [docs/PROGRESSION.md](docs/PROGRESSION.md) | Trophies, rewards, future progression |
| [docs/BACKUP.md](docs/BACKUP.md) | Backup policy (git + local, 2-build rotation) |
| [docs/CHANGELOG.md](docs/CHANGELOG.md) | Per-build changes |

## Status

This is **Phase 1–3 MVP**: registration, authoritative 1v1 battles, bot opponent,
clans, and the co-op boss raid are implemented and tested end to end. See the
CHANGELOG for what's done and what's next.
