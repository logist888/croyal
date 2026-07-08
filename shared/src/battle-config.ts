/**
 * Battle-model flags (the GDD's reversibility requirement).
 *
 * Two independent switches select the battle core:
 *  - economy:    'elixir'  (shared pool, card costs)  | 'cooldown' (per-card recharge)
 *  - deployment: which input + movement core drives troops:
 *      'open'           — CLASSIC Clash Royale: place anywhere on your half, units
 *                         path to the NEAREST bridge, cross, and march on the nearest
 *                         enemy tower, peeling to fight troops within aggro range.
 *                         Both bridges are used naturally. (the default)
 *      'fixed-lane'     — auto-march one lane per side (Mila's build-14 prototype).
 *      'free-placement' — build-13 legacy: place anywhere, lock the nearest enemy,
 *                         no terrain collisions (kept byte-identical for rollback).
 *
 * ALL code paths live side-by-side in the simulation forever; switching is a
 * config flip (server env BATTLE_ECONOMY / BATTLE_DEPLOYMENT), not a rewrite.
 */
import { ROUND_SECONDS, DOUBLE_ELIXIR_LAST_SECONDS } from './constants';

export type EconomyMode = 'elixir' | 'cooldown';
export type DeploymentMode = 'free-placement' | 'fixed-lane' | 'open';

export interface BattleConfig {
  economy: EconomyMode;
  deployment: DeploymentMode;
  /** Hard round cap in seconds (no overtime, no draws). */
  roundSeconds: number;
  /** Length of the accelerated final phase at the end of the round. */
  finalPhaseLastSeconds: number;
  /**
   * Cooldown time multiplier during the final phase (cooldown economy only).
   * 0.5 = cooldowns run twice as fast (the prototype's "final minute" rush).
   */
  finalCooldownMultiplier: number;
}

/**
 * The classic battle core: 3-minute match, card cooldowns, and OPEN placement —
 * tap anywhere on your half, troops path across the nearest bridge and march on
 * the nearest enemy tower. Both bridges are in play. This is the default.
 */
export const OPEN_BATTLE_CONFIG: BattleConfig = {
  economy: 'cooldown',
  deployment: 'open',
  roundSeconds: 180,
  finalPhaseLastSeconds: 60,
  finalCooldownMultiplier: 0.5,
};

/** Mila's build-14 prototype core: card cooldowns + single auto-march lane per side. */
export const COOLDOWN_BATTLE_CONFIG: BattleConfig = {
  economy: 'cooldown',
  deployment: 'fixed-lane',
  roundSeconds: 180,
  finalPhaseLastSeconds: 60,
  finalCooldownMultiplier: 0.5,
};

/** The original battle core (build-13 behavior), kept as the rollback path. */
export const LEGACY_BATTLE_CONFIG: BattleConfig = {
  economy: 'elixir',
  deployment: 'free-placement',
  roundSeconds: ROUND_SECONDS,
  finalPhaseLastSeconds: DOUBLE_ELIXIR_LAST_SECONDS,
  finalCooldownMultiplier: 1,
};

export const DEFAULT_BATTLE_CONFIG: BattleConfig = OPEN_BATTLE_CONFIG;
