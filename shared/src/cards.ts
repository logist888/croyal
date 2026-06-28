/**
 * Card catalog. All cards are ORIGINAL designs (generic archetypes) — no Supercell
 * names, art or assets. This file is the source of truth for seed data.
 * See docs/CARDS.md for the human-readable catalog.
 */

export type CardType = 'troop' | 'spell' | 'building';
export type TargetKind = 'ground' | 'air' | 'both';
export type Rarity = 'common' | 'rare' | 'epic' | 'legendary';

export interface CardDef {
  id: string;
  name: string;
  type: CardType;
  rarity: Rarity;
  role: string; // short descriptor shown on the card (e.g. "Warrior", "Spell")
  cost: number; // elixir
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
}

export const CARDS: Record<string, CardDef> = {
  footman: {
    id: 'footman', name: 'Footman', type: 'troop', rarity: 'common', role: 'Warrior', cost: 3, color: 0x8d6e63,
    hp: 700, damage: 80, hitSpeed: 1.1, range: 1.2, moveSpeed: 1.0, targets: 'ground', count: 1,
  },
  archers: {
    id: 'archers', name: 'Archers', type: 'troop', rarity: 'common', role: 'Ranged', cost: 3, color: 0x66bb6a,
    hp: 130, damage: 50, hitSpeed: 1.0, range: 5.0, moveSpeed: 1.0, targets: 'both', count: 2,
  },
  colossus: {
    id: 'colossus', name: 'Colossus', type: 'troop', rarity: 'epic', role: 'Tank', cost: 6, color: 0xffa726,
    hp: 2200, damage: 130, hitSpeed: 1.5, range: 1.2, moveSpeed: 0.7, targets: 'ground', count: 1,
    targetsBuildingsOnly: true,
  },
  ratpack: {
    id: 'ratpack', name: 'Rat Pack', type: 'troop', rarity: 'common', role: 'Swarm', cost: 2, color: 0x90a4ae,
    hp: 80, damage: 55, hitSpeed: 1.1, range: 1.0, moveSpeed: 1.4, targets: 'ground', count: 3,
  },
  sharpshooter: {
    id: 'sharpshooter', name: 'Sharpshooter', type: 'troop', rarity: 'rare', role: 'Ranged', cost: 4, color: 0xef5350,
    hp: 340, damage: 110, hitSpeed: 1.0, range: 6.0, moveSpeed: 1.0, targets: 'both', count: 1,
  },
  blademaster: {
    id: 'blademaster', name: 'Blademaster', type: 'troop', rarity: 'epic', role: 'Warrior', cost: 4, color: 0xab47bc,
    hp: 600, damage: 340, hitSpeed: 1.6, range: 1.2, moveSpeed: 1.3, targets: 'ground', count: 1,
  },
  bombthrower: {
    id: 'bombthrower', name: 'Bomb Thrower', type: 'troop', rarity: 'rare', role: 'Splash', cost: 4, color: 0x5c6bc0,
    hp: 240, damage: 130, hitSpeed: 1.3, range: 4.5, moveSpeed: 1.0, targets: 'ground', count: 1,
    splashRadius: 1.5,
  },
  bastion: {
    id: 'bastion', name: 'Bastion', type: 'building', rarity: 'common', role: 'Building', cost: 5, color: 0x78909c,
    hp: 700, damage: 90, hitSpeed: 0.9, range: 5.5, moveSpeed: 0, targets: 'ground', count: 1,
    lifetimeSeconds: 30,
  },
  meteor: {
    id: 'meteor', name: 'Meteor', type: 'spell', rarity: 'epic', role: 'Spell', cost: 5, color: 0xff7043,
    spellRadius: 2.5, spellDamage: 360,
  },
  volley: {
    id: 'volley', name: 'Volley', type: 'spell', rarity: 'rare', role: 'Spell', cost: 3, color: 0x26c6da,
    spellRadius: 4.0, spellDamage: 150,
  },
};

export const ALL_CARD_IDS = Object.keys(CARDS);

/** The default 8-card deck handed to a new player. */
export const DEFAULT_DECK: string[] = [
  'footman', 'archers', 'colossus', 'ratpack',
  'sharpshooter', 'blademaster', 'bombthrower', 'meteor',
];

export function getCard(id: string): CardDef | undefined {
  return CARDS[id];
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
