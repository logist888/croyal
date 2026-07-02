# Card Catalog

All cards are **original** generic archetypes — no Supercell names or art. Source of
truth: `shared/src/cards.ts`. The starter deck (`DEFAULT_DECK`, legacy mode) is the
first 8 below; the default battle trio (`DEFAULT_TRIO`, cooldown mode) is
Footman + Archers + Colossus — the prototype's melee/ranged/tank mix.

Since build-14 every card carries BOTH a legacy elixir `cost` and its own
**`cooldownSec`** recharge (the active economy is flag-selected; see
[GAME_DESIGN.md](GAME_DESIGN.md)). Cooldowns below are placeholders derived from
the old costs, anchored to the approved prototype (6s / 8s / 14s) — the main
balance lever for the designer.

| Card | Type | Cost | Cooldown | HP | Damage | Hit speed | Range | Move | Targets | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Footman | troop | 3 | 6s | 700 | 80 | 1.1s | 1.2 | 1.0 | ground | Balanced melee |
| Archers | troop | 3 | 7s | 130 ×2 | 50 | 1.0s | 5.0 | 1.0 | both | Two ranged bodies |
| Colossus | troop | 6 | 14s | 2200 | 130 | 1.5s | 1.2 | 0.7 | ground | Tank, **targets buildings only** |
| Rat Pack | troop | 2 | 5s | 80 ×3 | 55 | 1.1s | 1.0 | 1.4 | ground | Three fast swarmers |
| Sharpshooter | troop | 4 | 8s | 340 | 110 | 1.0s | 6.0 | 1.0 | both | Long-range single target |
| Blademaster | troop | 4 | 9s | 600 | 340 | 1.6s | 1.2 | 1.3 | ground | High burst melee |
| Bomb Thrower | troop | 4 | 9s | 240 | 130 | 1.3s | 4.5 | 1.0 | ground | **Splash** (radius 1.5) |
| Bastion | building | 5 | 12s | 700 | 90 | 0.9s | 5.5 | — | ground | Defensive, 30s lifetime |
| Meteor | spell | 5 | 12s | — | 360 | — | r 2.5 | — | area | Burst AoE on a point |
| Volley | spell | 3 | 8s | — | 150 | — | r 4.0 | — | area | Wide soft AoE |

## Recommended pairs
Static combo hints (`shared/src/pairs.ts`, badges in the trio picker):
Footman+Archers, Colossus+Archers, Colossus+Sharpshooter, Rat Pack+Bomb Thrower,
Blademaster+Volley, Blademaster+Meteor.

## Stat fields (`CardDef`)
- `type`: `troop | spell | building`
- `cost`: elixir (legacy economy; kept for the rollback path)
- `cooldownSec`: per-card recharge in seconds (cooldown economy)
- `hp / damage / hitSpeed / range / moveSpeed / targets`: combat stats (troops/buildings)
- `count`: number of bodies spawned
- `targetsBuildingsOnly`: walks past troops, only attacks towers/buildings (tanks)
- `splashRadius`: area damage on hit
- `lifetimeSeconds`: buildings decay
- `flying`: unit flies (only air-capable attackers can hit it)
- `spellRadius / spellDamage`: instant AoE for spells
- `color`: tint used by the placeholder renderer (no external art assets)

## Adding a card
1. Add an entry to `CARDS` in `shared/src/cards.ts` (including `cooldownSec`).
2. Optionally add it to `DEFAULT_DECK` / `DEFAULT_TRIO` / `STARTER_POOL`, and
   any combo to `RECOMMENDED_PAIRS` (`shared/src/pairs.ts`).
3. The server simulation and client renderer pick it up automatically from the
   shared definition — no other code changes required.
