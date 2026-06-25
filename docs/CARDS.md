# Card Catalog

All cards are **original** generic archetypes — no Supercell names or art. Source of
truth: `shared/src/cards.ts`. The starter deck (`DEFAULT_DECK`) is the first 8 below.

| Card | Type | Cost | HP | Damage | Hit speed | Range | Move | Targets | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Footman | troop | 3 | 700 | 80 | 1.1s | 1.2 | 1.0 | ground | Balanced melee |
| Archers | troop | 3 | 130 ×2 | 50 | 1.0s | 5.0 | 1.0 | both | Two ranged bodies |
| Colossus | troop | 5 | 2200 | 130 | 1.5s | 1.2 | 0.7 | ground | Tank, **targets buildings only** |
| Rat Pack | troop | 2 | 80 ×3 | 55 | 1.1s | 1.0 | 1.4 | ground | Three fast swarmers |
| Sharpshooter | troop | 4 | 340 | 110 | 1.0s | 6.0 | 1.0 | both | Long-range single target |
| Blademaster | troop | 4 | 600 | 340 | 1.6s | 1.2 | 1.3 | ground | High burst melee |
| Bomb Thrower | troop | 3 | 240 | 130 | 1.3s | 4.5 | 1.0 | ground | **Splash** (radius 1.5) |
| Bastion | building | 3 | 700 | 90 | 0.9s | 5.5 | — | ground | Defensive, 30s lifetime |
| Meteor | spell | 4 | — | 360 | — | r 2.5 | — | area | Burst AoE on a point |
| Volley | spell | 3 | — | 150 | — | r 4.0 | — | area | Wide soft AoE |

## Stat fields (`CardDef`)
- `type`: `troop | spell | building`
- `cost`: elixir
- `hp / damage / hitSpeed / range / moveSpeed / targets`: combat stats (troops/buildings)
- `count`: number of bodies spawned
- `targetsBuildingsOnly`: walks past troops, only attacks towers/buildings (tanks)
- `splashRadius`: area damage on hit
- `lifetimeSeconds`: buildings decay
- `flying`: unit flies (only air-capable attackers can hit it)
- `spellRadius / spellDamage`: instant AoE for spells
- `color`: tint used by the placeholder renderer (no external art assets)

## Adding a card
1. Add an entry to `CARDS` in `shared/src/cards.ts`.
2. Optionally add it to `DEFAULT_DECK`.
3. The server simulation and client renderer pick it up automatically from the
   shared definition — no other code changes required.
