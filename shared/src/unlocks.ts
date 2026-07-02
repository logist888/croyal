/**
 * Card unlocks by league (arena progression, original-game style).
 *
 * Each of the 10 card themes is tied to one of the 8 LEAGUES (themes 1-6 map
 * 1:1 by name; the top two leagues each carry two themes). Cards unlock when
 * the player's trophies reach the league threshold; battle-chest drops only
 * come from unlocked cards; the trio may only contain unlocked cards
 * (validated on set — a later trophy drop never breaks an existing trio).
 *
 * Everyone still OWNS every card at level 1 (seeding unchanged) — the lock
 * gates USE and DROPS, not ownership, so upgrades keep working.
 */
import { LEAGUES } from './constants';
import { ALL_CARD_IDS } from './cards';
import { DEFAULT_DECK, DEFAULT_TRIO } from './cards';
import { STARTER_POOL } from './pairs';

export interface ThemeUnlock {
  theme: string;
  /** Index into LEAGUES whose `min` trophies unlock the theme. */
  leagueIndex: number;
  cardIds: string[];
}

export const THEMES: ThemeUnlock[] = [
  {
    theme: 'Training Grounds', leagueIndex: 0,
    cardIds: ['footman', 'recruit', 'archers', 'ratpack', 'bombthrower', 'sharpshooter', 'bastion', 'volley'],
  },
  {
    theme: 'Forest Clearing', leagueIndex: 1,
    cardIds: ['thornling', 'wolfpack', 'boarrider', 'druidess', 'beehive', 'entangle', 'treant', 'greenwarden'],
  },
  {
    theme: 'Stone Fort', leagueIndex: 2,
    cardIds: ['shieldguard', 'crossbowman', 'battering_ram', 'cannon_tower', 'catapult', 'colossus', 'ironclad', 'fortify'],
  },
  {
    theme: 'Fire Forge', leagueIndex: 3,
    cardIds: ['emberling', 'flame_knight', 'pyromancer', 'forge_turret', 'magmaback', 'meteor', 'infernal_hound', 'firestorm'],
  },
  {
    theme: 'Frost Peak', leagueIndex: 4,
    cardIds: ['frostling', 'snowball_giant', 'icebreaker', 'frost_archer', 'glacier_wall', 'snow_yeti', 'winterborn', 'blizzard'],
  },
  {
    theme: 'Storm Arena', leagueIndex: 5,
    cardIds: ['zaplet', 'stormcrow', 'skylancer', 'galestrike', 'windmill_tower', 'thunder_mage', 'tempest_djinn', 'chain_bolt'],
  },
  {
    theme: 'Royal Court', leagueIndex: 6,
    cardIds: ['lancer_knight', 'royal_guard', 'trumpeter', 'crown_ballista', 'blademaster', 'duchess', 'paladin', 'royal_decree'],
  },
  {
    theme: 'Shadow Marsh', leagueIndex: 6, // doubled up with Royal Court
    cardIds: ['bogling', 'wraith', 'plague_doctor', 'bonepile', 'necromancer', 'swamp_hulk', 'lich_king', 'venom_cloud'],
  },
  {
    theme: 'Desert Sands', leagueIndex: 7, // doubled up with Legend League
    cardIds: ['sandling', 'scarab_swarm', 'mummy_lord', 'oasis_shrine', 'scorpion_queen', 'sand_golem', 'mirage_assassin', 'sandstorm'],
  },
  {
    theme: 'Legend League', leagueIndex: 7,
    cardIds: ['runestone', 'starcaller', 'gryphon_rider', 'arch_templar', 'valkyrie_prime', 'titan_golem', 'celestial_beam', 'worldtree_sap'],
  },
];

/**
 * Cards that are always available regardless of trophies: everything the
 * onboarding, default trio and legacy default deck hand out. Without this,
 * a brand-new account would hold LOCKED cards (colossus/meteor/blademaster
 * live in higher-league themes).
 */
export const ALWAYS_UNLOCKED: ReadonlySet<string> = new Set([
  ...STARTER_POOL, ...DEFAULT_TRIO, ...DEFAULT_DECK,
]);

const CARD_LEAGUE = new Map<string, number>();
for (const t of THEMES) {
  for (const id of t.cardIds) CARD_LEAGUE.set(id, t.leagueIndex);
}

/** LEAGUES index at which a card unlocks (0 = available from the start). */
export function unlockLeagueIndex(cardId: string): number {
  if (ALWAYS_UNLOCKED.has(cardId)) return 0;
  return CARD_LEAGUE.get(cardId) ?? 0;
}

export function isCardUnlocked(cardId: string, trophies: number): boolean {
  return trophies >= LEAGUES[unlockLeagueIndex(cardId)].min;
}

/** All unlocked card ids at a trophy count, in stable catalog order. */
export function unlockedCards(trophies: number): string[] {
  return ALL_CARD_IDS.filter((id) => isCardUnlocked(id, trophies));
}
