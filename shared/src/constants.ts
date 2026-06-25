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

// --- Clan boss raid ---
export const BOSS_RAID_SECONDS = 180;
export const BOSS_BASE_HP = 12000;
export const BOSS_BASE_DAMAGE = 120;
/** Co-op (2+ players) DOUBLES boss difficulty (HP and damage). */
export const BOSS_COOP_MULTIPLIER = 2;
export const BOSS_MAX_PLAYERS = 20; // a full clan can raid together
