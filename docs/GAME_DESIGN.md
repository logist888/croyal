# Game Design

## Overview
Tower Clash is a real-time 1v1 tower-rush game. Each player brings a **battle trio**
of 3 cards and plays them on individual recharge timers; troops are **placed on
your own half** and path across the nearest bridge to destroy the opponent's
towers — the classic Clash-Royale-style flow. The design follows the genre
formula with original units and no Supercell assets.

> **build-17 — classic open placement (the default).** Troops are deployed by
> tapping your half of the field; each unit walks to the **nearest bridge**,
> crosses, and marches on the **nearest enemy tower**, peeling off to fight enemy
> troops within aggro range. **Both bridges are used** naturally, based on where
> you place. This is the `open` deployment core.
>
> **build-14 (cooldowns).** Per-card **cooldowns replaced the elixir pool** — kept.
> Build-14 also introduced single-lane **auto-march** (`fixed-lane`); that core is
> NOT deleted — it and the build-13 elixir/`free-placement` core both live behind
> config flags (see [Reversibility](#reversibility--the-legacy-core)).

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

## Open placement (classic — the default core)
- The player taps **anywhere on their own half** (`canDeployTroop`: your half,
  plus an enemy lane once its princess tower falls). Spells are aimed anywhere in
  the field.
- Each troop routes to the **nearest bridge**, crosses, and marches on the
  **nearest standing enemy tower** — so left-side placement crosses the left
  bridge, right-side the right. Both bridges are in play.
- A marching troop **peels off** to fight the nearest enemy troop/building within
  an aggro radius (`OPEN_AGGRO_RADIUS = 5.5` tiles), chasing until the target
  strays past a leash (`OPEN_AGGRO_LEASH`), then resumes its march.
  Building-hunters (`targetsBuildingsOnly`) ignore troops entirely — buildings,
  then towers.
- The hard terrain rules apply (shared with fixed-lane): ground troops cross ONLY
  on a bridge deck, and never stand inside a tower hitbox.

## Fixed lanes & auto-march (alternate core: `BATTLE_DEPLOYMENT=fixed-lane`)
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
- **Buildings are attackable** (build-15): a defense building that can threaten
  the lane may be engaged — ranged marchers trade with it from reach, and
  building-hunters (`targetsBuildingsOnly`: rams, tanks) divert up to a short
  detour (6 tiles) to demolish it before resuming the march. Without this rule
  the central building spot was outside every unit's engagement window and
  defense buildings were literally unattackable (the balance harness caught it
  as a 95% win rate for building-heavy trios).

## Statuses, zones & card mechanics (build-15)
- One unified status stack per entity: **slow, root, stun, rage, shield,
  poison** — one instance per kind (strongest magnitude wins, duration
  refreshes). Poison is damage-in-a-status; shield is an absorb pool consumed
  before hp. Root and stun stop movement; stun also stops attacks. **Flyers are
  immune to root.**
- **Zones** (Firestorm, Venom Cloud, Blizzard, Sandstorm) are ground areas that
  keep applying their status; they are NOT entities (never targeted, cap 12) and
  their effect lingers 0.5s after leaving.
- Troop abilities are pure card data (no per-card code): **charge** (chargers
  and assassins — a heavy armed first hit, re-arms while marching), **healer**
  (heals the most-wounded ally, never itself or towers), **chain** attacks,
  **spawner** (produces token units — hornet / paper glider / skeleton — which
  are not collectible), **rage aura**, **on-hit statuses**.
- Design decisions: **assassins** are charge-ability troops (teleports don't
  read on fixed lanes); **siege** buildings out-range the incoming lane but sit
  ≥14 tiles from every enemy tower, so tower-sniping is geometrically
  impossible; every theme ships at least one **anti-air** answer (test-pinned).
- **Boss raid shim:** zone spells deal `magnitude × zoneSeconds` to the boss,
  chain spells hit at full damage, and ally-utility effects (heal/rage/shield)
  are no-ops against the boss.

## Card catalog & league unlocks (build-15)
- **80 cards** (10 themes × 8) defined in `shared/src/cards.ts`; stats come from
  per-archetype budget formulas (`scripts/gen-catalog.mjs`) anchored on the 10
  original prototype-approved cards, which stay untouched.
- Each theme unlocks at a league (`shared/src/unlocks.ts`); the top two leagues
  carry two themes each. **Everything onboarding hands out is always unlocked.**
- The lock gates **use and drops**, not ownership: every account owns all cards
  at level 1 and may upgrade them; the battle **trio** may only contain unlocked
  cards (validated on save — a later trophy drop never breaks a saved trio),
  and battle-chest drops draw only from the player's unlocked pool.
- The full generated table lives in [CARDS.md](CARDS.md); the balance harness is
  `npx tsx scripts/balance-harness.mjs` (designer tool, not CI — trophy-based
  matchmaking makes same-tier balance the target, and unlock tiers are allowed
  to out-power earlier ones).

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

## Friendly battles (unranked)
A host opens a **private room** and receives a **4-character code** (safe
alphabet — no `O/0`, `I/1`) to share; a guest joins by that code and both are
paired into the normal match engine. Friendly matches are **pure practice**:
no trophies, gold, chest, or daily-quest progress (`Match`'s `friendly` flag;
`matchFound.friendly` tells the client to hide the reward block). Rooms live
**5 minutes**, then expire and free the code; a host disconnect closes a
still-waiting room. All over WebSocket (`createFriendly`/`joinFriendly`/
`cancelFriendly` → `friendlyCreated`). A Telegram deep-link invite is a future
add-on; today the code (with copy/share) is the invite.

## Tournaments (solo bracket)
A **4-player single-elimination** tournament vs bots: you + 3 bots, semifinals then
final. Your matches are played **live** through the normal battle engine
(friendly-flagged — no ladder trophies); bot-vs-bot pairings are **auto-resolved**
by a deterministic headless simulation. The server owns the bracket and advances it
as matches finish; the **champion earns gems** (💎30, finalist 💎10) — granted
server-side so only real match wins pay out. Reachable from the "🏆 Tournament" hub
screen. **Multi-human lobbies by code** (several players online together) are a
future step — the seat/bracket structures already allow human seats.

## Replays
The simulation is **fully deterministic** — no `Math.random` / `Date.now`, only a
seeded shuffle — so a match is reproducible from a compact recording: seed,
both decks, card levels, config, and the ordered list of accepted deploys each
stamped with the sim tick it hit. `Match` records this live; the server keeps the
last 100 recordings and each player's most recent. A **ReplayRoom** re-runs a
`Simulation` from the recording, applies every action at its exact tick, and
streams the same `battle` snapshots to one viewer (read-only, ~2× speed). This is
also the foundation for future **live spectating** and anti-cheat re-verification.

## Clan boss raid (co-op)
See [CLANS.md](CLANS.md). Clanmates fight a shared boss; **2+ simultaneous raiders
double** the boss HP and damage. Raiders play on card cooldowns stretched **×1.5**.
Each raider's contributed damage is tracked and shown on the result screen.

## Reversibility — the alternate cores
Per the GDD requirement, every battle core lives side-by-side behind two config
flags; switching is an **ops action** (restart the server), not a code change:

- `BATTLE_ECONOMY=elixir|cooldown`
- `BATTLE_DEPLOYMENT=open|fixed-lane|free-placement`

Defaults are the classic **`open`** core (`cooldown` + `open`). Cores:
- **`open`** — classic placement on your half, nearest-bridge routing, both
  bridges (the default; build-17).
- **`fixed-lane`** — build-14 single-lane auto-march + intercept.
- **`free-placement`** (with `elixir`) — the full build-13 legacy core: shared
  elixir pool, 8-card deck with a 4-card cycling hand, drag-to-deploy, 4-minute
  round, nearest-enemy targeting, **no terrain collisions** (kept byte-identical).

Every card carries BOTH `cost` (elixir) and `cooldownSec`. Each core is pinned by
its own test suite (`open-field`, `lane-march`/`intercept`, `simulation`).

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
