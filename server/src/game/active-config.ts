/**
 * The battle config this server process runs with. Rollback to the legacy
 * core is an ops action, not a code change: restart with
 *   BATTLE_ECONOMY=elixir BATTLE_DEPLOYMENT=free-placement
 */
import {
  COOLDOWN_BATTLE_CONFIG, LEGACY_BATTLE_CONFIG,
  type BattleConfig, type DeploymentMode, type EconomyMode,
} from '@croyal/shared';

export function resolveBattleConfig(env: NodeJS.ProcessEnv = process.env): BattleConfig {
  const warn = (name: string, value: string | undefined) =>
    console.warn(`[battle-config] unrecognized ${name}="${value}" — falling back to the default (cooldown core)`);
  const economy: EconomyMode =
    env.BATTLE_ECONOMY === 'elixir' ? 'elixir'
    : env.BATTLE_ECONOMY === 'cooldown' ? 'cooldown'
    : (env.BATTLE_ECONOMY && warn('BATTLE_ECONOMY', env.BATTLE_ECONOMY), COOLDOWN_BATTLE_CONFIG.economy);
  const deployment: DeploymentMode =
    env.BATTLE_DEPLOYMENT === 'free-placement' ? 'free-placement'
    : env.BATTLE_DEPLOYMENT === 'fixed-lane' ? 'fixed-lane'
    : (env.BATTLE_DEPLOYMENT && warn('BATTLE_DEPLOYMENT', env.BATTLE_DEPLOYMENT), COOLDOWN_BATTLE_CONFIG.deployment);
  const base = economy === 'elixir' ? LEGACY_BATTLE_CONFIG : COOLDOWN_BATTLE_CONFIG;
  return { ...base, economy, deployment };
}

export const ACTIVE_BATTLE_CONFIG: BattleConfig = resolveBattleConfig();
