/**
 * The battle config this server process runs with. The default is the classic
 * OPEN core (cooldown economy + free-half placement, both bridges). Switching
 * cores is an ops action, not a code change — restart with, e.g.
 *   BATTLE_DEPLOYMENT=fixed-lane           (Mila's single-lane prototype)
 *   BATTLE_ECONOMY=elixir BATTLE_DEPLOYMENT=free-placement   (build-13 legacy)
 */
import {
  DEFAULT_BATTLE_CONFIG, LEGACY_BATTLE_CONFIG,
  type BattleConfig, type DeploymentMode, type EconomyMode,
} from '@croyal/shared';

export function resolveBattleConfig(env: NodeJS.ProcessEnv = process.env): BattleConfig {
  const warn = (name: string, value: string | undefined) =>
    console.warn(`[battle-config] unrecognized ${name}="${value}" — falling back to the default (open core)`);
  const economy: EconomyMode =
    env.BATTLE_ECONOMY === 'elixir' ? 'elixir'
    : env.BATTLE_ECONOMY === 'cooldown' ? 'cooldown'
    : (env.BATTLE_ECONOMY && warn('BATTLE_ECONOMY', env.BATTLE_ECONOMY), DEFAULT_BATTLE_CONFIG.economy);
  const deployment: DeploymentMode =
    env.BATTLE_DEPLOYMENT === 'free-placement' ? 'free-placement'
    : env.BATTLE_DEPLOYMENT === 'fixed-lane' ? 'fixed-lane'
    : env.BATTLE_DEPLOYMENT === 'open' ? 'open'
    : (env.BATTLE_DEPLOYMENT && warn('BATTLE_DEPLOYMENT', env.BATTLE_DEPLOYMENT), DEFAULT_BATTLE_CONFIG.deployment);
  const base = economy === 'elixir' ? LEGACY_BATTLE_CONFIG : DEFAULT_BATTLE_CONFIG;
  return { ...base, economy, deployment };
}

export const ACTIVE_BATTLE_CONFIG: BattleConfig = resolveBattleConfig();
