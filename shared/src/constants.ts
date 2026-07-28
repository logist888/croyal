/**
 * Shared simulation constants. Single source of truth for both the authoritative
 * server simulation and the client-side prediction/rendering.
 *
 * Coordinates are in TILES. The field is ARENA_WIDTH x ARENA_HEIGHT.
 * Absolute Y axis: side "A" defends the BOTTOM (large Y), side "B" the TOP (small Y).
 * The river runs across the middle; two bridges let ground troops cross.
 */

export const TICK_RATE = 20; // server simulation ticks per second
export const TICK_DT = 1 / TICK_RATE; // seconds per tick
export const SNAPSHOT_RATE = 10; // state snapshots sent to clients per second

// --- Arena geometry (tiles) ---
export const ARENA_WIDTH = 18;
export const ARENA_HEIGHT = 30;
export const RIVER_Y = 15; // center line
export const RIVER_HALF_HEIGHT = 0.6;
export const BRIDGE_X = [4.5, 13.5] as const; // x positions of the two bridges

// --- Round timing ---
export const ROUND_SECONDS = 240; // hard cap: 4 minutes, NO overtime
export const DOUBLE_ELIXIR_LAST_SECONDS = 60; // elixir regenerates twice as fast in the last minute

// --- Elixir ---
export const ELIXIR_MAX = 10;
export const ELIXIR_START = 5;
export const ELIXIR_REGEN_SECONDS = 2.8; // seconds per 1 elixir (normal phase)

// --- Tower stats ---
export interface TowerStats {
  hp: number;
  damage: number;
  range: number; // tiles
  hitSpeed: number; // seconds between hits
}

export const KING_TOWER: TowerStats = { hp: 2400, damage: 90, range: 7, hitSpeed: 1.0 };
export const PRINCESS_TOWER: TowerStats = { hp: 1400, damage: 90, range: 7.5, hitSpeed: 0.8 };

export type Side = 'A' | 'B';
export type TowerType = 'king' | 'princessLeft' | 'princessRight';

/** Absolute tower positions per side. */
export const TOWER_POSITIONS: Record<Side, Record<TowerType, { x: number; y: number }>> = {
  A: {
    king: { x: ARENA_WIDTH / 2, y: ARENA_HEIGHT - 2 },
    princessLeft: { x: 3, y: ARENA_HEIGHT - 6 },
    princessRight: { x: ARENA_WIDTH - 3, y: ARENA_HEIGHT - 6 },
  },
  B: {
    king: { x: ARENA_WIDTH / 2, y: 2 },
    princessLeft: { x: 3, y: 6 },
    princessRight: { x: ARENA_WIDTH - 3, y: 6 },
  },
};

/** Returns the opposing side. */
export function otherSide(side: Side): Side {
  return side === 'A' ? 'B' : 'A';
}

// --- Leagues / arenas (trophy-gated). Original names. ---
export interface League {
  min: number;
  en: string;
  ru: string;
}

export const LEAGUES: League[] = [
  { min: 0, en: 'Training Camp', ru: 'Учебный лагерь' },
  { min: 100, en: 'Forest Clearing', ru: 'Лесная поляна' },
  { min: 300, en: 'Stone Fort', ru: 'Каменный форт' },
  { min: 600, en: 'Fire Forge', ru: 'Огненная кузня' },
  { min: 1000, en: 'Frost Peak', ru: 'Ледяной пик' },
  { min: 1500, en: 'Storm Arena', ru: 'Грозовая арена' },
  { min: 2200, en: 'Royal Arena', ru: 'Королевская арена' },
  { min: 3000, en: 'Legend League', ru: 'Лига легенд' },
];

export function leagueForTrophies(trophies: number): { index: number; league: League; nextMin: number | null } {
  let index = 0;
  for (let i = 0; i < LEAGUES.length; i++) if (trophies >= LEAGUES[i].min) index = i;
  const nextMin = index + 1 < LEAGUES.length ? LEAGUES[index + 1].min : null;
  return { index, league: LEAGUES[index], nextMin };
}

/**
 * The battlefield art for each league (aligned 1:1 with LEAGUES). The
 * top two leagues carry two card themes each (see unlocks.ts); the arena
 * uses the league's headline biome (royal court / legend). The marsh and
 * desert arenas ship as assets for future variety.
 */
export const LEAGUE_ARENA: string[] = [
  'arena_training',   // Training Camp
  'arena_forest',     // Forest Clearing
  'arena_stonefort',  // Stone Fort
  'arena_fireforge',  // Fire Forge
  'arena_frostpeak',  // Frost Peak
  'arena_storm',      // Storm Arena
  'arena_royal',      // Royal Arena
  'arena_legend',     // Legend League
];

/** The arena id a player battles on, chosen by their current league. */
export function arenaForTrophies(trophies: number): string {
  return LEAGUE_ARENA[leagueForTrophies(trophies).index] ?? 'arena_training';
}

/** Account/"king" level derived from wins (legacy; superseded by levelFromXp). */
export function accountLevel(wins: number): number {
  return Math.max(1, Math.floor(wins / 2) + 1);
}

/** Account "king" level from accumulated XP (XP comes from card upgrades). */
export function levelFromXp(xp: number): number {
  let lvl = 1;
  let need = 10;
  let rem = Math.max(0, xp);
  while (rem >= need && lvl < 50) {
    rem -= need;
    lvl += 1;
    need = 10 * lvl;
  }
  return lvl;
}

/** Level + progress within the current level, for an XP bar. */
export function xpProgress(xp: number): { level: number; into: number; need: number } {
  let lvl = 1;
  let need = 10;
  let rem = Math.max(0, xp);
  while (rem >= need && lvl < 50) {
    rem -= need;
    lvl += 1;
    need = 10 * lvl;
  }
  return { level: lvl, into: rem, need };
}

/** Max crowns per side (2 princess + 1 king). */
export const MAX_CROWNS = 3;

// --- Fixed-lane deployment (cooldown battle model) ---
/** Active battle cards per player in the cooldown model (the "battle trio"). */
export const TRIO_SIZE = 3;

/**
 * Each side attacks along its own RIGHT lane (mirrored: the enemy arrives on
 * your left). Spawn x sits exactly on that lane's bridge so the march path
 * runs straight over it.
 */
export const LANE_SPAWN: Record<Side, { x: number; y: number }> = {
  A: { x: BRIDGE_X[1], y: ARENA_HEIGHT * 0.76 },
  B: { x: BRIDGE_X[0], y: ARENA_HEIGHT * 0.24 },
};

/**
 * Fixed-lane BUILDING spot: center-front of your own half, where a defensive
 * building's range covers the enemy's incoming lane (buildings at the troop
 * lane spawn would cover nothing — enemy traffic uses the mirrored lane).
 */
export const LANE_BUILDING_SPAWN: Record<Side, { x: number; y: number }> = {
  A: { x: ARENA_WIDTH / 2, y: RIVER_Y + 5 },
  B: { x: ARENA_WIDTH / 2, y: RIVER_Y - 5 },
};

/** The enemy princess tower a side's lane march heads for (before the king). */
export function laneTargetTower(side: Side): { enemySide: Side; towerType: TowerType } {
  return side === 'A'
    ? { enemySide: 'B', towerType: 'princessRight' }
    : { enemySide: 'A', towerType: 'princessLeft' };
}

/** Lane-width x-window within which marching units naturally engage enemies (tiles). */
export const ENGAGE_X_WINDOW = 2;
/** Body radii used for attack reach and "never step inside a tower" collisions. */
export const UNIT_BODY_RADIUS = 0.4;
export const TOWER_BODY_RADIUS: Record<'king' | 'princess', number> = { king: 1.1, princess: 0.9 };
export function towerBodyRadius(towerType: TowerType): number {
  return towerType === 'king' ? TOWER_BODY_RADIUS.king : TOWER_BODY_RADIUS.princess;
}

// --- Bot pacing in the cooldown model (prototype anchors) ---
export const BOT_PLAY_INTERVAL_SECONDS = 4.5;
export const BOT_PLAY_INTERVAL_FINAL_SECONDS = 2.7;
export const BOT_PLAY_JITTER_SECONDS = 1.0;

// --- Clan boss raid ---
export const BOSS_RAID_SECONDS = 180;
export const BOSS_BASE_HP = 12000;
export const BOSS_BASE_DAMAGE = 120;
export const BOSS_MAX_PLAYERS = 20; // a full clan can raid together
/**
 * Difficulty (HP/damage multiplier) by participant count. A large clan
 * raiding together used to face the exact same boss as a two-person raid —
 * this scales it so a full 20-person raid stays a real fight instead of a
 * trivial pile-on. Read as "at least `min` participants -> `mult`"; the last
 * matching entry wins.
 */
export const BOSS_DIFFICULTY_TIERS: Array<{ min: number; mult: number }> = [
  { min: 1, mult: 1.0 },
  { min: 2, mult: 1.6 },
  { min: 4, mult: 2.4 },
  { min: 7, mult: 3.2 },
  { min: 11, mult: 4.2 },
  { min: 16, mult: 5.2 },
];
/**
 * Cooldown economy: raider card cooldowns are stretched in boss raids as the
 * difficulty lever. The ONLY allowed cooldown asymmetry — there is no human
 * opponent in a raid, so fairness (symmetric PvP cooldowns) is preserved.
 */
export const BOSS_RAIDER_COOLDOWN_MULT = 1.5;
