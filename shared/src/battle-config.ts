/**
 * Battle-model flags (the GDD's reversibility requirement).
 *
 * Two independent switches select the battle core:
 *  - economy:    'elixir'  (shared pool, card costs)  | 'cooldown' (per-card recharge)
 *  - deployment: 'free-placement' (player picks tiles) | 'fixed-lane' (auto-march lanes)
 *
 * BOTH code paths live side-by-side in the simulation forever; rollback is a
 * config flip (server env BATTLE_ECONOMY / BATTLE_DEPLOYMENT), not a rewrite.
 */
import { ROUND_SECONDS, DOUBLE_ELIXIR_LAST_SECONDS } from './constants';

export type EconomyMode = 'elixir' | 'cooldown';
export type DeploymentMode = 'free-placement' | 'fixed-lane';

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

/** The new battle core (Mila's redesign): 3-minute match, card cooldowns, auto-march lanes. */
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

export const DEFAULT_BATTLE_CONFIG: BattleConfig = COOLDOWN_BATTLE_CONFIG;
