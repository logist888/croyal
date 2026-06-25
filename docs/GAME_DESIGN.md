# Game Design

## Overview
Tower Clash is a real-time 1v1 tower-rush game. Each player deploys troops, spells
and buildings from an 8-card deck to destroy the opponent's towers while defending
their own. The design intentionally mirrors the Clash Royale formula with original
units and no Supercell assets.

## Arena
- A fixed field of **18 × 30 tiles** (`ARENA_WIDTH` × `ARENA_HEIGHT`).
- A **river** runs across the middle (`RIVER_Y = 15`) with **two bridges**
  (`BRIDGE_X = [4.5, 13.5]`). Ground troops must cross at a bridge; flying units
  (if any) cross anywhere.
- Each side owns **three towers**: one **King** tower (center back) and two
  **Princess** towers (front-left, front-right). Side **A** defends the bottom
  (large Y), side **B** the top (small Y). The client always renders *your* side
  at the bottom.

### Tower behaviour
- Princess towers are always active and fire at the nearest enemy in range.
- The **King tower is inactive** until it takes damage **or** one of its own
  Princess towers is destroyed — then it activates and fights.

## Elixir
- Each player starts at **5** elixir, regenerates **1 per 2.8 s**, caps at **10**.
- During the **last 60 seconds** of the round elixir regenerates at **×2**.
- Deploying a card costs its elixir; the server rejects unaffordable deploys.

## Deck & hand
- A deck is **8 cards**. The hand shows **4 cards** plus the **next** card.
- Playing a card sends it to the back of the cycle and draws the next — classic
  rotation. The cycle order is deterministically shuffled per match.

## Deploy zones
- You may deploy on **your own half** only…
- …until you destroy an enemy Princess tower, which **opens that lane** on the
  enemy half for forward deploys.
- **Spells** may target anywhere on the field.

## Win conditions — NO DRAWS
- The round is hard-capped at **4 minutes** (`ROUND_SECONDS = 240`). There is **no
  overtime**.
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

## Clan boss raid (co-op)
See [CLANS.md](CLANS.md). Clanmates fight a shared boss; **2+ simultaneous raiders
double** the boss HP and damage. Each raider's contributed damage is tracked and
shown on the result screen.

## Tuning
All numbers live in `shared/src/constants.ts` (arena, timing, elixir, towers, boss)
and `shared/src/cards.ts` (card stats). They are the single source of truth shared
by client and server.
