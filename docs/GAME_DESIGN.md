# Game Design

## Overview
Tower Clash is a real-time 1v1 tower-rush game. Each player brings a **battle trio**
of 3 cards and plays them on individual recharge timers; troops auto-march down
fixed lanes to destroy the opponent's towers. The design follows the genre formula
with original units and no Supercell assets.

> **build-14 core redesign.** The battle core was redesigned to the game
> designer's (Мила) vision: per-card **cooldowns replace the elixir pool** and
> **fixed lanes with auto-march replace free placement**. The previous core is
> NOT deleted — it lives behind config flags as the rollback path (see
> [Reversibility](#reversibility--the-legacy-core)).

## Arena
- A fixed field of **18 × 30 tiles** (`ARENA_WIDTH` × `ARENA_HEIGHT`).
- A **river** runs across the middle (`RIVER_Y = 15`) with **two bridges**
  (`BRIDGE_X = [4.5, 13.5]`). Ground troops cross ONLY at a bridge (hard rule —
  they are clamped to the bridge deck inside the river band); flying units (if
  any) cross anywhere.
- Each side owns **three towers**: one **King** tower (center back) and two
  **Princess** towers (front-left, front-right) guarding the lanes — the classic
  layout, explicitly confirmed over the "towers in a row / cluster" idea.
  Side **A** defends the bottom (large Y), side **B** the top (small Y). The
  client always renders *your* side at the bottom.
- Units never stand inside a tower: towers have body radii
  (`TOWER_BODY_RADIUS`, king 1.1 / princess 0.9 tiles) used both for attack
  reach and movement push-out.

### Tower behaviour
- Princess towers are always active, re-scan every tick, and fire at the nearest
  enemy **unit or building** in range (never across the map at enemy towers).
- The **King tower is inactive** until it takes damage **or** one of its own
  Princess towers is destroyed — then it activates and fights.

## Card recharge (economy)
- There is **no shared elixir pool**. Every card has its own `cooldownSec`.
- Playing a card puts **that card** on cooldown; the other cards are unaffected.
- **Final minute:** all cooldowns tick **twice as fast** (including ones already
  running) — the prototype's nervous finale.
- The server **rejects** a play while that card is recharging.
- Cooldowns are **symmetric** in all PvP modes (fairness pillar). The only
  exception is the co-op **boss raid**, where raider cooldowns run
  **×1.5** (`BOSS_RAIDER_COOLDOWN_MULT`) as the difficulty lever — there is no
  human opponent, so fairness is preserved.

## Battle trio (hand)
- Each player brings exactly **3 active cards** (`TRIO_SIZE`) picked from the
  collection in the hub. No deck cycle, no "next card".
- The hand occupies the bottom of the screen; each card shows its own recharge
  overlay and countdown.

## Fixed lanes & auto-march
- The player chooses **WHICH card and WHEN** — never where. Troop/building
  deploys carry **no coordinates**; the server spawns them at the side's lane
  point (`LANE_SPAWN`).
- Each side attacks along its own **right lane** (mirrored — the enemy arrives
  on your left). March order: own bridge → the enemy **lane princess** → king.
- **Spells are aimed**: tap the spell card, then tap anywhere on the field
  (free aim, `isWithinField`), so defensive casts on your own half work too.

### Intercept rule
- When an enemy unit steps onto your half, exactly **ONE** of your marching
  units — the nearest eligible — peels off to fight it; everyone else keeps
  marching. When either side of that duel dies, the survivor returns to the
  march. One interceptor per threat, never two.
- Tanks (`targetsBuildingsOnly`, e.g. the Colossus) never intercept and are
  never distracted — they walk to towers.
- Independent of interception, units naturally **engage** enemies that come
  within fighting reach on their lane (`ENGAGE_X_WINDOW`) — melee blocks melee
  on a bridge, ranged trades happen across the lane.

## Win conditions — NO DRAWS
- The round is hard-capped at **3 minutes** (`roundSeconds = 180` in the
  cooldown config). There is **no overtime**.
- **Instant win:** destroy the enemy **King** tower.
- **At the time limit**, a winner is always chosen via this deterministic tiebreak
  chain (a draw is impossible):
  1. More enemy **towers destroyed**.
  2. Else more **total tower damage** dealt.
  3. Else **whoever destroyed a tower first**.
  4. Else a deterministic fallback derived from the match seed.
- **Not winning in time = automatic loss** for the side that isn't ahead.
- **Leaving or disconnecting** forfeits the match (automatic loss).

## Rewards
- Win: **+30** trophies, +50 gold. Loss: **−30** trophies (floored at 0), +10 gold.
- The post-match battle chest also drops duplicate cards (3 win / 1 loss).

## Onboarding
- New players open **5 starter boxes** (`STARTER_BOX_COUNT`) revealing the
  starter characters one by one, then assemble their first trio from that pool.
  Purely presentational — no duplicates are granted, the upgrade economy is
  untouched.
- **Recommended pairs** (`shared/src/pairs.ts`) are static combo hints surfaced
  as badges in the trio picker and during onboarding.

## Clan boss raid (co-op)
See [CLANS.md](CLANS.md). Clanmates fight a shared boss; **2+ simultaneous raiders
double** the boss HP and damage. Raiders play on card cooldowns stretched **×1.5**.
Each raider's contributed damage is tracked and shown on the result screen.

## Reversibility — the legacy core
Per the GDD requirement, the pre-redesign core (shared elixir pool, 8-card deck
with a 4-card cycling hand, free drag-to-deploy placement, 4-minute round) is
fully preserved behind two config flags:

- `BATTLE_ECONOMY=elixir|cooldown`
- `BATTLE_DEPLOYMENT=free-placement|fixed-lane`

Rollback is an **ops action** — restart the server with the legacy values; no
code changes, no redeploy. Every card carries BOTH `cost` (elixir) and
`cooldownSec`. The legacy behavior is pinned by its own test suite.

**Documented deviation from build-13:** two build-13 defects stay fixed in the
legacy mode as well, because rolling back to them would restore a broken game,
not a working one: (1) towers/buildings re-scan targets every tick — in
build-13 towers locked a distant enemy tower at t=0 and never fired at
approaching units; (2) the river-crossing waypoint sits just beyond the water —
in build-13 side-A ground units froze on the river line forever. If EXACT
build-13 behavior is ever needed (bugs included), that is the fallback commit
`3c0354d` (local tag `fallback-elixir-freeplace`), not the flags.

## Tuning
All numbers live in `shared/src/constants.ts` (arena, timing, lanes, towers, boss),
`shared/src/battle-config.ts` (mode flags, round length, final-phase multiplier),
`shared/src/cards.ts` (card stats incl. cooldowns) and `shared/src/pairs.ts`
(recommended pairs, starter pool). They are the single source of truth shared by
client and server. Cooldown placeholders are derived from the old elixir costs
(cheaper → shorter) anchored to the approved prototype (melee 6s / ranged 8s /
big tank 14s) and are the designer's main balance lever.
