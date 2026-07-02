/**
 * Regenerates docs/CARDS.md from the shared catalog — the doc can never drift
 * from the data again.
 *
 * Usage:  npx tsx scripts/gen-cards-doc.mjs      (tsx: the catalog is TS source)
 */
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  CARDS, TOKEN_UNITS, THEMES, LEAGUES, RECOMMENDED_PAIRS, unlockLeagueIndex, ALWAYS_UNLOCKED,
} from '../shared/src/index.ts';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

/** One-phrase human description of a card's mechanic (ability or spell effect). */
function mechanic(c) {
  const extras = [];
  if (c.splashRadius) extras.push(`**Splash** (radius ${c.splashRadius})`);
  if (c.targetsBuildingsOnly) extras.push('targets **buildings only**');
  if (c.lifetimeSeconds) extras.push(`${c.lifetimeSeconds}s lifetime`);
  const base = describeMechanic(c);
  return [base, ...extras].filter(Boolean).join('; ');
}

function describeMechanic(c) {
  const a = c.ability;
  if (a) {
    switch (a.kind) {
      case 'charge': return `**Charge** — first hit ×${a.firstHitMult}${a.rearmSeconds ? ` (re-arms after ${a.rearmSeconds}s out of combat)` : ' (re-arms while marching)'}`;
      case 'healer': return `**Healer** — heals the most-wounded ally ${a.healPerHit} hp${a.healRadius ? ` within ${a.healRadius}` : ''}`;
      case 'chain': return `**Chain** — attacks arc to ${a.jumps} extra targets (×${a.falloff} falloff)`;
      case 'spawner': return `**Spawner** — ${a.count}× ${TOKEN_UNITS[a.unit]?.name ?? a.unit} every ${a.everySeconds}s (max ${a.maxAlive} alive)`;
      case 'rageAura': return `**Rage aura** — allies within ${a.radius} attack/move ×${a.factor}`;
      case 'onHitStatus': return `**On-hit ${a.status}** — ${a.seconds}s${a.status === 'poison' ? `, ${a.magnitude} dps` : a.status === 'slow' ? `, ×${a.magnitude} speed` : ''}`;
    }
  }
  const e = c.effect;
  if (e) {
    switch (e.kind) {
      case 'zone': return `**${cap(e.status)} zone** — ${e.zoneSeconds}s${e.status === 'poison' ? `, ${e.magnitude} dps` : `, ×${e.magnitude} speed`}`;
      case 'root': return `**Root** — pins ground units ${e.seconds}s (flyers immune)`;
      case 'knockback': return `**Knockback** — pushes ${e.tiles} tiles + ${e.stunSeconds}s stun`;
      case 'heal': return `**Heal** — allies +${e.amount} hp`;
      case 'rage': return `**Rage** — allies ×${e.factor} for ${e.seconds}s`;
      case 'shield': return `**Shield** — absorbs ${e.amount} dmg for ${e.seconds}s`;
      case 'chain': return `**Chain** — jumps to ${e.jumps} extra targets (×${e.falloff} falloff)`;
    }
  }
  return '';
}

function row(c) {
  const hp = c.type === 'spell' ? '—' : `${c.hp}${c.count && c.count > 1 ? ` ×${c.count}` : ''}`;
  const dmg = c.type === 'spell' ? (c.spellDamage ? String(c.spellDamage) : '—') : String(c.damage ?? '—');
  const hit = c.type === 'spell' ? '—' : `${c.hitSpeed}s`;
  const range = c.type === 'spell' ? `r ${c.spellRadius}` : String(c.range ?? '—');
  const move = c.type === 'troop' ? String(c.moveSpeed) : '—';
  const targets = c.type === 'spell' ? 'area' : `${c.targets}${c.flying ? ', flying' : ''}`;
  return `| ${c.name} | ${c.rarity} | ${c.type} | ${c.cooldownSec}s | ${hp} | ${dmg} | ${hit} | ${range} | ${move} | ${targets} | ${mechanic(c)} |`;
}

const HEADER = `# Card Catalog — 80 cards (build-15)

> **Generated** from \`shared/src/cards.ts\` by \`npx tsx scripts/gen-cards-doc.mjs\` — edit the
> data, not this file. All cards are **original** archetypes; art prompts live in
> [ART_PROMPT.ru.md](ART_PROMPT.ru.md).

Every card has a per-card **recharge** (\`cooldownSec\`, the active economy since
build-14) plus a legacy elixir \`cost\` for the flag-selected legacy mode. Stats
below are level 1; levels scale hp/damage by +10% per level compounding.

## Unlocks by league

Cards unlock with arena progression (\`shared/src/unlocks.ts\`): each theme is tied
to a league; battle-chest drops come only from unlocked cards, and the battle trio
may only contain unlocked cards (checked on save). Everything the onboarding hands
out (starter pool + default trio/deck) is **always unlocked**.

| League (min 🏆) | Themes |
| --- | --- |
${LEAGUES.map((lg, i) => {
  const themes = THEMES.filter((t) => t.leagueIndex === i).map((t) => t.theme);
  return themes.length ? `| ${lg.en} (${lg.min}) | ${themes.join(' + ')} |` : null;
}).filter(Boolean).join('\n')}
`;

const TABLE_HEAD = `| Card | Rarity | Type | Recharge | HP | Dmg | Hit | Range | Move | Targets | Mechanic |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |`;

const sections = THEMES.map((t) => {
  const league = LEAGUES[t.leagueIndex];
  const rows = t.cardIds.map((id) => row(CARDS[id])).join('\n');
  const grandfathered = t.cardIds.filter((id) => ALWAYS_UNLOCKED.has(id) && t.leagueIndex > 0);
  const gnote = grandfathered.length
    ? `\n> ${grandfathered.map((id) => CARDS[id].name).join(', ')}: **always unlocked** (starter/default content).`
    : '';
  return `### ${t.theme} — unlocks at ${league.en} (${league.min} 🏆)\n\n${TABLE_HEAD}\n${rows}${gnote}`;
}).join('\n\n');

const tokens = Object.values(TOKEN_UNITS).map((c) => row(c)).join('\n');

const pairs = RECOMMENDED_PAIRS
  .map((p) => `- **${CARDS[p.cards[0]].name} + ${CARDS[p.cards[1]].name}** — ${p.en}`)
  .join('\n');

const doc = `${HEADER}
## Mechanics legend

- **Charge / Assassin** — the armed first hit deals bonus damage; re-arms while marching.
- **Healer** — heals the most-wounded nearby ally instead of idling (never itself or towers).
- **Spawner** — buildings/troops that periodically produce token units (tokens are not collectible).
- **Chain** — attacks/spells arc to nearby extra targets with damage falloff.
- **Rage aura / Rage** — attack & move speed multiplier while active.
- **Statuses** — slow, root (flyers immune), stun, poison (dps), shield (damage pool), rage.
- **Zones** — ground areas that keep applying a status; effects linger 0.5s after leaving.

## Roster by theme

${sections}

### Spawner tokens (not collectible)

${TABLE_HEAD}
${tokens}

## Recommended pairs

Static combo hints (\`shared/src/pairs.ts\`) shown as badges in the trio picker:

${pairs}

## Balance model

Stats come from per-archetype budget formulas (\`scripts/gen-catalog.mjs\`):
\`cooldownSec = 2×cost + rarity bump\` (clamped 4..16), hp/dps budgets scale with
recharge and rarity. Ten shipped cards act as anchors; the balance harness
(\`npx tsx scripts/balance-harness.mjs\`) plays themed trios round-robin to spot
outliers. Tune the archetype constants, then regenerate — don't hand-edit rows.
`;

writeFileSync(path.join(ROOT, 'docs/CARDS.md'), doc);
console.log(`docs/CARDS.md regenerated: ${Object.keys(CARDS).length} cards, ${THEMES.length} themes, ${RECOMMENDED_PAIRS.length} pairs.`);
