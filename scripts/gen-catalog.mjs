/**
 * Catalog generator: prints the TypeScript entries for the 70 expansion cards
 * (themes 2-10 of docs/ART_PROMPT.ru.md) from archetype formulas calibrated on
 * the 10 shipped anchors. Usage: node scripts/gen-catalog.mjs > /tmp/cards.txt
 *
 * This is a REFERENCE/REBALANCE tool: the generated entries live in
 * shared/src/cards.ts as plain data; rerun and diff when retuning archetypes.
 */

const RARITY_MULT = { C: 1.0, R: 1.05, E: 1.12, L: 1.2 };
const RARITY_BUMP = { C: 0, R: 1, E: 2, L: 3 };
const RARITY_NAME = { C: 'common', R: 'rare', E: 'epic', L: 'legendary' };

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const cdOf = (cost, r) => clamp(2 * cost + RARITY_BUMP[r], 4, 16);

/**
 * Archetype budgets (totals across `count`), calibrated so the shipped cards
 * fall out of the same math: footman≈700/73dps, ratpack≈250hp/150dps,
 * archers≈260hp/100dps, colossus≈2200hp/87dps, bastion 700/100, meteor 360.
 */
const ARCH = {
  warrior:  { hp: 110, dps: 12.5, range: 1.2, ms: 1.0, hit: 1.1 },
  bruiser:  { hp: 115, dps: 13.5, range: 1.2, ms: 1.1, hit: 1.2 },
  burst:    { hp: 60,  dps: 21,   range: 1.2, ms: 1.4, hit: 1.6 }, // blademaster-like, assassins
  swarm:    { hp: 50,  dps: 30,   range: 1.0, ms: 1.4, hit: 1.1 },
  ranged:   { hp: 40,  dps: 14,   range: 5.0, ms: 1.0, hit: 1.0 },
  splash:   { hp: 28,  dps: 11,   range: 4.5, ms: 1.0, hit: 1.3 }, // splash/caster ranged
  tank:     { hp: 140, dps: 6,    range: 1.2, ms: 0.7, hit: 1.5 },
  defense:  { hp: 58,  dps: 8.3,  range: 5.5, ms: 0,   hit: 0.9 }, // buildings
  siege:    { hp: 45,  dps: 7,    range: 7.8, ms: 0,   hit: 2.2 },
  support:  { hp: 50,  dps: 9,    range: 4.5, ms: 1.0, hit: 1.1 },
};

/**
 * Roster (themes 2-10). Each entry: overrides merged over the archetype:
 * [id, name, rarity, type, role, cost, archetype, overrides]
 */
const ROSTER = [
  // --- Тема 1 — Training Grounds (единственная новая карта темы) ---
  ['recruit', 'Recruit', 'C', 'troop', 'Swarm', 2, 'swarm', { count: 2, ms: 1.2, color: 0xd7b98a }],

  // --- Тема 2 — Forest Clearing ---
  ['thornling', 'Thornling', 'C', 'troop', 'Swarm', 2, 'swarm', { count: 3, color: 0x7cb342 }],
  ['wolfpack', 'Wolf Pack', 'C', 'troop', 'Swarm', 3, 'swarm', { count: 3, ms: 1.5, color: 0x90a4ae }],
  ['boarrider', 'Boar Rider', 'R', 'troop', 'Charger', 4, 'warrior', {
    hpMult: 0.9, ms: 1.3, color: 0x8d6e63,
    ability: { kind: 'charge', speedMult: 1.5, firstHitMult: 2.0 } }],
  ['druidess', 'Druidess', 'R', 'troop', 'Healer', 4, 'ranged', {
    hpMult: 1.1, dpsMult: 0.4, targets: 'both', color: 0x81c784,
    ability: { kind: 'healer', healPerHit: 95 } }],
  ['beehive', 'Beehive', 'C', 'building', 'Spawner', 5, 'defense', {
    dps: 0, lifetime: 30, color: 0xffb300,
    ability: { kind: 'spawner', unit: 'hornet', count: 1, everySeconds: 3.5, maxAlive: 4 } }],
  ['entangle', 'Entangle', 'R', 'spell', 'Control', 2, null, {
    spellRadius: 2.5, spellDamage: 0, color: 0x558b2f,
    effect: { kind: 'root', seconds: 2.5 } }],
  ['treant', 'Treant', 'E', 'troop', 'Tank', 6, 'tank', { color: 0x6d4c41 }],
  ['greenwarden', 'Greenwarden', 'L', 'troop', 'Bruiser', 5, 'bruiser', { color: 0x33691e }],

  // --- Тема 3 — Stone Fort ---
  ['shieldguard', 'Shieldguard', 'C', 'troop', 'Warrior', 3, 'warrior', { hpMult: 1.15, dpsMult: 0.85, ms: 0.9, color: 0x78909c }],
  ['crossbowman', 'Crossbowman', 'R', 'troop', 'Ranged', 4, 'ranged', { range: 5.5, targets: 'both', color: 0x5d4037 }],
  ['battering_ram', 'Battering Ram', 'R', 'troop', 'Charger', 4, 'warrior', {
    hpMult: 1.0, ms: 1.2, targetsBuildingsOnly: true, color: 0x4e342e,
    ability: { kind: 'charge', speedMult: 1.5, firstHitMult: 2.2 } }],
  ['cannon_tower', 'Cannon Tower', 'C', 'building', 'Defense', 4, 'defense', { lifetime: 30, color: 0x616161 }],
  ['catapult', 'Catapult', 'E', 'building', 'Siege', 5, 'siege', { splash: 1.6, hit: 2.5, lifetime: 30, color: 0x795548 }],
  ['ironclad', 'Ironclad', 'L', 'troop', 'Tank', 7, 'tank', { ms: 0.6, color: 0x455a64 }],
  ['fortify', 'Fortify', 'R', 'spell', 'Buff', 3, null, {
    spellRadius: 3, spellDamage: 0, color: 0xffd54a,
    effect: { kind: 'shield', amount: 320, seconds: 8 } }],

  // --- Тема 4 — Fire Forge ---
  ['emberling', 'Emberling', 'C', 'troop', 'Swarm', 2, 'swarm', { count: 2, color: 0xff7043 }],
  ['flame_knight', 'Flame Knight', 'R', 'troop', 'Warrior', 4, 'warrior', { color: 0xe64a19 }],
  ['pyromancer', 'Pyromancer', 'R', 'troop', 'Splash', 4, 'splash', { splash: 1.4, targets: 'both', color: 0xff5722 }],
  ['forge_turret', 'Forge Turret', 'C', 'building', 'Defense', 4, 'defense', { lifetime: 30, color: 0xbf360c }],
  ['magmaback', 'Magmaback', 'E', 'troop', 'Tank', 6, 'tank', { color: 0xd84315 }],
  ['infernal_hound', 'Infernal Hound', 'L', 'troop', 'Charger', 4, 'warrior', {
    hpMult: 0.9, ms: 1.4, color: 0xbf360c,
    ability: { kind: 'charge', speedMult: 1.6, firstHitMult: 2.0 } }],
  ['firestorm', 'Firestorm', 'R', 'spell', 'DoT', 4, null, {
    spellRadius: 2.5, spellDamage: 40, color: 0xff6d00,
    effect: { kind: 'zone', status: 'poison', magnitude: 40, zoneSeconds: 5 } }],

  // --- Тема 5 — Frost Peak ---
  ['frostling', 'Frostling', 'C', 'troop', 'Swarm', 2, 'swarm', { count: 3, color: 0x81d4fa }],
  ['snowball_giant', 'Snowball Giant', 'C', 'troop', 'Charger', 4, 'warrior', {
    hpMult: 1.1, ms: 1.2, color: 0xe1f5fe,
    ability: { kind: 'charge', speedMult: 1.4, firstHitMult: 1.8 } }],
  ['icebreaker', 'Icebreaker', 'R', 'troop', 'Warrior', 4, 'warrior', { color: 0x4fc3f7 }],
  ['frost_archer', 'Frost Archer', 'R', 'troop', 'Ranged', 4, 'ranged', {
    targets: 'both', color: 0x29b6f6,
    ability: { kind: 'onHitStatus', status: 'slow', magnitude: 0.65, seconds: 1.5 } }],
  ['glacier_wall', 'Glacier Wall', 'C', 'building', 'Defense', 5, 'defense', {
    hpMult: 2.2, dps: 0, lifetime: 30, color: 0xb3e5fc }],
  ['snow_yeti', 'Snow Yeti', 'E', 'troop', 'Tank', 6, 'tank', { color: 0xeceff1 }],
  ['winterborn', 'Winterborn', 'L', 'troop', 'Caster', 5, 'splash', {
    range: 5, targets: 'both', color: 0x40c4ff,
    ability: { kind: 'onHitStatus', status: 'slow', magnitude: 0.6, seconds: 2 } }],
  ['blizzard', 'Blizzard', 'R', 'spell', 'Slow', 3, null, {
    spellRadius: 3, spellDamage: 60, color: 0x81d4fa,
    effect: { kind: 'zone', status: 'slow', magnitude: 0.55, zoneSeconds: 4 } }],

  // --- Тема 6 — Storm Arena ---
  ['zaplet', 'Zaplet', 'C', 'troop', 'Swarm', 2, 'swarm', { count: 2, targets: 'both', color: 0xffee58 }],
  ['stormcrow', 'Storm Crow', 'C', 'troop', 'Air', 3, 'swarm', { count: 3, hpMult: 0.9, flying: true, targets: 'both', ms: 1.4, color: 0x5c6bc0 }],
  ['skylancer', 'Skylancer', 'R', 'troop', 'Air', 4, 'warrior', { hpMult: 0.8, flying: true, targets: 'both', ms: 1.3, color: 0x7986cb }],
  ['galestrike', 'Galestrike', 'R', 'spell', 'Knockback', 3, null, {
    spellRadius: 3, spellDamage: 60, color: 0x90caf9,
    effect: { kind: 'knockback', tiles: 2.5, stunSeconds: 0.8 } }],
  ['windmill_tower', 'Windmill Tower', 'C', 'building', 'Spawner', 5, 'defense', {
    dps: 0, lifetime: 30, color: 0xa1887f,
    ability: { kind: 'spawner', unit: 'glider', count: 1, everySeconds: 4, maxAlive: 4 } }],
  ['thunder_mage', 'Thunder Mage', 'E', 'troop', 'Chain', 5, 'splash', {
    splash: 0, range: 5, targets: 'both', color: 0xfff176,
    ability: { kind: 'chain', jumps: 2, falloff: 0.7 } }],
  ['tempest_djinn', 'Tempest Djinn', 'L', 'troop', 'Air', 6, 'ranged', { hpMult: 1.2, flying: true, targets: 'both', ms: 1.2, color: 0x4dd0e1 }],
  ['chain_bolt', 'Chain Bolt', 'R', 'spell', 'Chain', 2, null, {
    spellRadius: 1.5, spellDamage: 150, color: 0xffee58,
    effect: { kind: 'chain', jumps: 3, falloff: 0.75 } }],

  // --- Тема 7 — Royal Court ---
  ['lancer_knight', 'Lancer Knight', 'C', 'troop', 'Charger', 3, 'warrior', {
    hpMult: 0.9, ms: 1.4, color: 0xfdd835,
    ability: { kind: 'charge', speedMult: 1.5, firstHitMult: 2.0 } }],
  ['royal_guard', 'Royal Guard', 'C', 'troop', 'Warrior', 4, 'warrior', { hpMult: 1.05, color: 0xf9a825 }],
  ['trumpeter', 'Trumpeter', 'R', 'troop', 'Buff', 3, 'support', {
    dpsMult: 0.5, color: 0xffca28,
    ability: { kind: 'rageAura', radius: 3, factor: 1.25 } }],
  ['crown_ballista', 'Crown Ballista', 'R', 'building', 'Siege', 4, 'siege', { targets: 'both', lifetime: 30, color: 0xffb300 }],
  ['duchess', 'Duchess', 'E', 'troop', 'Support', 5, 'ranged', {
    targets: 'both', color: 0xffd54a,
    ability: { kind: 'rageAura', radius: 2.5, factor: 1.2 } }],
  ['paladin', 'Paladin', 'L', 'troop', 'Bruiser', 6, 'bruiser', { ms: 1.2, color: 0xffe082 }],
  ['royal_decree', 'Royal Decree', 'R', 'spell', 'Rage', 4, null, {
    spellRadius: 3.5, spellDamage: 0, color: 0xffc107,
    effect: { kind: 'rage', factor: 1.35, seconds: 6 } }],

  // --- Тема 8 — Shadow Marsh ---
  ['bogling', 'Bogling', 'C', 'troop', 'Swarm', 2, 'swarm', { count: 3, color: 0x689f38 }],
  ['wraith', 'Wraith', 'R', 'troop', 'Assassin', 3, 'burst', {
    hpMult: 0.9, ms: 1.5, targets: 'both', color: 0x9575cd,
    ability: { kind: 'charge', speedMult: 1.2, firstHitMult: 2.0 } }],
  ['plague_doctor', 'Plague Doctor', 'R', 'troop', 'Poison', 4, 'splash', {
    splash: 1.3, targets: 'both', color: 0x7cb342,
    ability: { kind: 'onHitStatus', status: 'poison', magnitude: 30, seconds: 3 } }],
  ['bonepile', 'Bonepile', 'C', 'building', 'Spawner', 4, 'defense', {
    dps: 0, lifetime: 30, color: 0xbdbdbd,
    ability: { kind: 'spawner', unit: 'skeleton', count: 2, everySeconds: 5, maxAlive: 6 } }],
  ['necromancer', 'Necromancer', 'E', 'troop', 'Spawner', 5, 'splash', {
    splash: 0, range: 5, color: 0x6a1b9a,
    ability: { kind: 'spawner', unit: 'skeleton', count: 2, everySeconds: 6, maxAlive: 4 } }],
  ['swamp_hulk', 'Swamp Hulk', 'E', 'troop', 'Tank', 6, 'tank', { color: 0x33691e }],
  ['lich_king', 'Lich King', 'L', 'troop', 'Caster', 6, 'splash', {
    splash: 0, range: 5.5, targets: 'both', color: 0x4527a0,
    ability: { kind: 'chain', jumps: 2, falloff: 0.75 } }],
  ['venom_cloud', 'Venom Cloud', 'R', 'spell', 'DoT', 4, null, {
    spellRadius: 3, spellDamage: 0, color: 0x8bc34a,
    effect: { kind: 'zone', status: 'poison', magnitude: 35, zoneSeconds: 6 } }],

  // --- Тема 9 — Desert Sands ---
  ['sandling', 'Sandling', 'C', 'troop', 'Swarm', 2, 'swarm', { count: 2, color: 0xffcc80 }],
  ['scarab_swarm', 'Scarab Swarm', 'C', 'troop', 'Swarm', 3, 'swarm', { count: 3, ms: 1.5, color: 0x8d6e63 }],
  ['mummy_lord', 'Mummy Lord', 'R', 'troop', 'Warrior', 4, 'warrior', { hpMult: 1.1, color: 0xd7ccc8 }],
  ['oasis_shrine', 'Oasis Shrine', 'C', 'building', 'Healer', 5, 'defense', {
    dps: 0, range: 4.5, lifetime: 30, color: 0x4dd0e1,
    ability: { kind: 'healer', healPerHit: 70, healRadius: 2 } }],
  ['scorpion_queen', 'Scorpion Queen', 'E', 'troop', 'Ranged', 5, 'ranged', {
    range: 5.5, targets: 'both', color: 0xef6c00,
    ability: { kind: 'onHitStatus', status: 'poison', magnitude: 25, seconds: 2.5 } }],
  ['sand_golem', 'Sand Golem', 'E', 'troop', 'Tank', 6, 'tank', { color: 0xffb74d }],
  ['mirage_assassin', 'Mirage Assassin', 'L', 'troop', 'Assassin', 4, 'burst', {
    ms: 1.7, color: 0xffe0b2,
    ability: { kind: 'charge', speedMult: 1.25, firstHitMult: 2.2 } }],
  ['sandstorm', 'Sandstorm', 'R', 'spell', 'Slow', 4, null, {
    spellRadius: 3.5, spellDamage: 40, color: 0xffcc80,
    effect: { kind: 'zone', status: 'slow', magnitude: 0.6, zoneSeconds: 5 } }],

  // --- Тема 10 — Legend League ---
  ['runestone', 'Runestone', 'C', 'building', 'Defense', 4, 'defense', { targets: 'both', lifetime: 35, color: 0x7e57c2 }],
  ['starcaller', 'Starcaller', 'R', 'troop', 'Caster', 5, 'splash', { splash: 1.5, targets: 'both', color: 0x9fa8da }],
  ['gryphon_rider', 'Gryphon Rider', 'E', 'troop', 'Air', 5, 'warrior', { hpMult: 0.85, flying: true, targets: 'both', ms: 1.3, color: 0xfff59d }],
  ['arch_templar', 'Arch Templar', 'E', 'troop', 'Bruiser', 6, 'bruiser', { color: 0xffecb3 }],
  ['valkyrie_prime', 'Valkyrie Prime', 'L', 'troop', 'Splash', 5, 'warrior', { splash: 1.8, hit: 1.4, ms: 1.2, color: 0xf48fb1 }],
  ['titan_golem', 'Titan Golem', 'L', 'troop', 'Tank', 8, 'tank', { ms: 0.6, color: 0x90a4ae }],
  ['celestial_beam', 'Celestial Beam', 'E', 'spell', 'Damage', 6, null, { spellRadius: 2, spellDamage: 0, color: 0xfff9c4 }],
  ['worldtree_sap', 'Worldtree Sap', 'R', 'spell', 'Heal', 3, null, {
    spellRadius: 3.5, spellDamage: 0, color: 0xaed581,
    effect: { kind: 'heal', amount: 250 } }],
];

function fmtAbility(obj) {
  const parts = Object.entries(obj).map(([k, v]) =>
    `${k}: ${typeof v === 'string' ? `'${v}'` : v}`);
  return `{ ${parts.join(', ')} }`;
}

const lines = [];
let theme = '';
for (const [id, name, r, type, role, cost, arch, ov = {}] of ROSTER) {
  const cd = cdOf(cost, r);
  const R = RARITY_MULT[r];
  const rarity = RARITY_NAME[r];
  const color = `0x${(ov.color ?? 0x9e9e9e).toString(16).padStart(6, '0')}`;

  if (type === 'spell') {
    let dmg = ov.spellDamage;
    if (dmg === 0 && role === 'Damage') {
      dmg = Math.round(27 * cd * R * Math.sqrt(2.5 / ov.spellRadius));
    }
    let l = `  ${id}: {\n    id: '${id}', name: '${name}', type: 'spell', rarity: '${rarity}', role: '${role}', cost: ${cost}, cooldownSec: ${cd}, color: ${color},\n    spellRadius: ${ov.spellRadius}, spellDamage: ${dmg},`;
    if (ov.effect) l += `\n    effect: ${fmtAbility(ov.effect)},`;
    l += `\n  },`;
    lines.push(l);
    continue;
  }

  const a = ARCH[arch];
  const count = ov.count ?? 1;
  const hpTotal = a.hp * cd * (type === 'building' && !ov.hpMult ? 1 : R) * (ov.hpMult ?? 1);
  const rawDps = ov.dps !== undefined ? ov.dps * cd : a.dps * cd * R * (ov.dpsMult ?? 1);
  const hit = ov.hit ?? a.hit;
  const hp = Math.round(hpTotal / count / 5) * 5;
  const damage = Math.round((rawDps * hit) / count / 5) * 5;
  const ms = ov.ms ?? a.ms;
  const range = ov.range ?? a.range;
  const targets = ov.targets ?? (a.range > 2 ? 'ground' : 'ground');

  let l = `  ${id}: {\n    id: '${id}', name: '${name}', type: '${type}', rarity: '${rarity}', role: '${role}', cost: ${cost}, cooldownSec: ${cd}, color: ${color},\n    hp: ${hp}, damage: ${damage}, hitSpeed: ${hit}, range: ${range}, moveSpeed: ${ms}, targets: '${targets}',`;
  if (count > 1) l += ` count: ${count},`;
  if (ov.flying) l += ` flying: true,`;
  // Big tanks march past troops to towers, colossus-style (they also never intercept).
  if (ov.targetsBuildingsOnly || arch === 'tank') l += ` targetsBuildingsOnly: true,`;
  if (ov.splash) l += ` splashRadius: ${ov.splash},`;
  if (ov.lifetime) l += ` lifetimeSeconds: ${ov.lifetime},`;
  if (ov.ability) l += `\n    ability: ${fmtAbility(ov.ability)},`;
  l += `\n  },`;
  lines.push(l);
}

console.log(lines.join('\n'));
