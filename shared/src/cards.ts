/**
 * Card catalog. All cards are ORIGINAL designs (generic archetypes) — no Supercell
 * names, art or assets. This file is the source of truth for seed data.
 * See docs/CARDS.md for the human-readable catalog.
 */

export type CardType = 'troop' | 'spell' | 'building';
export type TargetKind = 'ground' | 'air' | 'both';
export type Rarity = 'common' | 'rare' | 'epic' | 'legendary';

/** Status kinds carried by entities (the unified mechanic backbone). */
export type StatusKind = 'slow' | 'root' | 'stun' | 'rage' | 'shield' | 'poison';

/**
 * One optional ability per troop/building card. Everything is data-driven —
 * the simulation switches on `kind`, so new cards never need new code paths.
 */
export type TroopAbility =
  /** Chargers AND assassins: boosted speed + a heavy first hit, re-arms while marching. */
  | { kind: 'charge'; speedMult: number; firstHitMult: number; rearmSeconds?: number }
  /** Heals the most-wounded ally in range instead of attacking (healRadius > 0 = AoE heal). */
  | { kind: 'healer'; healPerHit: number; healRadius?: number }
  /** Attacks arc to up to `jumps` extra targets, each hit dealing damage×falloff^n. */
  | { kind: 'chain'; jumps: number; falloff: number }
  /** Periodically spawns token units that march down the lane. */
  | { kind: 'spawner'; unit: string; count: number; everySeconds: number; maxAlive: number }
  /** Aura that keeps nearby allied units raging (speed & attack rate ×factor). */
  | { kind: 'rageAura'; radius: number; factor: number }
  /** Each hit applies a status to the target (poison = dps, slow = speed factor). */
  | { kind: 'onHitStatus'; status: 'poison' | 'slow'; magnitude: number; seconds: number };

/** One optional effect per spell (applied after spellDamage, which may be 0). */
export type SpellEffect =
  /** Lingering area: poison (magnitude = dps) or slow (magnitude = speed factor). */
  | { kind: 'zone'; status: 'poison' | 'slow'; magnitude: number; zoneSeconds: number }
  /** Immobilize enemies in the blast (flyers are immune). */
  | { kind: 'root'; seconds: number }
  /** Shove enemies away from the impact point and briefly stun them. */
  | { kind: 'knockback'; tiles: number; stunSeconds: number }
  /** Heal ALLIED units in the blast (capped at maxHp). */
  | { kind: 'heal'; amount: number }
  /** Enrage ALLIED units in the blast (speed & attack rate ×factor). */
  | { kind: 'rage'; factor: number; seconds: number }
  /** Grant ALLIED units a damage-absorbing shield pool. */
  | { kind: 'shield'; amount: number; seconds: number }
  /** spellDamage arcs from the nearest enemy through up to `jumps` more. */
  | { kind: 'chain'; jumps: number; falloff: number };

export interface CardDef {
  id: string;
  name: string;
  type: CardType;
  rarity: Rarity;
  role: string; // short descriptor shown on the card (e.g. "Warrior", "Spell")
  cost: number; // elixir (legacy economy — kept for the rollback path)
  /**
   * Per-card recharge in seconds (cooldown economy). Every card carries BOTH
   * cost and cooldownSec so the economy flag can flip either way (GDD
   * reversibility). Placeholder values are derived from the old elixir cost
   * (cheaper -> shorter) anchored to the prototype (melee 6s / ranged 8s /
   * big tank 14s); full tuning happens in the rebalance pass.
   */
  cooldownSec: number;
  /** Visual tint used by the placeholder renderer (no external assets). */
  color: number;

  // Troop / building combat stats (ignored for spells)
  hp?: number;
  damage?: number;
  hitSpeed?: number; // seconds between hits
  range?: number; // tiles (melee ~1.2)
  moveSpeed?: number; // tiles per second (0 for buildings)
  targets?: TargetKind;
  flying?: boolean; // this unit flies (can only be hit by air-capable attackers)
  count?: number; // how many bodies spawn
  targetsBuildingsOnly?: boolean; // e.g. tanks that walk past troops to towers
  splashRadius?: number; // >0 means area damage on hit
  lifetimeSeconds?: number; // buildings decay over time

  // Spell stats (ignored for troops/buildings)
  spellRadius?: number;
  spellDamage?: number;

  // Optional mechanic (data-driven; see TroopAbility / SpellEffect)
  ability?: TroopAbility;
  effect?: SpellEffect;
}

export const CARDS: Record<string, CardDef> = {
  footman: {
    id: 'footman', name: 'Footman', type: 'troop', rarity: 'common', role: 'Warrior', cost: 3, cooldownSec: 6, color: 0x8d6e63,
    hp: 700, damage: 80, hitSpeed: 1.1, range: 1.2, moveSpeed: 1.0, targets: 'ground', count: 1,
  },
  archers: {
    id: 'archers', name: 'Archers', type: 'troop', rarity: 'common', role: 'Ranged', cost: 3, cooldownSec: 7, color: 0x66bb6a,
    hp: 130, damage: 50, hitSpeed: 1.0, range: 5.0, moveSpeed: 1.0, targets: 'both', count: 2,
  },
  colossus: {
    id: 'colossus', name: 'Colossus', type: 'troop', rarity: 'epic', role: 'Tank', cost: 6, cooldownSec: 14, color: 0xffa726,
    hp: 2200, damage: 130, hitSpeed: 1.5, range: 1.2, moveSpeed: 0.7, targets: 'ground', count: 1,
    targetsBuildingsOnly: true,
  },
  ratpack: {
    id: 'ratpack', name: 'Rat Pack', type: 'troop', rarity: 'common', role: 'Swarm', cost: 2, cooldownSec: 5, color: 0x90a4ae,
    hp: 80, damage: 55, hitSpeed: 1.1, range: 1.0, moveSpeed: 1.4, targets: 'ground', count: 3,
  },
  sharpshooter: {
    id: 'sharpshooter', name: 'Sharpshooter', type: 'troop', rarity: 'rare', role: 'Ranged', cost: 4, cooldownSec: 8, color: 0xef5350,
    hp: 340, damage: 110, hitSpeed: 1.0, range: 6.0, moveSpeed: 1.0, targets: 'both', count: 1,
  },
  blademaster: {
    id: 'blademaster', name: 'Blademaster', type: 'troop', rarity: 'epic', role: 'Warrior', cost: 4, cooldownSec: 9, color: 0xab47bc,
    hp: 600, damage: 340, hitSpeed: 1.6, range: 1.2, moveSpeed: 1.3, targets: 'ground', count: 1,
  },
  bombthrower: {
    id: 'bombthrower', name: 'Bomb Thrower', type: 'troop', rarity: 'rare', role: 'Splash', cost: 4, cooldownSec: 9, color: 0x5c6bc0,
    hp: 240, damage: 130, hitSpeed: 1.3, range: 4.5, moveSpeed: 1.0, targets: 'ground', count: 1,
    splashRadius: 1.5,
  },
  bastion: {
    id: 'bastion', name: 'Bastion', type: 'building', rarity: 'common', role: 'Building', cost: 5, cooldownSec: 12, color: 0x78909c,
    hp: 700, damage: 90, hitSpeed: 0.9, range: 5.5, moveSpeed: 0, targets: 'ground', count: 1,
    lifetimeSeconds: 30,
  },
  meteor: {
    id: 'meteor', name: 'Meteor', type: 'spell', rarity: 'epic', role: 'Spell', cost: 5, cooldownSec: 12, color: 0xff7043,
    spellRadius: 2.5, spellDamage: 360,
  },
  volley: {
    id: 'volley', name: 'Volley', type: 'spell', rarity: 'rare', role: 'Spell', cost: 3, cooldownSec: 8, color: 0x26c6da,
    spellRadius: 4.0, spellDamage: 150,
  },

  // --- Expansion catalog (build-15): themes 1-10 of docs/ART_PROMPT.ru.md.
  // Stats come from the archetype formulas in scripts/gen-catalog.mjs -
  // rerun that script and diff when rebalancing.
  recruit: {
    id: 'recruit', name: 'Recruit', type: 'troop', rarity: 'common', role: 'Swarm', cost: 2, cooldownSec: 4, color: 0xd7b98a,
    hp: 100, damage: 65, hitSpeed: 1.1, range: 1, moveSpeed: 1.2, targets: 'ground', count: 2,
  },
  thornling: {
    id: 'thornling', name: 'Thornling', type: 'troop', rarity: 'common', role: 'Swarm', cost: 2, cooldownSec: 4, color: 0x7cb342,
    hp: 65, damage: 45, hitSpeed: 1.1, range: 1, moveSpeed: 1.4, targets: 'ground', count: 3,
  },
  wolfpack: {
    id: 'wolfpack', name: 'Wolf Pack', type: 'troop', rarity: 'common', role: 'Swarm', cost: 3, cooldownSec: 6, color: 0x90a4ae,
    hp: 120, damage: 70, hitSpeed: 1.1, range: 1, moveSpeed: 1.5, targets: 'ground', count: 3,
  },
  boarrider: {
    id: 'boarrider', name: 'Boar Rider', type: 'troop', rarity: 'rare', role: 'Charger', cost: 4, cooldownSec: 9, color: 0x8d6e63,
    hp: 935, damage: 130, hitSpeed: 1.1, range: 1.2, moveSpeed: 1.3, targets: 'ground',
    ability: { kind: 'charge', speedMult: 1.5, firstHitMult: 2 },
  },
  druidess: {
    id: 'druidess', name: 'Druidess', type: 'troop', rarity: 'rare', role: 'Healer', cost: 4, cooldownSec: 9, color: 0x81c784,
    hp: 415, damage: 55, hitSpeed: 1, range: 5, moveSpeed: 1, targets: 'both',
    ability: { kind: 'healer', healPerHit: 130 },
  },
  beehive: {
    id: 'beehive', name: 'Beehive', type: 'building', rarity: 'common', role: 'Spawner', cost: 5, cooldownSec: 10, color: 0xffb300,
    hp: 580, damage: 0, hitSpeed: 0.9, range: 5.5, moveSpeed: 0, targets: 'ground', lifetimeSeconds: 30,
    ability: { kind: 'spawner', unit: 'hornet', count: 1, everySeconds: 3.5, maxAlive: 4 },
  },
  entangle: {
    id: 'entangle', name: 'Entangle', type: 'spell', rarity: 'rare', role: 'Control', cost: 2, cooldownSec: 5, color: 0x558b2f,
    spellRadius: 2.5, spellDamage: 0,
    effect: { kind: 'root', seconds: 2.5 },
  },
  treant: {
    id: 'treant', name: 'Treant', type: 'troop', rarity: 'epic', role: 'Tank', cost: 6, cooldownSec: 14, color: 0x6d4c41,
    hp: 2195, damage: 140, hitSpeed: 1.5, range: 1.2, moveSpeed: 0.7, targets: 'ground', targetsBuildingsOnly: true,
  },
  greenwarden: {
    id: 'greenwarden', name: 'Greenwarden', type: 'troop', rarity: 'legendary', role: 'Bruiser', cost: 5, cooldownSec: 13, color: 0x33691e,
    hp: 1795, damage: 255, hitSpeed: 1.2, range: 1.2, moveSpeed: 1.1, targets: 'ground',
  },
  shieldguard: {
    id: 'shieldguard', name: 'Shieldguard', type: 'troop', rarity: 'common', role: 'Warrior', cost: 3, cooldownSec: 6, color: 0x78909c,
    hp: 760, damage: 70, hitSpeed: 1.1, range: 1.2, moveSpeed: 0.9, targets: 'ground',
  },
  crossbowman: {
    id: 'crossbowman', name: 'Crossbowman', type: 'troop', rarity: 'rare', role: 'Ranged', cost: 4, cooldownSec: 9, color: 0x5d4037,
    hp: 380, damage: 130, hitSpeed: 1, range: 5.5, moveSpeed: 1, targets: 'both',
  },
  battering_ram: {
    id: 'battering_ram', name: 'Battering Ram', type: 'troop', rarity: 'rare', role: 'Charger', cost: 4, cooldownSec: 9, color: 0x4e342e,
    hp: 940, damage: 130, hitSpeed: 1.1, range: 1.2, moveSpeed: 1.2, targets: 'ground', targetsBuildingsOnly: true,
    ability: { kind: 'charge', speedMult: 1.5, firstHitMult: 2.2 },
  },
  cannon_tower: {
    id: 'cannon_tower', name: 'Cannon Tower', type: 'building', rarity: 'common', role: 'Defense', cost: 4, cooldownSec: 8, color: 0x616161,
    hp: 465, damage: 60, hitSpeed: 0.9, range: 5.5, moveSpeed: 0, targets: 'ground', lifetimeSeconds: 30,
  },
  catapult: {
    id: 'catapult', name: 'Catapult', type: 'building', rarity: 'epic', role: 'Siege', cost: 5, cooldownSec: 12, color: 0x795548,
    hp: 540, damage: 190, hitSpeed: 2.6, range: 7.8, moveSpeed: 0, targets: 'ground', splashRadius: 1.3, lifetimeSeconds: 30,
  },
  ironclad: {
    id: 'ironclad', name: 'Ironclad', type: 'troop', rarity: 'legendary', role: 'Tank', cost: 7, cooldownSec: 16, color: 0x455a64,
    hp: 2690, damage: 175, hitSpeed: 1.5, range: 1.2, moveSpeed: 0.6, targets: 'ground', targetsBuildingsOnly: true,
  },
  fortify: {
    id: 'fortify', name: 'Fortify', type: 'spell', rarity: 'rare', role: 'Buff', cost: 3, cooldownSec: 7, color: 0xffd54a,
    spellRadius: 3, spellDamage: 0,
    effect: { kind: 'shield', amount: 320, seconds: 8 },
  },
  emberling: {
    id: 'emberling', name: 'Emberling', type: 'troop', rarity: 'common', role: 'Swarm', cost: 2, cooldownSec: 4, color: 0xff7043,
    hp: 100, damage: 65, hitSpeed: 1.1, range: 1, moveSpeed: 1.4, targets: 'ground', count: 2,
  },
  flame_knight: {
    id: 'flame_knight', name: 'Flame Knight', type: 'troop', rarity: 'rare', role: 'Warrior', cost: 4, cooldownSec: 9, color: 0xe64a19,
    hp: 1040, damage: 130, hitSpeed: 1.1, range: 1.2, moveSpeed: 1, targets: 'ground',
  },
  pyromancer: {
    id: 'pyromancer', name: 'Pyromancer', type: 'troop', rarity: 'rare', role: 'Splash', cost: 4, cooldownSec: 9, color: 0xff5722,
    hp: 265, damage: 120, hitSpeed: 1.3, range: 4.5, moveSpeed: 1, targets: 'both', splashRadius: 1.3,
  },
  forge_turret: {
    id: 'forge_turret', name: 'Forge Turret', type: 'building', rarity: 'common', role: 'Defense', cost: 4, cooldownSec: 8, color: 0xbf360c,
    hp: 465, damage: 60, hitSpeed: 0.9, range: 5.5, moveSpeed: 0, targets: 'ground', lifetimeSeconds: 30,
  },
  magmaback: {
    id: 'magmaback', name: 'Magmaback', type: 'troop', rarity: 'epic', role: 'Tank', cost: 6, cooldownSec: 14, color: 0xd84315,
    hp: 2195, damage: 140, hitSpeed: 1.5, range: 1.2, moveSpeed: 0.7, targets: 'ground', targetsBuildingsOnly: true,
  },
  infernal_hound: {
    id: 'infernal_hound', name: 'Infernal Hound', type: 'troop', rarity: 'legendary', role: 'Charger', cost: 4, cooldownSec: 11, color: 0xbf360c,
    hp: 1050, damage: 160, hitSpeed: 1.1, range: 1.2, moveSpeed: 1.3, targets: 'ground',
    ability: { kind: 'charge', speedMult: 1.6, firstHitMult: 2 },
  },
  firestorm: {
    id: 'firestorm', name: 'Firestorm', type: 'spell', rarity: 'rare', role: 'DoT', cost: 4, cooldownSec: 9, color: 0xff6d00,
    spellRadius: 2.5, spellDamage: 40,
    effect: { kind: 'zone', status: 'poison', magnitude: 32, zoneSeconds: 5 },
  },
  frostling: {
    id: 'frostling', name: 'Frostling', type: 'troop', rarity: 'common', role: 'Swarm', cost: 2, cooldownSec: 4, color: 0x81d4fa,
    hp: 65, damage: 45, hitSpeed: 1.1, range: 1, moveSpeed: 1.4, targets: 'ground', count: 3,
  },
  snowball_giant: {
    id: 'snowball_giant', name: 'Snowball Giant', type: 'troop', rarity: 'common', role: 'Charger', cost: 4, cooldownSec: 8, color: 0xe1f5fe,
    hp: 970, damage: 110, hitSpeed: 1.1, range: 1.2, moveSpeed: 1.2, targets: 'ground',
    ability: { kind: 'charge', speedMult: 1.4, firstHitMult: 1.8 },
  },
  icebreaker: {
    id: 'icebreaker', name: 'Icebreaker', type: 'troop', rarity: 'rare', role: 'Warrior', cost: 4, cooldownSec: 9, color: 0x4fc3f7,
    hp: 1040, damage: 130, hitSpeed: 1.1, range: 1.2, moveSpeed: 1, targets: 'ground',
  },
  frost_archer: {
    id: 'frost_archer', name: 'Frost Archer', type: 'troop', rarity: 'rare', role: 'Ranged', cost: 4, cooldownSec: 9, color: 0x29b6f6,
    hp: 380, damage: 130, hitSpeed: 1, range: 5, moveSpeed: 1, targets: 'both',
    ability: { kind: 'onHitStatus', status: 'slow', magnitude: 0.65, seconds: 1.5 },
  },
  glacier_wall: {
    id: 'glacier_wall', name: 'Glacier Wall', type: 'building', rarity: 'common', role: 'Defense', cost: 5, cooldownSec: 10, color: 0xb3e5fc,
    hp: 1275, damage: 0, hitSpeed: 0.9, range: 5.5, moveSpeed: 0, targets: 'ground', lifetimeSeconds: 30,
  },
  snow_yeti: {
    id: 'snow_yeti', name: 'Snow Yeti', type: 'troop', rarity: 'epic', role: 'Tank', cost: 6, cooldownSec: 14, color: 0xeceff1,
    hp: 2195, damage: 140, hitSpeed: 1.5, range: 1.2, moveSpeed: 0.7, targets: 'ground', targetsBuildingsOnly: true,
  },
  winterborn: {
    id: 'winterborn', name: 'Winterborn', type: 'troop', rarity: 'legendary', role: 'Caster', cost: 5, cooldownSec: 13, color: 0x40c4ff,
    hp: 435, damage: 225, hitSpeed: 1.3, range: 5, moveSpeed: 1, targets: 'both',
    ability: { kind: 'onHitStatus', status: 'slow', magnitude: 0.6, seconds: 2 },
  },
  blizzard: {
    id: 'blizzard', name: 'Blizzard', type: 'spell', rarity: 'rare', role: 'Slow', cost: 3, cooldownSec: 7, color: 0x81d4fa,
    spellRadius: 3, spellDamage: 60,
    effect: { kind: 'zone', status: 'slow', magnitude: 0.55, zoneSeconds: 4 },
  },
  zaplet: {
    id: 'zaplet', name: 'Zaplet', type: 'troop', rarity: 'common', role: 'Swarm', cost: 2, cooldownSec: 4, color: 0xffee58,
    hp: 100, damage: 65, hitSpeed: 1.1, range: 1, moveSpeed: 1.4, targets: 'both', count: 2,
  },
  stormcrow: {
    id: 'stormcrow', name: 'Storm Crow', type: 'troop', rarity: 'common', role: 'Air', cost: 3, cooldownSec: 6, color: 0x5c6bc0,
    hp: 115, damage: 70, hitSpeed: 1.1, range: 1, moveSpeed: 1.4, targets: 'both', count: 3, flying: true,
  },
  skylancer: {
    id: 'skylancer', name: 'Skylancer', type: 'troop', rarity: 'rare', role: 'Air', cost: 4, cooldownSec: 9, color: 0x7986cb,
    hp: 830, damage: 130, hitSpeed: 1.1, range: 1.2, moveSpeed: 1.3, targets: 'both', flying: true,
  },
  galestrike: {
    id: 'galestrike', name: 'Galestrike', type: 'spell', rarity: 'rare', role: 'Knockback', cost: 3, cooldownSec: 7, color: 0x90caf9,
    spellRadius: 3, spellDamage: 60,
    effect: { kind: 'knockback', tiles: 2.5, stunSeconds: 0.8 },
  },
  windmill_tower: {
    id: 'windmill_tower', name: 'Windmill Tower', type: 'building', rarity: 'common', role: 'Spawner', cost: 5, cooldownSec: 10, color: 0xa1887f,
    hp: 580, damage: 0, hitSpeed: 0.9, range: 5.5, moveSpeed: 0, targets: 'ground', lifetimeSeconds: 30,
    ability: { kind: 'spawner', unit: 'glider', count: 1, everySeconds: 4, maxAlive: 4 },
  },
  thunder_mage: {
    id: 'thunder_mage', name: 'Thunder Mage', type: 'troop', rarity: 'epic', role: 'Chain', cost: 5, cooldownSec: 12, color: 0xfff176,
    hp: 450, damage: 190, hitSpeed: 1.3, range: 5, moveSpeed: 1, targets: 'both',
    ability: { kind: 'chain', jumps: 2, falloff: 0.7 },
  },
  tempest_djinn: {
    id: 'tempest_djinn', name: 'Tempest Djinn', type: 'troop', rarity: 'legendary', role: 'Air', cost: 6, cooldownSec: 15, color: 0x4dd0e1,
    hp: 865, damage: 250, hitSpeed: 1, range: 5, moveSpeed: 1.2, targets: 'both', flying: true,
  },
  chain_bolt: {
    id: 'chain_bolt', name: 'Chain Bolt', type: 'spell', rarity: 'rare', role: 'Chain', cost: 2, cooldownSec: 5, color: 0xffee58,
    spellRadius: 1.5, spellDamage: 150,
    effect: { kind: 'chain', jumps: 3, falloff: 0.75 },
  },
  lancer_knight: {
    id: 'lancer_knight', name: 'Lancer Knight', type: 'troop', rarity: 'common', role: 'Charger', cost: 3, cooldownSec: 6, color: 0xfdd835,
    hp: 595, damage: 85, hitSpeed: 1.1, range: 1.2, moveSpeed: 1.4, targets: 'ground',
    ability: { kind: 'charge', speedMult: 1.5, firstHitMult: 2 },
  },
  royal_guard: {
    id: 'royal_guard', name: 'Royal Guard', type: 'troop', rarity: 'common', role: 'Warrior', cost: 4, cooldownSec: 8, color: 0xf9a825,
    hp: 925, damage: 110, hitSpeed: 1.1, range: 1.2, moveSpeed: 1, targets: 'ground',
  },
  trumpeter: {
    id: 'trumpeter', name: 'Trumpeter', type: 'troop', rarity: 'rare', role: 'Buff', cost: 3, cooldownSec: 7, color: 0xffca28,
    hp: 370, damage: 35, hitSpeed: 1.1, range: 4.5, moveSpeed: 1, targets: 'ground',
    ability: { kind: 'rageAura', radius: 3, factor: 1.25 },
  },
  crown_ballista: {
    id: 'crown_ballista', name: 'Crown Ballista', type: 'building', rarity: 'rare', role: 'Siege', cost: 4, cooldownSec: 9, color: 0xffb300,
    hp: 405, damage: 145, hitSpeed: 2.2, range: 7.8, moveSpeed: 0, targets: 'both', lifetimeSeconds: 30,
  },
  duchess: {
    id: 'duchess', name: 'Duchess', type: 'troop', rarity: 'epic', role: 'Support', cost: 5, cooldownSec: 12, color: 0xffd54a,
    hp: 540, damage: 190, hitSpeed: 1, range: 5, moveSpeed: 1, targets: 'both',
    ability: { kind: 'rageAura', radius: 2.5, factor: 1.2 },
  },
  paladin: {
    id: 'paladin', name: 'Paladin', type: 'troop', rarity: 'legendary', role: 'Bruiser', cost: 6, cooldownSec: 15, color: 0xffe082,
    hp: 2070, damage: 290, hitSpeed: 1.2, range: 1.2, moveSpeed: 1.2, targets: 'ground',
  },
  royal_decree: {
    id: 'royal_decree', name: 'Royal Decree', type: 'spell', rarity: 'rare', role: 'Rage', cost: 4, cooldownSec: 9, color: 0xffc107,
    spellRadius: 3.5, spellDamage: 0,
    effect: { kind: 'rage', factor: 1.35, seconds: 6 },
  },
  bogling: {
    id: 'bogling', name: 'Bogling', type: 'troop', rarity: 'common', role: 'Swarm', cost: 2, cooldownSec: 4, color: 0x689f38,
    hp: 65, damage: 45, hitSpeed: 1.1, range: 1, moveSpeed: 1.4, targets: 'ground', count: 3,
  },
  wraith: {
    id: 'wraith', name: 'Wraith', type: 'troop', rarity: 'rare', role: 'Assassin', cost: 3, cooldownSec: 7, color: 0x9575cd,
    hp: 395, damage: 245, hitSpeed: 1.6, range: 1.2, moveSpeed: 1.5, targets: 'both',
    ability: { kind: 'charge', speedMult: 1.2, firstHitMult: 2 },
  },
  plague_doctor: {
    id: 'plague_doctor', name: 'Plague Doctor', type: 'troop', rarity: 'rare', role: 'Poison', cost: 4, cooldownSec: 9, color: 0x7cb342,
    hp: 265, damage: 135, hitSpeed: 1.3, range: 4.5, moveSpeed: 1, targets: 'both', splashRadius: 1.3,
    ability: { kind: 'onHitStatus', status: 'poison', magnitude: 30, seconds: 3 },
  },
  bonepile: {
    id: 'bonepile', name: 'Bonepile', type: 'building', rarity: 'common', role: 'Spawner', cost: 4, cooldownSec: 8, color: 0xbdbdbd,
    hp: 465, damage: 0, hitSpeed: 0.9, range: 5.5, moveSpeed: 0, targets: 'ground', lifetimeSeconds: 30,
    ability: { kind: 'spawner', unit: 'skeleton', count: 2, everySeconds: 5, maxAlive: 6 },
  },
  necromancer: {
    id: 'necromancer', name: 'Necromancer', type: 'troop', rarity: 'epic', role: 'Spawner', cost: 5, cooldownSec: 12, color: 0x6a1b9a,
    hp: 375, damage: 190, hitSpeed: 1.3, range: 5, moveSpeed: 1, targets: 'ground',
    ability: { kind: 'spawner', unit: 'skeleton', count: 2, everySeconds: 6, maxAlive: 4 },
  },
  swamp_hulk: {
    id: 'swamp_hulk', name: 'Swamp Hulk', type: 'troop', rarity: 'epic', role: 'Tank', cost: 6, cooldownSec: 14, color: 0x33691e,
    hp: 2195, damage: 140, hitSpeed: 1.5, range: 1.2, moveSpeed: 0.7, targets: 'ground', targetsBuildingsOnly: true,
  },
  lich_king: {
    id: 'lich_king', name: 'Lich King', type: 'troop', rarity: 'legendary', role: 'Caster', cost: 6, cooldownSec: 15, color: 0x4527a0,
    hp: 505, damage: 255, hitSpeed: 1.3, range: 5.5, moveSpeed: 1, targets: 'both',
    ability: { kind: 'chain', jumps: 2, falloff: 0.75 },
  },
  venom_cloud: {
    id: 'venom_cloud', name: 'Venom Cloud', type: 'spell', rarity: 'rare', role: 'DoT', cost: 4, cooldownSec: 9, color: 0x8bc34a,
    spellRadius: 3, spellDamage: 0,
    effect: { kind: 'zone', status: 'poison', magnitude: 35, zoneSeconds: 6 },
  },
  sandling: {
    id: 'sandling', name: 'Sandling', type: 'troop', rarity: 'common', role: 'Swarm', cost: 2, cooldownSec: 4, color: 0xffcc80,
    hp: 100, damage: 65, hitSpeed: 1.1, range: 1, moveSpeed: 1.4, targets: 'ground', count: 2,
  },
  scarab_swarm: {
    id: 'scarab_swarm', name: 'Scarab Swarm', type: 'troop', rarity: 'common', role: 'Swarm', cost: 3, cooldownSec: 6, color: 0x8d6e63,
    hp: 100, damage: 65, hitSpeed: 1.1, range: 1, moveSpeed: 1.5, targets: 'ground', count: 3,
  },
  mummy_lord: {
    id: 'mummy_lord', name: 'Mummy Lord', type: 'troop', rarity: 'rare', role: 'Warrior', cost: 4, cooldownSec: 9, color: 0xd7ccc8,
    hp: 1145, damage: 130, hitSpeed: 1.1, range: 1.2, moveSpeed: 1, targets: 'ground',
  },
  oasis_shrine: {
    id: 'oasis_shrine', name: 'Oasis Shrine', type: 'building', rarity: 'common', role: 'Healer', cost: 5, cooldownSec: 10, color: 0x4dd0e1,
    hp: 580, damage: 0, hitSpeed: 0.9, range: 4.5, moveSpeed: 0, targets: 'ground', lifetimeSeconds: 30,
    ability: { kind: 'healer', healPerHit: 70, healRadius: 2 },
  },
  scorpion_queen: {
    id: 'scorpion_queen', name: 'Scorpion Queen', type: 'troop', rarity: 'epic', role: 'Ranged', cost: 5, cooldownSec: 12, color: 0xef6c00,
    hp: 540, damage: 190, hitSpeed: 1, range: 5.5, moveSpeed: 1, targets: 'both',
    ability: { kind: 'onHitStatus', status: 'poison', magnitude: 25, seconds: 2.5 },
  },
  sand_golem: {
    id: 'sand_golem', name: 'Sand Golem', type: 'troop', rarity: 'epic', role: 'Tank', cost: 6, cooldownSec: 14, color: 0xffb74d,
    hp: 2195, damage: 140, hitSpeed: 1.5, range: 1.2, moveSpeed: 0.7, targets: 'ground', targetsBuildingsOnly: true,
  },
  mirage_assassin: {
    id: 'mirage_assassin', name: 'Mirage Assassin', type: 'troop', rarity: 'legendary', role: 'Assassin', cost: 4, cooldownSec: 11, color: 0xffe0b2,
    hp: 790, damage: 445, hitSpeed: 1.6, range: 1.2, moveSpeed: 1.7, targets: 'ground',
    ability: { kind: 'charge', speedMult: 1.25, firstHitMult: 2.2 },
  },
  sandstorm: {
    id: 'sandstorm', name: 'Sandstorm', type: 'spell', rarity: 'rare', role: 'Slow', cost: 4, cooldownSec: 9, color: 0xffcc80,
    spellRadius: 3.5, spellDamage: 40,
    effect: { kind: 'zone', status: 'slow', magnitude: 0.6, zoneSeconds: 5 },
  },
  runestone: {
    id: 'runestone', name: 'Runestone', type: 'building', rarity: 'common', role: 'Defense', cost: 4, cooldownSec: 8, color: 0x7e57c2,
    hp: 465, damage: 60, hitSpeed: 0.9, range: 5.5, moveSpeed: 0, targets: 'both', lifetimeSeconds: 35,
  },
  starcaller: {
    id: 'starcaller', name: 'Starcaller', type: 'troop', rarity: 'rare', role: 'Caster', cost: 5, cooldownSec: 11, color: 0x9fa8da,
    hp: 325, damage: 165, hitSpeed: 1.3, range: 4.5, moveSpeed: 1, targets: 'both', splashRadius: 1.5,
  },
  gryphon_rider: {
    id: 'gryphon_rider', name: 'Gryphon Rider', type: 'troop', rarity: 'epic', role: 'Air', cost: 5, cooldownSec: 12, color: 0xfff59d,
    hp: 1255, damage: 185, hitSpeed: 1.1, range: 1.2, moveSpeed: 1.3, targets: 'both', flying: true,
  },
  arch_templar: {
    id: 'arch_templar', name: 'Arch Templar', type: 'troop', rarity: 'epic', role: 'Bruiser', cost: 6, cooldownSec: 14, color: 0xffecb3,
    hp: 1805, damage: 255, hitSpeed: 1.2, range: 1.2, moveSpeed: 1.1, targets: 'ground',
  },
  valkyrie_prime: {
    id: 'valkyrie_prime', name: 'Valkyrie Prime', type: 'troop', rarity: 'legendary', role: 'Splash', cost: 5, cooldownSec: 13, color: 0xf48fb1,
    hp: 1715, damage: 275, hitSpeed: 1.4, range: 1.2, moveSpeed: 1.2, targets: 'ground', splashRadius: 1.8,
  },
  titan_golem: {
    id: 'titan_golem', name: 'Titan Golem', type: 'troop', rarity: 'legendary', role: 'Tank', cost: 8, cooldownSec: 16, color: 0x90a4ae,
    hp: 2690, damage: 175, hitSpeed: 1.5, range: 1.2, moveSpeed: 0.6, targets: 'ground', targetsBuildingsOnly: true,
  },
  celestial_beam: {
    id: 'celestial_beam', name: 'Celestial Beam', type: 'spell', rarity: 'epic', role: 'Damage', cost: 6, cooldownSec: 14, color: 0xfff9c4,
    spellRadius: 2, spellDamage: 473,
  },
  worldtree_sap: {
    id: 'worldtree_sap', name: 'Worldtree Sap', type: 'spell', rarity: 'rare', role: 'Heal', cost: 3, cooldownSec: 7, color: 0xaed581,
    spellRadius: 3.5, spellDamage: 0,
    effect: { kind: 'heal', amount: 250 },
  },
};

export const ALL_CARD_IDS = Object.keys(CARDS);

/**
 * Token units spawned by spawner cards (hornets, gliders, skeletons…).
 * Deliberately OUTSIDE the collection: not in ALL_CARD_IDS, never seeded,
 * never unlockable, never in a trio — they only exist on the battlefield.
 */
export const TOKEN_UNITS: Record<string, CardDef> = {
  hornet: {
    id: 'hornet', name: 'Hornet', type: 'troop', rarity: 'common', role: 'Swarm', cost: 1, cooldownSec: 4, color: 0xffc107,
    hp: 60, damage: 40, hitSpeed: 1.0, range: 1.0, moveSpeed: 1.5, targets: 'both', flying: true, count: 1,
  },
  glider: {
    id: 'glider', name: 'Paper Glider', type: 'troop', rarity: 'common', role: 'Swarm', cost: 1, cooldownSec: 4, color: 0xb3e5fc,
    hp: 70, damage: 45, hitSpeed: 1.1, range: 1.0, moveSpeed: 1.4, targets: 'ground', flying: true, count: 1,
  },
  skeleton: {
    id: 'skeleton', name: 'Skeleton', type: 'troop', rarity: 'common', role: 'Swarm', cost: 1, cooldownSec: 4, color: 0xe0e0e0,
    hp: 65, damage: 50, hitSpeed: 1.1, range: 1.0, moveSpeed: 1.3, targets: 'ground', count: 1,
  },
};

/** The default 8-card deck handed to a new player. */
export const DEFAULT_DECK: string[] = [
  'footman', 'archers', 'colossus', 'ratpack',
  'sharpshooter', 'blademaster', 'bombthrower', 'meteor',
];

/**
 * The default battle trio (cooldown model): melee pressure + ranged support +
 * tank — the same archetype mix as the approved prototype. Also the bot's hand.
 */
export const DEFAULT_TRIO: string[] = ['footman', 'archers', 'colossus'];

export function getCard(id: string): CardDef | undefined {
  return CARDS[id] ?? TOKEN_UNITS[id];
}

/** Rarity display colors (client tint). */
export const RARITY_COLOR: Record<Rarity, number> = {
  common: 0xb0bec5,
  rare: 0xffb300,
  epic: 0xab47bc,
  legendary: 0x26c6da,
};

export function averageElixir(deck: string[]): number {
  const costs = deck.map((id) => getCard(id)?.cost ?? 0);
  const sum = costs.reduce((a, b) => a + b, 0);
  return deck.length ? Math.round((sum / deck.length) * 10) / 10 : 0;
}

/** Average recharge of a card set (hub display in the cooldown model). */
export function averageCooldown(trio: string[]): number {
  const cds = trio.map((id) => getCard(id)?.cooldownSec ?? 0);
  const sum = cds.reduce((a, b) => a + b, 0);
  return trio.length ? Math.round((sum / trio.length) * 10) / 10 : 0;
}

// --- Card progression (levels & upgrades) ---
export const MAX_CARD_LEVEL = 6;
const UPGRADE_CARDS = [0, 2, 4, 10, 20, 50]; // duplicate cards to go from index-level -> +1
const UPGRADE_GOLD = [0, 5, 20, 50, 150, 400]; // gold cost for the same step

/** Duplicate cards required to upgrade FROM the given level. Infinity at max. */
export function cardsToUpgrade(level: number): number {
  return UPGRADE_CARDS[level] ?? Infinity;
}
/** Gold required to upgrade FROM the given level. Infinity at max. */
export function goldToUpgrade(level: number): number {
  return UPGRADE_GOLD[level] ?? Infinity;
}
/** Account XP granted when a card reaches `newLevel`. */
export function xpForUpgrade(newLevel: number): number {
  return newLevel * 2;
}
/** Stat multiplier at a card level (+10% per level over 1). */
export function levelStatMultiplier(level: number): number {
  return Math.round(Math.pow(1.1, Math.max(1, level) - 1) * 1000) / 1000;
}
/** Level-scaled core stats for display/simulation. */
export function scaledStats(card: CardDef, level: number): { hp: number; damage: number; spellDamage: number } {
  const m = levelStatMultiplier(level);
  return {
    hp: Math.round((card.hp ?? 0) * m),
    damage: Math.round((card.damage ?? 0) * m),
    spellDamage: Math.round((card.spellDamage ?? 0) * m),
  };
}
