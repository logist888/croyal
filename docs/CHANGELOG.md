# Changelog

Per-build log. Each coding run is preceded by a backup (see [BACKUP.md](BACKUP.md))
and summarized here so backups are traceable.

## build-2 — Russian localization
- Added a client i18n layer (`client/src/i18n.ts`) with full **English + Russian**
  string sets. The whole UI (registration, menu, clans, battle, boss, result
  screens), card names, and result reasons are translated.
- Language follows `profile.language`: choosing **Русский** at registration shows
  the entire interface in Russian. The registration screen switches language live
  when toggling EN/RU, and defaults to the Telegram/device language.
- Client-side nickname validation now shows localized error messages.
- Verified: client typecheck + production build green (server unchanged).

## build-1 — Initial MVP (Phases 0–3)
First implementation of Tower Clash as a Telegram Mini App.

**Foundation**
- npm-workspaces monorepo: `@croyal/shared`, `@croyal/server`, `@croyal/client`.
- Backup tooling (`scripts/backup.sh`, `npm run backup`) with git tag + local
  2-build rotation; full `docs/` knowledge base; `docker-compose` for the
  Postgres/Redis production path.

**Shared contract** (`shared/`)
- Constants (arena, elixir, timing, towers, boss), original card catalog,
  validation rules (immutable English nicknames, any-language clan names),
  domain types, and the WebSocket protocol.

**Server** (`server/`)
- Telegram `initData` auth with a browser dev fallback; REST API for auth,
  registration and clans; in-memory store enforcing all invariants.
- Authoritative 1v1 simulation (20 ticks/s): elixir, deck cycling, unit AI with
  bridge pathing, splash, buildings, tower/king activation.
- **No-draw win resolution**: 4-minute cap, instant win on king, deterministic
  tiebreak chain, auto-loss on timeout/leave/disconnect.
- Matchmaking with a 6 s **bot-opponent** fallback.
- **Clans**: create/join/leave/kick, 20-member cap, any-language names, leader
  hand-off.
- **Clan boss raid (co-op)** with live **×2 difficulty** for 2+ raiders and
  per-player damage attribution.
- 22 passing vitest tests (validation, store/clan rules, win resolution, boss x2).

**Client** (`client/`)
- Phaser 3 + Vite Telegram Mini App. Registration screen with the **permanent
  nickname warning** + confirmation; main menu; clans browser/detail; battle and
  boss screens (Phaser field renderer + DOM HUD, tap-to-deploy).

**Verified**
- Server typecheck + tests green; client typecheck + production build green.
- End-to-end WebSocket test: two players matchmade, deployed, exchanged ~23
  snapshots, and a forfeit produced the correct win/loss + trophy persistence.

### Next (planned)
- Card collection & upgrades, arenas/leagues, chests, deck builder (Phase 3+).
- Reconnection to in-progress matches; richer spell/projectile visuals.
- PostgreSQL + Redis store implementation for durability and scale-out.
