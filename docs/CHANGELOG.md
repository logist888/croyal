# Changelog

Per-build log. Each coding run is preceded by a backup (see [BACKUP.md](BACKUP.md))
and summarized here so backups are traceable.

## build-12 — Durable storage: PostgreSQL write-through
- Added `server/src/db.ts` (node-`pg`): the in-memory store stays the synchronous
  runtime source of truth, but every change **writes through to PostgreSQL** and the
  store **hydrates from it on boot** → progress (accounts, cards, clans, sessions)
  **survives restarts/sleep**, on any host.
- Enabled via **`DATABASE_URL`** (Neon/Supabase/Render PG; SSL auto for non-local).
  Unset → pure in-memory (unchanged dev/test behavior). `store.init()` runs at boot.
- Tables `users`/`clans`/`sessions` (deck/cards/members as JSONB).
- `render.yaml` + `.env.example` + `docs/DEPLOY_TG.md` updated (Neon step).
- **Verified against a real Postgres 16:** registered a user + clan, restarted the
  server, and the same token returned the profile (10-card inventory) and clan —
  data hydrated from PG. 28 tests + typecheck + build still green.

## build-11 — GitHub Pages deploy (client) + base-path support
- Client is now **base-path-aware**: Vite `base` from `VITE_BASE`, and all runtime
  asset URLs (manifest, card/unit/tower/boss/arena art, logo, menu bg) resolve via
  `import.meta.env.BASE_URL`. Works at `/` (dev/Render) and `/croyal/` (Pages).
- Added **`.github/workflows/pages.yml`**: builds the client (`VITE_BASE=/croyal/`,
  `VITE_API_BASE` from a repo Variable) and publishes to GitHub Pages.
- `docs/DEPLOY_TG.md` Path C: GitHub Pages (client) + Render (server) — permanent,
  no tunnel. (Pages is static-only, so the server still needs a Node host.)
- Verified: Pages build emits `/croyal/...` asset paths; root build unchanged.

## build-10 — Telegram-ready single-origin hosting
- Server now serves the **built client + API + WebSocket from one origin**
  (`server` serves `client/dist`, SPA fallback for non-`/api` GETs). One HTTPS URL
  runs the whole Mini App.
- Client uses **same-origin** API/WS by default (`wss://<host>/ws`); local dev
  points at `:3001` via `client/.env.development`.
- **Test auth**: with `ALLOW_DEV_AUTH=1` the server trusts Telegram `initData`
  unverified so the Mini App can be tested inside Telegram without the bot token
  (set `BOT_TOKEN` for verified production auth).
- Added `Dockerfile`, `.dockerignore`, `render.yaml`, root `npm start`
  (build client → run server), and **docs/DEPLOY_TG.md** (tunnel + Render +
  BotFather steps).
- Verified: one server serves `/`, `/api/health`, `/assets/*`, `/logo.png`.

## fix — battle layout & deploy (browser)
- The arena canvas was in a separate `#game` div rendered **below** the HUD, so the
  card hand appeared above the arena and the field sat below the fold (hard to tap).
- Now the Phaser canvas mounts **inside** the battle/boss HUD in the correct order:
  top bar → **arena** → elixir → hand (cards at the bottom, like the original), which
  also makes the field directly tappable to deploy. Your side still renders at the
  bottom of the arena.

## build-9 — Battle chests & reward reveal (Phase 2)
- Match results now carry **battle-chest rewards** (`MatchResult.rewards` = gold +
  duplicate cards); the match controller computes and attaches them per player.
- Result screen shows a **chest you tap to open** → reveals `+gold` and each card
  drop (with its art), then "Back to menu".
- 28 tests + typecheck + build all green.

## build-8 — Card collection, levels & upgrades (Phase 1)
- **Per-user card inventory** (level + duplicate count) seeded for all cards at
  registration; profile now carries `xp` and `cards`.
- **Upgrades**: spend duplicate cards + gold to level a card (`/api/cards/:id/upgrade`),
  which grants **account XP → King level** (`levelFromXp`). Costs scale per level
  (`cardsToUpgrade`/`goldToUpgrade`), capped at `MAX_CARD_LEVEL`.
- **Level stat scaling** applied in the authoritative simulation (+10%/level to HP,
  damage, spell damage); match passes each player's card levels in.
- **Card source**: battles now drop duplicate cards (winner more) until chests exist.
- **Collection screen**: card grid (level + progress + rarity border) and a card
  detail modal (rarity/type/cost/level + scaled HP/Damage/DPS + Upgrade). New "Cards"
  hub entry; hub level now derives from XP.
- 6 new tests (upgrade economy + stat scaling); 28 total, all green.

## build-7 — Original-game study: hub, leagues, crowns, rarity
- Studied 20 gameplay screenshots and compiled a functional spec into
  `docs/REFERENCE_NOTES.md` (mechanics/structure/UX only — our art stays original).
- **Crowns**: battle score surfaced as crowns in the HUD (`👑 x — y 👑`) and on the
  result screen (crown icons); win text now reads "Crowns".
- **Hub menu**: top bar (avatar + nickname + account **level** + 🏆/🪙/💎 counters),
  a **league/arena band** with progress to the next arena, a big Battle button, Clan,
  and a deck panel showing **average elixir** + **rarity-colored** card borders.
- **Leagues/arenas** by trophy thresholds + `accountLevel` helper (`shared/constants.ts`,
  original names). **Card rarity + role/type** added to the catalog and displayed.
- Fixed `scripts/backup.sh` to handle filenames with spaces (tar fallback).
- Verified: typecheck + 22 tests + client build all green.

## build-6 — Battle unit sprites (partial)
- Sliced uploaded battle-sprite art into `client/public/assets/units/` and wired
  it into the Phaser field (`scripts/slice-units.mjs`: mass-based alpha crop +
  resize to 256px). Unit on-field size bumped so the art reads.
- Identified 3 units by colour signature (preview blocked by the content filter):
  **bombthrower, archers, ratpack**. These now render on the battlefield.
- Findings on the upload batch (needs follow-up):
  - two files were byte-identical duplicates (only 6 unique images for 7 troops);
  - two files have opaque (non-transparent) grey backgrounds, so they can't be
    dropped on the field cleanly (subject is also grey → can't auto-key);
  - footman / blademaster / sharpshooter still need identification + clean
    transparent cutouts; colossus needs a transparent version.

## build-5 — Real art wired in (cards, logo, menu)
- Sliced the uploaded ChatGPT art batch with a tailored slicer
  (`scripts/preslice-uploads.mjs`):
  - **10 card portraits** cut from the 5×2 card sheet (grid crop + autocrop +
    contain) → shown in the hand, deck and next-card preview as full cards.
  - **Logo** white background keyed out (border flood-fill) → transparent
    `client/public/logo.png` (loading/register/menu + favicon).
  - **Menu backdrop** from an arena render → dimmed full-app background.
- Card cells now render the real card art (frame/name/cost baked in); our overlay
  is dropped when art is present. Card **costs aligned to the art**: colossus 6,
  bomb thrower 4, bastion 5, meteor 5.
- Not used (kept as source): the arena renders have **towers baked in**, so they
  can't be the battle background (would collide with the game's destructible
  towers); the unit/tower/boss reference is too low-res to cut. Battle units,
  towers and boss therefore keep the drawn placeholders for now.
- Verified: slices inspected; 22 tests pass; typecheck + build green; assets emit
  into `dist`.

## build-4 — Art pipeline (drop-in sprites)
- New `art/incoming/<category>/` folder where raw art is dropped (cards, units,
  towers, boss, arena, ui, logo), with naming/size conventions in its README.
- `npm run slice` (`scripts/slice-art.mjs`, jimp) standardizes/crops each image,
  cuts `@COLSxROWS` sprite sheets into frames, copies the logo, and rebuilds
  `client/public/assets/manifest.json`.
- Client now consumes sliced art: DOM card icons (hand, deck, next-card preview),
  and Phaser textures for units/towers/boss via a sprite pool, plus an optional
  arena background image. Everything **falls back to the built-in placeholder
  look** when art is missing, so assets can be added piece by piece.
- Verified: slicer tested on sample images (single + sheet); client typecheck +
  build green.

## build-3 — UI theme overhaul + logo support
- Reskinned the whole interface to a polished, original "arena game" look
  (wood + gold panels, chunky 3D gold/blue/red buttons, green arena palette).
  All styling is hand-authored CSS — no third-party game assets.
- Upgraded the Phaser arena renderer: checkered grass, styled river with two
  plank bridges, tower platforms with a crown on the king tower, unit shadows
  and outlines, and a spiky boss.
- New battle/boss HUD: timer/score chips, a 10-segment elixir bar with a live
  counter, and a "next card" preview.
- Logo support: the app loads `client/public/logo.png` if present, otherwise a
  bundled original placeholder crest (`logo.svg`); also wired as the favicon.
  Drop your own image at `client/public/logo.png` (see `client/public/README.md`).
- Verified: client typecheck + production build green (logo asset emitted).

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
