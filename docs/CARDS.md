# Card Catalog — 80 cards (build-15)

> **Generated** from `shared/src/cards.ts` by `npx tsx scripts/gen-cards-doc.mjs` — edit the
> data, not this file. All cards are **original** archetypes; art prompts live in
> [ART_PROMPT.ru.md](ART_PROMPT.ru.md).

Every card has a per-card **recharge** (`cooldownSec`, the active economy since
build-14) plus a legacy elixir `cost` for the flag-selected legacy mode. Stats
below are level 1; levels scale hp/damage by +10% per level compounding.

## Unlocks by league

Cards unlock with arena progression (`shared/src/unlocks.ts`): each theme is tied
to a league; battle-chest drops come only from unlocked cards, and the battle trio
may only contain unlocked cards (checked on save). Everything the onboarding hands
out (starter pool + default trio/deck) is **always unlocked**.

| League (min 🏆) | Themes |
| --- | --- |
| Training Camp (0) | Training Grounds |
| Forest Clearing (100) | Forest Clearing |
| Stone Fort (300) | Stone Fort |
| Fire Forge (600) | Fire Forge |
| Frost Peak (1000) | Frost Peak |
| Storm Arena (1500) | Storm Arena |
| Royal Arena (2200) | Royal Court + Shadow Marsh |
| Legend League (3000) | Desert Sands + Legend League |

## Mechanics legend

- **Charge / Assassin** — the armed first hit deals bonus damage; re-arms while marching.
- **Healer** — heals the most-wounded nearby ally instead of idling (never itself or towers).
- **Spawner** — buildings/troops that periodically produce token units (tokens are not collectible).
- **Chain** — attacks/spells arc to nearby extra targets with damage falloff.
- **Rage aura / Rage** — attack & move speed multiplier while active.
- **Statuses** — slow, root (flyers immune), stun, poison (dps), shield (damage pool), rage.
- **Zones** — ground areas that keep applying a status; effects linger 0.5s after leaving.

## Roster by theme

### Training Grounds — unlocks at Training Camp (0 🏆)

| Card | Rarity | Type | Recharge | HP | Dmg | Hit | Range | Move | Targets | Mechanic |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Footman | common | troop | 6s | 700 | 80 | 1.1s | 1.2 | 1 | ground |  |
| Recruit | common | troop | 4s | 100 ×2 | 65 | 1.1s | 1 | 1.2 | ground |  |
| Archers | common | troop | 7s | 130 ×2 | 50 | 1s | 5 | 1 | both |  |
| Rat Pack | common | troop | 5s | 80 ×3 | 55 | 1.1s | 1 | 1.4 | ground |  |
| Bomb Thrower | rare | troop | 9s | 240 | 130 | 1.3s | 4.5 | 1 | ground | **Splash** (radius 1.5) |
| Sharpshooter | rare | troop | 8s | 340 | 110 | 1s | 6 | 1 | both |  |
| Bastion | common | building | 12s | 700 | 90 | 0.9s | 5.5 | — | ground | 30s lifetime |
| Volley | rare | spell | 8s | — | 150 | — | r 4 | — | area |  |

### Forest Clearing — unlocks at Forest Clearing (100 🏆)

| Card | Rarity | Type | Recharge | HP | Dmg | Hit | Range | Move | Targets | Mechanic |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Thornling | common | troop | 4s | 65 ×3 | 45 | 1.1s | 1 | 1.4 | ground |  |
| Wolf Pack | common | troop | 6s | 120 ×3 | 70 | 1.1s | 1 | 1.5 | ground |  |
| Boar Rider | rare | troop | 9s | 935 | 130 | 1.1s | 1.2 | 1.3 | ground | **Charge** — first hit ×2 (re-arms while marching) |
| Druidess | rare | troop | 9s | 415 | 55 | 1s | 5 | 1 | both | **Healer** — heals the most-wounded ally 130 hp |
| Beehive | common | building | 10s | 580 | 0 | 0.9s | 5.5 | — | ground | **Spawner** — 1× Hornet every 3.5s (max 4 alive); 30s lifetime |
| Entangle | rare | spell | 5s | — | — | — | r 2.5 | — | area | **Root** — pins ground units 2.5s (flyers immune) |
| Treant | epic | troop | 14s | 2195 | 140 | 1.5s | 1.2 | 0.7 | ground | targets **buildings only** |
| Greenwarden | legendary | troop | 13s | 1795 | 255 | 1.2s | 1.2 | 1.1 | ground |  |

### Stone Fort — unlocks at Stone Fort (300 🏆)

| Card | Rarity | Type | Recharge | HP | Dmg | Hit | Range | Move | Targets | Mechanic |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Shieldguard | common | troop | 6s | 760 | 70 | 1.1s | 1.2 | 0.9 | ground |  |
| Crossbowman | rare | troop | 9s | 380 | 130 | 1s | 5.5 | 1 | both |  |
| Battering Ram | rare | troop | 9s | 940 | 130 | 1.1s | 1.2 | 1.2 | ground | **Charge** — first hit ×2.2 (re-arms while marching); targets **buildings only** |
| Cannon Tower | common | building | 8s | 465 | 60 | 0.9s | 5.5 | — | ground | 30s lifetime |
| Catapult | epic | building | 12s | 540 | 190 | 2.6s | 7.8 | — | ground | **Splash** (radius 1.3); 30s lifetime |
| Colossus | epic | troop | 14s | 2200 | 130 | 1.5s | 1.2 | 0.7 | ground | targets **buildings only** |
| Ironclad | legendary | troop | 16s | 2690 | 175 | 1.5s | 1.2 | 0.6 | ground | targets **buildings only** |
| Fortify | rare | spell | 7s | — | — | — | r 3 | — | area | **Shield** — absorbs 320 dmg for 8s |
> Colossus: **always unlocked** (starter/default content).

### Fire Forge — unlocks at Fire Forge (600 🏆)

| Card | Rarity | Type | Recharge | HP | Dmg | Hit | Range | Move | Targets | Mechanic |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Emberling | common | troop | 4s | 100 ×2 | 65 | 1.1s | 1 | 1.4 | ground |  |
| Flame Knight | rare | troop | 9s | 1040 | 130 | 1.1s | 1.2 | 1 | ground |  |
| Pyromancer | rare | troop | 9s | 265 | 120 | 1.3s | 4.5 | 1 | both | **Splash** (radius 1.3) |
| Forge Turret | common | building | 8s | 465 | 60 | 0.9s | 5.5 | — | ground | 30s lifetime |
| Magmaback | epic | troop | 14s | 2195 | 140 | 1.5s | 1.2 | 0.7 | ground | targets **buildings only** |
| Meteor | epic | spell | 12s | — | 360 | — | r 2.5 | — | area |  |
| Infernal Hound | legendary | troop | 11s | 1050 | 160 | 1.1s | 1.2 | 1.3 | ground | **Charge** — first hit ×2 (re-arms while marching) |
| Firestorm | rare | spell | 9s | — | 40 | — | r 2.5 | — | area | **Poison zone** — 5s, 32 dps |
> Meteor: **always unlocked** (starter/default content).

### Frost Peak — unlocks at Frost Peak (1000 🏆)

| Card | Rarity | Type | Recharge | HP | Dmg | Hit | Range | Move | Targets | Mechanic |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Frostling | common | troop | 4s | 65 ×3 | 45 | 1.1s | 1 | 1.4 | ground |  |
| Snowball Giant | common | troop | 8s | 970 | 110 | 1.1s | 1.2 | 1.2 | ground | **Charge** — first hit ×1.8 (re-arms while marching) |
| Icebreaker | rare | troop | 9s | 1040 | 130 | 1.1s | 1.2 | 1 | ground |  |
| Frost Archer | rare | troop | 9s | 380 | 130 | 1s | 5 | 1 | both | **On-hit slow** — 1.5s, ×0.65 speed |
| Glacier Wall | common | building | 10s | 1275 | 0 | 0.9s | 5.5 | — | ground | 30s lifetime |
| Snow Yeti | epic | troop | 14s | 2195 | 140 | 1.5s | 1.2 | 0.7 | ground | targets **buildings only** |
| Winterborn | legendary | troop | 13s | 435 | 225 | 1.3s | 5 | 1 | both | **On-hit slow** — 2s, ×0.6 speed |
| Blizzard | rare | spell | 7s | — | 60 | — | r 3 | — | area | **Slow zone** — 4s, ×0.55 speed |

### Storm Arena — unlocks at Storm Arena (1500 🏆)

| Card | Rarity | Type | Recharge | HP | Dmg | Hit | Range | Move | Targets | Mechanic |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Zaplet | common | troop | 4s | 100 ×2 | 65 | 1.1s | 1 | 1.4 | both |  |
| Storm Crow | common | troop | 6s | 115 ×3 | 70 | 1.1s | 1 | 1.4 | both, flying |  |
| Skylancer | rare | troop | 9s | 830 | 130 | 1.1s | 1.2 | 1.3 | both, flying |  |
| Galestrike | rare | spell | 7s | — | 60 | — | r 3 | — | area | **Knockback** — pushes 2.5 tiles + 0.8s stun |
| Windmill Tower | common | building | 10s | 580 | 0 | 0.9s | 5.5 | — | ground | **Spawner** — 1× Paper Glider every 4s (max 4 alive); 30s lifetime |
| Thunder Mage | epic | troop | 12s | 450 | 190 | 1.3s | 5 | 1 | both | **Chain** — attacks arc to 2 extra targets (×0.7 falloff) |
| Tempest Djinn | legendary | troop | 15s | 865 | 250 | 1s | 5 | 1.2 | both, flying |  |
| Chain Bolt | rare | spell | 5s | — | 150 | — | r 1.5 | — | area | **Chain** — jumps to 3 extra targets (×0.75 falloff) |

### Royal Court — unlocks at Royal Arena (2200 🏆)

| Card | Rarity | Type | Recharge | HP | Dmg | Hit | Range | Move | Targets | Mechanic |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Lancer Knight | common | troop | 6s | 595 | 85 | 1.1s | 1.2 | 1.4 | ground | **Charge** — first hit ×2 (re-arms while marching) |
| Royal Guard | common | troop | 8s | 925 | 110 | 1.1s | 1.2 | 1 | ground |  |
| Trumpeter | rare | troop | 7s | 370 | 35 | 1.1s | 4.5 | 1 | ground | **Rage aura** — allies within 3 attack/move ×1.25 |
| Crown Ballista | rare | building | 9s | 405 | 145 | 2.2s | 7.8 | — | both | 30s lifetime |
| Blademaster | epic | troop | 9s | 600 | 340 | 1.6s | 1.2 | 1.3 | ground |  |
| Duchess | epic | troop | 12s | 540 | 190 | 1s | 5 | 1 | both | **Rage aura** — allies within 2.5 attack/move ×1.2 |
| Paladin | legendary | troop | 15s | 2070 | 290 | 1.2s | 1.2 | 1.2 | ground |  |
| Royal Decree | rare | spell | 9s | — | — | — | r 3.5 | — | area | **Rage** — allies ×1.35 for 6s |
> Blademaster: **always unlocked** (starter/default content).

### Shadow Marsh — unlocks at Royal Arena (2200 🏆)

| Card | Rarity | Type | Recharge | HP | Dmg | Hit | Range | Move | Targets | Mechanic |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Bogling | common | troop | 4s | 65 ×3 | 45 | 1.1s | 1 | 1.4 | ground |  |
| Wraith | rare | troop | 7s | 395 | 245 | 1.6s | 1.2 | 1.5 | both | **Charge** — first hit ×2 (re-arms while marching) |
| Plague Doctor | rare | troop | 9s | 265 | 135 | 1.3s | 4.5 | 1 | both | **On-hit poison** — 3s, 30 dps; **Splash** (radius 1.3) |
| Bonepile | common | building | 8s | 465 | 0 | 0.9s | 5.5 | — | ground | **Spawner** — 2× Skeleton every 5s (max 6 alive); 30s lifetime |
| Necromancer | epic | troop | 12s | 375 | 190 | 1.3s | 5 | 1 | ground | **Spawner** — 2× Skeleton every 6s (max 4 alive) |
| Swamp Hulk | epic | troop | 14s | 2195 | 140 | 1.5s | 1.2 | 0.7 | ground | targets **buildings only** |
| Lich King | legendary | troop | 15s | 505 | 255 | 1.3s | 5.5 | 1 | both | **Chain** — attacks arc to 2 extra targets (×0.75 falloff) |
| Venom Cloud | rare | spell | 9s | — | — | — | r 3 | — | area | **Poison zone** — 6s, 35 dps |

### Desert Sands — unlocks at Legend League (3000 🏆)

| Card | Rarity | Type | Recharge | HP | Dmg | Hit | Range | Move | Targets | Mechanic |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Sandling | common | troop | 4s | 100 ×2 | 65 | 1.1s | 1 | 1.4 | ground |  |
| Scarab Swarm | common | troop | 6s | 100 ×3 | 65 | 1.1s | 1 | 1.5 | ground |  |
| Mummy Lord | rare | troop | 9s | 1145 | 130 | 1.1s | 1.2 | 1 | ground |  |
| Oasis Shrine | common | building | 10s | 580 | 0 | 0.9s | 4.5 | — | ground | **Healer** — heals the most-wounded ally 70 hp within 2; 30s lifetime |
| Scorpion Queen | epic | troop | 12s | 540 | 190 | 1s | 5.5 | 1 | both | **On-hit poison** — 2.5s, 25 dps |
| Sand Golem | epic | troop | 14s | 2195 | 140 | 1.5s | 1.2 | 0.7 | ground | targets **buildings only** |
| Mirage Assassin | legendary | troop | 11s | 790 | 445 | 1.6s | 1.2 | 1.7 | ground | **Charge** — first hit ×2.2 (re-arms while marching) |
| Sandstorm | rare | spell | 9s | — | 40 | — | r 3.5 | — | area | **Slow zone** — 5s, ×0.6 speed |

### Legend League — unlocks at Legend League (3000 🏆)

| Card | Rarity | Type | Recharge | HP | Dmg | Hit | Range | Move | Targets | Mechanic |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Runestone | common | building | 8s | 465 | 60 | 0.9s | 5.5 | — | both | 35s lifetime |
| Starcaller | rare | troop | 11s | 325 | 165 | 1.3s | 4.5 | 1 | both | **Splash** (radius 1.5) |
| Gryphon Rider | epic | troop | 12s | 1255 | 185 | 1.1s | 1.2 | 1.3 | both, flying |  |
| Arch Templar | epic | troop | 14s | 1805 | 255 | 1.2s | 1.2 | 1.1 | ground |  |
| Valkyrie Prime | legendary | troop | 13s | 1715 | 275 | 1.4s | 1.2 | 1.2 | ground | **Splash** (radius 1.8) |
| Titan Golem | legendary | troop | 16s | 2690 | 175 | 1.5s | 1.2 | 0.6 | ground | targets **buildings only** |
| Celestial Beam | epic | spell | 14s | — | 473 | — | r 2 | — | area |  |
| Worldtree Sap | rare | spell | 7s | — | — | — | r 3.5 | — | area | **Heal** — allies +250 hp |

### Spawner tokens (not collectible)

| Card | Rarity | Type | Recharge | HP | Dmg | Hit | Range | Move | Targets | Mechanic |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Hornet | common | troop | 4s | 60 | 40 | 1s | 1 | 1.5 | both, flying |  |
| Paper Glider | common | troop | 4s | 70 | 45 | 1.1s | 1 | 1.4 | ground, flying |  |
| Skeleton | common | troop | 4s | 65 | 50 | 1.1s | 1 | 1.3 | ground |  |

## Recommended pairs

Static combo hints (`shared/src/pairs.ts`) shown as badges in the trio picker:

- **Footman + Archers** — Classic duo: the Footman holds the line, Archers support from behind.
- **Colossus + Archers** — Tank + support: the Colossus soaks damage, Archers shoot from behind.
- **Colossus + Sharpshooter** — Tank + sniper: the Colossus leads, the Sharpshooter picks targets off.
- **Rat Pack + Bomb Thrower** — Bait + splash: the Rat Pack swarms, the Bomb Thrower clears the pile.
- **Blademaster + Volley** — Rush + cleanup: the Blademaster pressures, Volley finishes the rest.
- **Blademaster + Meteor** — Rush + burst: the Blademaster dives, Meteor lands the heavy hit.
- **Treant + Druidess** — Living wall: the Treant tanks while the Druidess keeps it healed.
- **Infernal Hound + Firestorm** — Burn them down: the Hound charges in, Firestorm roasts the defenders.
- **Snow Yeti + Blizzard** — Cold advance: the Yeti pushes while Blizzard slows every defender.
- **Storm Crow + Chain Bolt** — Sky assault: Storm Crows strike from above, Chain Bolt zaps the swarm answer.
- **Royal Guard + Trumpeter** — Royal march: the Guard holds formation, the Trumpeter keeps them enraged.
- **Necromancer + Venom Cloud** — Creeping death: skeletons swarm while Venom Cloud melts the defense.
- **Sand Golem + Scarab Swarm** — Desert wave: the Golem walks to towers, Scarabs eat whoever intercepts.
- **Titan Golem + Worldtree Sap** — Unbreakable: the Titan soaks damage, Worldtree Sap heals it back up.

## Balance model

Stats come from per-archetype budget formulas (`scripts/gen-catalog.mjs`):
`cooldownSec = 2×cost + rarity bump` (clamped 4..16), hp/dps budgets scale with
recharge and rarity. Ten shipped cards act as anchors; the balance harness
(`npx tsx scripts/balance-harness.mjs`) plays themed trios round-robin to spot
outliers. Tune the archetype constants, then regenerate — don't hand-edit rows.
