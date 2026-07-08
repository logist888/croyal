# Changelog

Per-build log. Each coding run is preceded by a backup (see [BACKUP.md](BACKUP.md))
and summarized here so backups are traceable.

## build-17 — Classic open-field battle (the new default core)
Reworked the battle deployment to the classic Clash-Royale flow, keeping the
card-cooldown economy (no rollback to the elixir core).
- **New `open` deployment core** (`shared/battle-config.ts`, now the default):
  troops are **placed on your own half**; each unit paths to the **nearest
  bridge**, crosses, and marches on the **nearest enemy tower**, peeling off to
  fight enemy troops/buildings within an aggro radius (`OPEN_AGGRO_RADIUS`).
  **Both bridges are used** based on placement — fixing the "everyone walks the
  center lane" feel of the single-lane prototype. Building-hunters still ignore
  troops. Hard terrain rules apply: no walking on water off a bridge, never
  stand inside a tower.
- **Movement rewrite** (`simulation.ts`): `stepOpenUnit` + `acquireOpenTarget` +
  `nearestEnemyTower`; terrain collisions now gated by `enforcesTerrain()` (true
  for `open`/`fixed-lane`, false for build-13 `free-placement` — legacy stays
  byte-identical). The `fixed-lane` (build-14) and `free-placement` (build-13)
  cores are untouched and remain selectable via `BATTLE_DEPLOYMENT`.
- **Client**: tap a trio card to arm it, then tap your half to deploy; the
  deployable half is tinted while a troop is armed, with a per-tap placement
  marker (`field.setDeployActive`). The bot supplies its own placement
  coordinates (alternating lanes), so it exercises both bridges too.
- Tests 163 → **171** (`open-field.test.ts`: both-bridge routing, no water-walk,
  nearest-tower targeting, aggro peel, deploy-zone gate, default-core assertion).
  Verified end-to-end headless: a full match resolves with 0 water violations and
  a single side crossing on both bridges.

## build-16 — Retention (Этап 1) + launch hardening
Post-launch work: real art, live infra, and the first retention loop.
- **Battle chests with unlock timers** (`shared/chests.ts`): a win drops a
  weighted chest into one of 4 slots; chests unlock on a timer (one at a time)
  and open for gold + unlocked-pool cards, or gems skip the wait. Gives gems a
  first sink. Server owns timestamp-based state (DB `chests` JSONB column); the
  hub shows a live chest bar with countdowns + gem-skip, and the result screen
  announces the earned chest instead of instant card drops.
- **Daily quests + login streak** (`shared/daily.ts`): a 7-day login-reward
  cycle (gold/gems, streak continues on consecutive UTC days) plus 3 rotating
  daily quests (play / win / open-chest / upgrade) tracked from real game
  events. UTC-day boundary resets everything; state is timestamp-based (DB
  `daily` JSONB). New "🎯 Daily" hub screen with a claimable dot.
- **Leaderboards**: global top players by trophies (tiebreak wins → earliest
  joined) with the caller's own rank, and top clans by summed LIVE member
  trophies. New "🏆 Ranking" hub screen with players/clans tabs and a
  self-highlight row.
- **Monthly seasons + ladder soft-reset** (`shared/seasons.ts`): a season is one
  UTC month. The store tracks the trophy peak and, on the first read/action of a
  new month, soft-resets trophies (kept up to 600, then half the excess) and
  banks an end-of-season reward sized by the peak league. Timestamp-based (DB
  `season` JSONB, no scheduled job). The hub shows a season countdown; a reward
  modal greets the player after a rollover (`POST /api/season/claim`).
- **Reconnect to an in-progress battle** — a dropped socket holds the match open
  for a 30s grace window and resyncs on re-auth instead of auto-forfeiting;
  client auto-reconnects with backoff and shows a "reconnecting" veil.
- **Arena per league** — each of the 8 leagues battles on its own arena.
- **Full art set** (221 assets) imported and sliced; **bigger towers / smaller
  troops** for a readable king > princess > unit hierarchy.
- **Launch infra**: single-origin Render hosting (server serves the client),
  optional keep-warm ping, verified Telegram auth default, Neon Postgres
  persistence verified end-to-end.
- Tests 119 → **163** (chests, daily, leaderboards, reconnect grace, arena
  mapping, seasons).

## build-15 — Content expansion: 80 cards, statuses, league unlocks, art pipeline
The full content layer on top of the build-14 battle core. Four milestones.
- **Status-effect framework (M1).** One unified stack (`Entity.statuses`):
  slow / root / stun / rage / shield / poison; one instance per kind (max
  magnitude, refreshed duration); poison is damage-in-a-status. Ground **zones**
  (≤12, not entities — outside targeting) keep applying their status; effects
  linger 0.5s after leaving. `effectiveMoveSpeed` is the single place speed math
  happens, so a status-free unit is bit-identical to build-14 (legacy fidelity).
- **Full mechanic set, data-driven (M1).** Troop abilities: charge (chargers AND
  assassins), healer, chain attacks, spawner (token units: hornet / paper glider /
  skeleton — not collectible), rage aura, on-hit statuses. Spell effects: poison /
  slow zones, root (flyers immune), knockback+stun, allied heal / rage / shield,
  chain lightning. Renderer: status tints, zone circles, shield arcs, heal/chain FX.
  Boss raid shim: zones deal their total damage, utility no-ops (documented).
- **80-card catalog (M2).** 10 themes × 8 from `docs/ART_PROMPT.ru.md`, stats from
  per-archetype budget formulas anchored on the 10 shipped cards
  (`scripts/gen-catalog.mjs`); `docs/CARDS.md` is now **generated**
  (`scripts/gen-cards-doc.mjs`). ~70 Russian card names + role labels in i18n.
- **League unlocks (M2).** `shared/unlocks.ts`: each theme tied to a league
  (top two leagues carry two themes); grandfather set = everything onboarding
  hands out. Trio saves reject locked cards (a later trophy drop never breaks an
  existing trio); battle-chest drops draw from the unlocked pool. Collection
  greys locked cards (upgrades still allowed); the trio picker shows them locked.
- **Art pipeline (M3).** `scripts/art-jobs.mjs` (225 jobs from the roster doc) +
  `scripts/gen-art.mjs` (gpt-image-1: resumable, `--only/--force/--dry-run`,
  cost estimate ~$11 for the full set, proxy-aware) + slicer hardening (invalid
  names skipped; the manifest now rebuilds from what exists on disk, so sliced
  art survives raw-file renames). Generation runs once `OPENAI_API_KEY` is set.
- **Balance + counterplay (M4).** `scripts/balance-harness.mjs` plays themed
  trios round-robin. It exposed that off-lane defense buildings were literally
  unattackable — now ranged marchers trade with lane-threatening buildings and
  building-hunters (rams/tanks) divert up to 6 tiles to demolish them (classic
  tank-vs-building counterplay). Siege dominance fell 95%→77%; remaining spread
  follows the league progression curve (trophy matchmaking keeps games same-tier).
- Tests 94 → **119** (catalog↔roster lockstep, unlock monotonicity/gates,
  art-job invariants, themed full-match harness runs).

## build-14 — Battle core redesign: card cooldowns + fixed-lane auto-march
The designer's (Мила) new battle vision, merged from the approved prototype and
the updated GDD. Fully reversible; delivered in four milestones (M1–M4).
- **Economy — per-card cooldowns replace the elixir pool.** Every card carries a
  `cooldownSec`; playing a card recharges only that card. The final minute ticks
  all cooldowns ×2 faster. The server rejects on-cooldown plays. Symmetric in
  PvP; the only asymmetry is the boss raid (raider cooldowns ×1.5).
- **Deployment — fixed lanes + auto-march.** The player picks WHICH card and
  WHEN, never where. Troops spawn on their side's right-lane bridge and march:
  bridge → enemy lane princess → king. Spells are aimed with a tap (free aim).
- **Intercept rule:** exactly one nearest marcher peels off per enemy that
  crosses onto your half; the survivor returns to the march. Tanks never
  intercept. Contact fighting on the lane via an engagement window.
- **Hand = battle trio:** 3 active cards from the collection (`profile.trio`,
  `POST /api/trio`, hub picker). Match length 180s; towers, crowns and the
  no-draw tiebreaks unchanged (king back + two princesses forward — confirmed).
- **Onboarding:** 5 starter boxes reveal the starter pool; the first trio is
  assembled from it (`POST /api/starter/open`, presentational only).
  **Recommended pairs** (`shared/pairs.ts`) badge good combos in the picker.
- **Reversibility (GDD requirement):** the legacy elixir/free-placement core is
  intact behind `BATTLE_ECONOMY` / `BATTLE_DEPLOYMENT` env flags; rollback is a
  server restart. Legacy behavior pinned by its own tests; fallback commit
  `3c0354d`.
- **Renderer juice:** snapshot interpolation (units glide instead of 10Hz
  snapping), server-emitted combat FX events → projectiles/impact particles/AoE
  rings, ground shadows, final-minute banner + arena tint, smooth cooldown
  overlays with a "ready pop", deploy status line.
- **Fixes:** static defenders (towers/buildings) used to lock a distant enemy
  tower forever and never fire at approaching units — they now re-scan every
  tick; ground units no longer stall on the river line or clip water/towers
  (bridge clamp + body radii); unit sprite-sheets (4×4 grids) now render a
  single frame instead of the whole grid; missing `col.level` i18n key.
- Tests 33 → **69** (cooldown economy, lane march, intercept, bot policy, boss
  cooldowns, trio/starter-box store rules, bot-vs-bot full-match harness) +
  live E2E in both modes + browser walkthroughs.

## build-13 — Battle: drag-to-deploy fix + original-game parity
Fixes the reported bug "couldn't place a single card during battle" and brings the
battle closer to the reference game.
- **Drag-to-deploy** (`client/deploy-drag.ts`): press a hand card and drag it onto
  the field — a ghost follows the finger and the field shows a green/red placement
  marker; release to deploy, drop outside a valid zone to cancel (no elixir spent).
  Tap-to-select then tap-the-field still works as a desktop fallback.
- **Telegram swipe fix** (`telegram.ts`): call `WebApp.disableVerticalSwipes()` so a
  vertical drag is no longer eaten by Telegram's "minimize app" gesture — the main
  reason dragging did nothing inside the Mini App. Plus `touch-action:none` on the
  arena/hand and `overscroll-behavior:none` so the gesture reaches the canvas.
- **Shared deploy rule** (`shared/deploy.ts`): `canDeployTroop`/`isWithinField` are
  now one source of truth used by both the authoritative server and the client's
  live drag preview (own half; an enemy lane opens once its princess tower falls;
  spells anywhere). The drag preview highlights valid/invalid in real time.
- **HUD parity**: opponent name in the battle top bar (from `matchFound`); tower HP
  numbers above towers (princess always; king once active), like the reference.
- **Drag robustness**: the hand pauses DOM rebuilds during a gesture so a 10 Hz
  snapshot can't orphan the dragged card / break pointer capture.
- 33 tests (5 new deploy-zone tests) + typecheck + client build all green.

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
